/**
 * InboundCallSession
 *
 * One instance per active inbound phone call.
 * Owns the Deepgram STT connection, LLM service, and TTS service.
 *
 * Flow:
 *   Twilio Media Stream WS → sendAudio()
 *     → DeepgramService → "interim" / "final" / "utteranceEnd" events
 *       → InboundLlmService.streamReply() → sentence generator
 *         → InboundTtsService.streamAudio() → μ-law audio stream
 *           → mediaWs.send() back to Twilio
 *
 * Barge-in: if the caller speaks while the bot is talking, cancel the
 * current TTS/LLM loop and send a Twilio "clear" message immediately.
 *
 * DB persistence:
 *   - Each user utterance → incoming_messages (userType="user")
 *   - Each bot reply      → incoming_messages (userType="bot")
 */

const { DeepgramService } = require("./deepgramService");
const { InboundLlmService } = require("./inboundLlmService");
const { InboundTtsService } = require("./inboundTtsService");
const { saveIncomingMessageRow } = require("./callPersistenceService");

const INTERIM_FLUSH_CHARS = parseInt(process.env.INTERIM_FLUSH_CHARS || "120");

class InboundCallSession {
  /**
   * @param {string} callSid
   * @param {import("ws").WebSocket} ws  – Twilio Media Stream WebSocket
   * @param {{
   *   clinicPrompt: string|null,
   *   knowledgePrompt: string|null,
   *   elApiKey: string|null,
   *   elVoiceId: string|null,
   *   call: object|null,
   *   greetingText: string
   * }} opts
   */
  constructor(callSid, ws, opts = {}) {
    this.callSid = callSid;
    this.ws = ws;
    this.call = opts.call || null;
    this.greetingText = opts.greetingText || "";

    this.stt = new DeepgramService(callSid);
    this.llm = new InboundLlmService(callSid, {
      clinicPrompt: opts.clinicPrompt || null,
      knowledgePrompt: opts.knowledgePrompt || null,
    });
    this.tts = new InboundTtsService(callSid, opts.elApiKey || null, opts.elVoiceId || null);

    this.isBotSpeaking = false;
    this.isProcessing = false;
    this.cancelFlag = false;
    this.streamSid = null;

    this.partialTranscript = "";
    this.earlyFlushTriggered = false;
    /** When true, STT must not start the LLM pipeline (avoids canceling greeting TTS). */
    this._greetingActive = false;

    this._bindSTTEvents();
  }

  // ─── Lifecycle ─────────────────────────────────────────────────────────────

  async start() {
    // 1. Play greeting FIRST before connecting Deepgram.
    //    This ensures: (a) no STT noise cancels the greeting, (b) the large
    //    audio queue that builds up during greeting playback is discarded before
    //    Deepgram opens (prevents stale silence/echo from confusing the STT).
    if (this.greetingText) {
      try {
        await this._speakGreeting();
      } catch (err) {
        console.error(`[InboundSession] greeting failed callSid=${this.callSid}: ${err.message}`);
      }
    }

    // 2. Discard audio that queued while the greeting was playing.
    //    That audio is silence/echo from the caller's side while they were
    //    listening — it should not be sent to Deepgram.
    this.stt.clearQueue();

    // 3. Now connect Deepgram; new audio from the caller's speech will flow in.
    await this.stt.connect();
    console.log(`[InboundSession] started callSid=${this.callSid}`);
  }

  close() {
    this.stt.close();
    console.log(`[InboundSession] closed callSid=${this.callSid}`);
  }

  setStreamSid(streamSid) {
    this.streamSid = streamSid;
  }

  // ─── Audio ingress ─────────────────────────────────────────────────────────

  sendAudio(audioBuffer) {
    // Never barge-in during the greeting — Twilio sends silence/noise frames
    // immediately on stream open and would cancel the greeting before it plays.
    if (this.isBotSpeaking && !this._greetingActive) {
      this._handleBargeIn();
    }
    this.stt.sendAudio(audioBuffer);
  }

  // ─── Greeting ──────────────────────────────────────────────────────────────

