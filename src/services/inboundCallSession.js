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
    // Play greeting before opening Deepgram so (1) Twilio outbound audio is not
    // competing with the STT websocket handshake and (2) early mic frames still
    // queue in DeepgramService once connect runs.
    if (this.greetingText) {
      try {
        await this._speakGreeting();
      } catch (err) {
        console.error(`[InboundSession] greeting failed callSid=${this.callSid}: ${err.message}`);
      }
    }
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
    // Do NOT set isProcessing here — while greeting runs, Deepgram may emit
    // interim/final noise; _runPipeline() would see isProcessing and call
    // _cancelPipeline(), setting cancelFlag and killing greeting audio.
    this._greetingActive = true;
    this.cancelFlag = false;
    this.isBotSpeaking = false;

    try {
      const sentences = splitIntoSentences(this.greetingText);
      console.log(`[InboundSession] greeting start callSid=${this.callSid} sentences=${sentences.length} streamSid=${this.streamSid}`);
      for (const sentence of sentences) {
        if (this.cancelFlag) {
          console.log(`[InboundSession] greeting cancelled early callSid=${this.callSid}`);
          break;
        }
        await this._streamTTSToTwilio(sentence);
      }
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

      if (!transcript?.trim()) return;
      this.partialTranscript = "";

      if (this.earlyFlushTriggered) {
        this.earlyFlushTriggered = false;
        if (this.isProcessing) {
          console.log(
            `[InboundSession] final received but pipeline already running — skipping callSid=${this.callSid}`
          );
          return;
        }
      }

      this.earlyFlushTriggered = false;
      this._runPipeline(transcript);
    });

    this.stt.on("utteranceEnd", () => {
      if (this._greetingActive) return;

      if (this.partialTranscript.trim() && !this.isProcessing) {
        console.log(`[InboundSession] utteranceEnd safety flush callSid=${this.callSid}`);
        const text = this.partialTranscript;
        this.partialTranscript = "";
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

    const audioStream = await this.tts.streamAudio(text);
    if (!audioStream) return;

    this.isBotSpeaking = true;

    try {
      // Prefer async iteration so chunks are not missed if the stream emits
      // before legacy .on("data") listeners attach.
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
        }
        return;
      }

      await new Promise((resolve) => {
        audioStream.on("data", (chunk) => {
          if (this.cancelFlag) {
            audioStream.destroy();
            resolve();
            return;
          }
          if (this.ws.readyState === 1 /* OPEN */) {
            const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            this.ws.send(
              JSON.stringify({
                event: "media",
                streamSid: this.streamSid,
                media: { payload: buf.toString("base64") },
              })
            );
          }
        });

        audioStream.on("end", () => resolve());

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

function splitIntoSentences(text) {
  const s = String(text || "").trim();
  if (!s) return [];
  return s.split(/(?<=[.!?])\s+/).filter(Boolean);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { InboundCallSession };
