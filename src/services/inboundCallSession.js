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
    // Monotonic counter: incremented on every new pipeline run and on every
    // cancel.  Each pipeline run stores its generation at start time and checks
    // it on every await point so that a stale run exits immediately even if
    // cancelFlag was already reset by the new run.
    this._pipelineGen = 0;

    this.partialTranscript = "";
    this.earlyFlushTriggered = false;
    /** When true, STT must not start the LLM pipeline (avoids canceling greeting TTS). */
    this._greetingActive = false;
    /**
     * Guard against the race where the WebSocket message handler emits
     * concurrent `media` event invocations while `session.start()` is still
     * awaiting (greeting playback + Deepgram handshake).  Those frames
     * represent silence/echo captured during the greeting — sending them to
     * Deepgram after connect causes it to fire spurious speech_final events
     * that cancel the first real user pipeline before TTS can play.
     * Set to true only after start() completes.
     */
    this._startupComplete = false;

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

    // 4. Mark the session ready.  Any media frames that arrived from Twilio
    //    while we were awaiting start() were silently dropped (see sendAudio).
    //    From this point on, sendAudio forwards audio to Deepgram in real time.
    this._startupComplete = true;
    console.log(`[InboundSession] startup complete — audio active callSid=${this.callSid}`);
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
    // Drop all audio that arrives before start() completes.
    // The WebSocket message handler is async: while start() is awaiting
    // (greeting + Deepgram connect, ~3-5 s), Twilio keeps sending media events
    // as concurrent handler invocations.  Those frames are greeting-period
    // silence/echo that would confuse Deepgram's VAD if forwarded.
    if (!this._startupComplete) return;

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
    // Cancel any running pipeline immediately.
    if (this.isProcessing) {
      this._cancelPipeline(); // also increments _pipelineGen
    }

    // Claim this run's generation AFTER the possible cancel above.
    const myGen = ++this._pipelineGen;

    // Short pause so the previous pipeline's awaiting operations can detect
    // the stale generation and exit cleanly before we reset shared flags.
    await sleep(80);

    // If another _runPipeline was called while we were sleeping, bail out.
    if (myGen !== this._pipelineGen) {
      console.log(
        `[InboundSession] pipeline gen-superseded gen=${myGen} current=${this._pipelineGen} callSid=${this.callSid}`
      );
      return;
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
        `[InboundSession] pipeline start callSid=${this.callSid} gen=${myGen} text="${userText.slice(0, 60)}"`
      );
      const t0 = Date.now();
      let fullBotReply = "";
      let sentenceIdx = 0;

      for await (const sentence of this.llm.streamReply(userText)) {
        sentenceIdx++;
        console.log(
          `[InboundSession] LLM sentence #${sentenceIdx} callSid=${this.callSid} gen=${myGen} text="${sentence.slice(0, 80)}"`
        );

        if (this.cancelFlag || myGen !== this._pipelineGen) {
          console.log(
            `[InboundSession] pipeline cancelled before TTS gen=${myGen} cancelFlag=${this.cancelFlag} currentGen=${this._pipelineGen} callSid=${this.callSid}`
          );
          break;
        }

        if (sentenceIdx === 1) {
          console.log(
            `[InboundSession] time-to-first-sentence: ${Date.now() - t0}ms callSid=${this.callSid}`
          );
        }

        fullBotReply += (fullBotReply ? " " : "") + sentence;
        await this._streamTTSToTwilio(sentence, myGen);

        if (this.cancelFlag || myGen !== this._pipelineGen) {
          console.log(
            `[InboundSession] pipeline cancelled after TTS gen=${myGen} cancelFlag=${this.cancelFlag} currentGen=${this._pipelineGen} callSid=${this.callSid}`
          );
          break;
        }
      }

      if (sentenceIdx === 0) {
        console.warn(`[InboundSession] LLM yielded NO sentences callSid=${this.callSid}`);
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

  /**
   * Stream TTS audio to the Twilio WebSocket.
   * @param {string} text
   * @param {number|null} pipelineGen  Pass the caller's generation ID so the
   *   function exits immediately when a newer pipeline supersedes this one.
   *   Pass null (or omit) only from _speakGreeting, which is protected by the
   *   _greetingActive flag instead.
   */
  async _streamTTSToTwilio(text, pipelineGen = null) {
    // isStale: true when this operation belongs to a cancelled/superseded pipeline
    const isStale = () =>
      this.cancelFlag || (pipelineGen !== null && pipelineGen !== this._pipelineGen);

    if (isStale() || !text?.trim()) {
      console.log(
        `[InboundSession] TTS skipped callSid=${this.callSid} gen=${pipelineGen} stale=${isStale()} emptyText=${!text?.trim()}`
      );
      return;
    }

    console.log(
      `[InboundSession] TTS start callSid=${this.callSid} gen=${pipelineGen} text="${text.slice(0, 60)}"`
    );

    const audioStream = await this.tts.streamAudio(text);

    // Re-check staleness after the ElevenLabs API call (which can take 300ms+)
    if (isStale()) {
      console.log(
        `[InboundSession] TTS discarded stale after ElevenLabs call gen=${pipelineGen} currentGen=${this._pipelineGen} cancelFlag=${this.cancelFlag} callSid=${this.callSid}`
      );
      return;
    }

    if (!audioStream) {
      console.warn(`[InboundSession] TTS returned null stream callSid=${this.callSid}`);
      return;
    }

    this.isBotSpeaking = true;
    let chunkCount = 0;

    console.log(
      `[InboundSession] TTS streaming start streamSid=${this.streamSid} wsState=${this.ws.readyState} callSid=${this.callSid}`
    );

    try {
      // Path A: web ReadableStream (from ElevenLabs native fetch on Node 18+).
      // Use getReader() directly — most reliable for WHATWG ReadableStream.
      if (typeof audioStream.getReader === "function") {
        const reader = audioStream.getReader();
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (isStale()) break;
            if (this.ws.readyState !== 1 /* OPEN */) {
              console.warn(`[InboundSession] WS not open (state=${this.ws.readyState}) while streaming TTS callSid=${this.callSid}`);
              break;
            }
            if (!value || !value.length) continue;
            if (chunkCount === 0) {
              console.log(`[InboundSession] TTS first chunk received gen=${pipelineGen} streamSid=${this.streamSid} callSid=${this.callSid}`);
            }
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
          if (isStale()) break;
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
          if (isStale()) {
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
    console.log(
      `[InboundSession] _cancelPipeline oldGen=${this._pipelineGen} callSid=${this.callSid}`
    );
    this.cancelFlag = true;
    this.isBotSpeaking = false;
    this._pipelineGen++; // invalidates all in-flight _streamTTSToTwilio calls
  }

  _clearTwilioAudio() {
    if (this.ws.readyState === 1 && this.streamSid) {
      this.ws.send(JSON.stringify({ event: "clear", streamSid: this.streamSid }));
    }
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = { InboundCallSession };