  async _speakGreeting() {
    this._greetingActive = true;
    this.cancelFlag = false;
    this.isBotSpeaking = false;

    try {
      console.log(
        `[InboundSession] greeting start callSid=${this.callSid} streamSid=${this.streamSid}`
      );
      // Send the ENTIRE greeting as a single TTS call — no sentence splitting.
      // Multiple API calls create audible silence gaps between sentences and
      // introduce more failure points.  A single streaming call is simpler and
      // plays the greeting continuously without gaps.
      await this._streamTTSToTwilio(this.greetingText);
      console.log(`[InboundSession] greeting done callSid=${this.callSid}`);

      if (this.call) {
        saveIncomingMessageRow({
          callId: this.call.id,
          audio: null,
          transcription: this.greetingText,
          userType: "bot",
          status: "success",
        }).catch(() => {});
      }
    } finally {
      this._greetingActive = false;
      this.isBotSpeaking = false;
    }
  }

  // ─── STT event bindings ────────────────────────────────────────────────────

  _bindSTTEvents() {
    this.stt.on("interim", (transcript) => {
      if (this._greetingActive) return;

      this.partialTranscript = transcript;

      if (!this.earlyFlushTriggered && transcript.length >= INTERIM_FLUSH_CHARS) {
        console.log(
          `[InboundSession] early flush at ${transcript.length} chars callSid=${this.callSid}`
        );
        this.earlyFlushTriggered = true;
        this._runPipeline(transcript);
      }
    });

    this.stt.on("final", (transcript) => {
      if (this._greetingActive) return;

      console.log(`[InboundSession] STT final="${transcript}" callSid=${this.callSid}`);
      if (!transcript?.trim()) return;

      this.partialTranscript = "";
      this.earlyFlushTriggered = false;

      // Always run the pipeline on a final transcript.
      // If a pipeline is already running from an early flush, _runPipeline
      // cancels it and restarts with the complete text.
      this._runPipeline(transcript);
    });

    this.stt.on("utteranceEnd", () => {
      if (this._greetingActive) return;

      const text = this.partialTranscript.trim();
      if (text && !this.isProcessing) {
        console.log(
          `[InboundSession] utteranceEnd safety flush text="${text}" callSid=${this.callSid}`
        );
        this.partialTranscript = "";
        this.earlyFlushTriggered = false;
        this._runPipeline(text);
      }
    });

    this.stt.on("error", (err) => {
      console.error(
        `[InboundSession] STT error callSid=${this.callSid}: ${err?.message ?? err}`
      );
    });
  }

  // ─── Main LLM → TTS pipeline ───────────────────────────────────────────────

  async _runPipeline(userText) {
    if (this.isProcessing) {
      this._cancelPipeline();
      await sleep(50);
    }

    this.isProcessing = true;
    this.cancelFlag = false;
    this.isBotSpeaking = false;

    if (this.call) {
      saveIncomingMessageRow({
        callId: this.call.id,
        audio: null,
        transcription: userText,
        userType: "user",
        status: "success",
      }).catch(() => {});
    }

    try {
      console.log(
        `[InboundSession] pipeline start callSid=${this.callSid} text="${userText.slice(0, 60)}"`
      );
      const t0 = Date.now();
      let fullBotReply = "";
      let firstSentence = true;

      for await (const sentence of this.llm.streamReply(userText)) {
        if (this.cancelFlag) {
          console.log(`[InboundSession] pipeline cancelled callSid=${this.callSid}`);
          break;
        }

        if (firstSentence) {
          console.log(
            `[InboundSession] time-to-first-audio: ${Date.now() - t0}ms callSid=${this.callSid}`
          );
          firstSentence = false;
        }

        fullBotReply += (fullBotReply ? " " : "") + sentence;
        await this._streamTTSToTwilio(sentence);

        if (this.cancelFlag) break;
      }

      if (this.call && fullBotReply) {
        saveIncomingMessageRow({
          callId: this.call.id,
          audio: null,
          transcription: fullBotReply,
          userType: "bot",
          status: "success",
        }).catch(() => {});
      }
    } catch (err) {
      console.error(
        `[InboundSession] pipeline error callSid=${this.callSid}: ${err.message}`
      );
    } finally {
      this.isProcessing = false;
      this.isBotSpeaking = false;
    }
  }

  // ─── TTS → Twilio WebSocket ────────────────────────────────────────────────

  async _streamTTSToTwilio(text) {
    if (this.cancelFlag || !text?.trim()) return;

    console.log(
      `[InboundSession] TTS start callSid=${this.callSid} text="${text.slice(0, 60)}"`
    );

    const audioStream = await this.tts.streamAudio(text);
    if (!audioStream) {
      console.warn(`[InboundSession] TTS returned null stream callSid=${this.callSid}`);
      return;
    }

    this.isBotSpeaking = true;
    let chunkCount = 0;

    try {
      // Path A: web ReadableStream (from ElevenLabs native fetch on Node 18+).
      // Use getReader() directly — most reliable for WHATWG ReadableStream.
      if (typeof audioStream.getReader === "function") {
        const reader = audioStream.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (this.cancelFlag) break;
            if (this.ws.readyState !== 1 /* OPEN */) break;
            if (!value || !value.length) continue;
            const buf = Buffer.from(value);
            this.ws.send(
              JSON.stringify({
                event: "media",
                streamSid: this.streamSid,
                media: { payload: buf.toString("base64") },
              })
            );
            chunkCount++;
          }
        } finally {
          try { reader.releaseLock(); } catch { /* ignore */ }
        }
        console.log(
          `[InboundSession] TTS done (getReader) chunks=${chunkCount} callSid=${this.callSid}`
        );
        return;
      }

      // Path B: Node.js async iterable (Readable.fromWeb, Readable.from, etc.)
      if (typeof audioStream[Symbol.asyncIterator] === "function") {
        for await (const chunk of audioStream) {
          if (this.cancelFlag) break;
          if (this.ws.readyState !== 1 /* OPEN */) break;
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          if (!buf.length) continue;
          this.ws.send(
            JSON.stringify({
              event: "media",
              streamSid: this.streamSid,
              media: { payload: buf.toString("base64") },
            })
          );
          chunkCount++;
        }
        console.log(
          `[InboundSession] TTS done (asyncIterator) chunks=${chunkCount} callSid=${this.callSid}`
        );
        return;
      }

      // Path C: legacy Node.js Readable with .on("data") events.
      await new Promise((resolve) => {
        audioStream.on("data", (chunk) => {
          if (this.cancelFlag) {
            audioStream.destroy?.();
            resolve();
            return;
          }
          if (this.ws.readyState === 1 /* OPEN */) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            if (buf.length > 0) {
              this.ws.send(
                JSON.stringify({
                  event: "media",
                  streamSid: this.streamSid,
                  media: { payload: buf.toString("base64") },
                })
              );
              chunkCount++;
            }
          }
        });
        audioStream.on("end", () => {
          console.log(
            `[InboundSession] TTS done (on-data) chunks=${chunkCount} callSid=${this.callSid}`
          );
          resolve();
        });
        audioStream.on("error", (err) => {
          console.warn(
            `[InboundSession] TTS stream error callSid=${this.callSid}: ${err.message}`
          );
          resolve();
        });
      });
    } finally {
      this.isBotSpeaking = false;
    }
  }

  // ─── Barge-in & cancellation ───────────────────────────────────────────────

  _handleBargeIn() {
    if (!this.isBotSpeaking || this._greetingActive) return;
    console.log(`[InboundSession] barge-in detected callSid=${this.callSid}`);
    this._cancelPipeline();
    this._clearTwilioAudio();
  }

  _cancelPipeline() {
    this.cancelFlag = true;
    this.isBotSpeaking = false;
  }

  _clearTwilioAudio() {
    if (this.ws.readyState === 1 && this.streamSid) {
      this.ws.send(JSON.stringify({ event: "clear", streamSid: this.streamSid }));
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { InboundCallSession };
