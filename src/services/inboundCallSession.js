/**
 * InboundCallSession
 *
 * One instance per active inbound phone call.
 * Owns the Deepgram STT connection, LLM service, and TTS service.
 *
 * Flow:
 *   Twilio Media Stream WS → sendAudio()
 *     → DeepgramService → "interim" / "final" / "utteranceEnd" events
 *       → optional end-call classifier → farewell TTS + Twilio REST hangup
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
const { analyzeInboundEndCallTurn } = require("./openaiService");
const { endCall } = require("./twilioService");

const INTERIM_FLUSH_CHARS = Math.max(
  12,
  parseInt(process.env.INTERIM_FLUSH_CHARS || "36", 10)
);
const PIPELINE_HANDOFF_MS = Math.max(
  0,
  parseInt(process.env.INBOUND_PIPELINE_HANDOFF_MS || "20", 10)
);
const END_CALL_HEAD_START_MS = Math.max(
  0,
  parseInt(process.env.INBOUND_END_CALL_HEAD_START_MS || "40", 10)
);

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
   *   greetingText: string,
   *   clinicId: number|null
   * }} opts
   */
  constructor(callSid, ws, opts = {}) {
    this.callSid = callSid;
    this.ws = ws;
    this.call = opts.call || null;
    this.greetingText = opts.greetingText || "";
    const cid = Number(opts.clinicId);
    this.clinicId = Number.isFinite(cid) && cid > 0 ? cid : null;
    this.clinicPrompt = opts.clinicPrompt || null;
    this.knowledgePrompt = opts.knowledgePrompt || null;

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
      } catch {
        /* greeting playback failed — continue without blocking startup */
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
  }

  close() {
    this.stt.close();
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

    // NOTE: barge-in is handled by the Deepgram "speechStarted" VAD event
    // (see _bindSTTEvents), NOT here on every audio frame.  Triggering
    // _handleBargeIn() on every frame was the root cause of "second speaking
    // no reply": Twilio sends continuous silent frames every 20 ms, so barge-in
    // fired immediately after the bot started speaking, killing every response.
    this.stt.sendAudio(audioBuffer);
  }

  // ─── Greeting ──────────────────────────────────────────────────────────────

  async _speakGreeting() {
    this._greetingActive = true;
    this.cancelFlag = false;
    this.isBotSpeaking = false;

    try {
      // Send the ENTIRE greeting as a single TTS call — no sentence splitting.
      // Multiple API calls create audible silence gaps between sentences and
      // introduce more failure points.  A single streaming call is simpler and
      // plays the greeting continuously without gaps.
      await this._streamTTSToTwilio(this.greetingText);

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
      // Mic still sends audio while the bot plays; TTS echo can trigger early
      // flush → second _runPipeline cancels the first and drops TTS mid-flight.
      if (this.isBotSpeaking) return;

      this.partialTranscript = transcript;

      if (!this.earlyFlushTriggered && transcript.length >= INTERIM_FLUSH_CHARS) {
        this.earlyFlushTriggered = true;
        this._runPipeline(transcript);
      }
    });

    this.stt.on("final", (transcript) => {
      if (this._greetingActive) return;
      // Same echo issue as interim: speech_final on leaked playback looks like
      // a new user turn and starts a pipeline that cancels the active one.
      if (this.isBotSpeaking) {
        return;
      }

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
      if (this.isBotSpeaking) return;

      const text = this.partialTranscript.trim();
      if (text.length >= 12) {
        this.partialTranscript = "";
        this.earlyFlushTriggered = false;
        this._runPipeline(text);
      }
    });

    // Deepgram's VAD event: user has started speaking.
    // This is the correct and ONLY trigger for barge-in.  We used to trigger
    // barge-in on every sendAudio() call while isBotSpeaking=true, which fired
    // on silent frames every 20 ms and immediately cancelled every bot response.
    this.stt.on("speechStarted", () => {
      if (this._greetingActive) return;
      if (this.isBotSpeaking) {
        this._handleBargeIn();
      }
    });

    this.stt.on("error", () => {});
  }

  // ─── Main LLM → TTS pipeline ───────────────────────────────────────────────

  async _runPipeline(userText) {
    // Cancel any running pipeline immediately.
    if (this.isProcessing) {
      this._cancelPipeline(); // also increments _pipelineGen
    }

    // Claim this run's generation AFTER the possible cancel above.
    const myGen = ++this._pipelineGen;

    // Brief handoff so the previous pipeline's in-flight TTS can detect stale gen.
    if (PIPELINE_HANDOFF_MS > 0) {
      await sleep(PIPELINE_HANDOFF_MS);
    }

    // If another _runPipeline was called while we were sleeping, bail out.
    if (myGen !== this._pipelineGen) {
      return;
    }

    this.isProcessing = true;
    this.cancelFlag = false;
    this.isBotSpeaking = false;

    if (this.call) {
      setImmediate(() => {
        saveIncomingMessageRow({
          callId: this.call.id,
          audio: null,
          transcription: userText,
          userType: "user",
          status: "success",
        }).catch(() => {});
      });
    }

    try {
      // Run end-call classification in parallel with the LLM (not on the hot path).
      let endTurn = { endCall: false, farewell: "" };
      const endTurnPromise = analyzeInboundEndCallTurn({
        text: userText,
        clinicPrompt: this.clinicPrompt,
        knowledgePrompt: this.knowledgePrompt,
      })
        .then((r) => {
          endTurn = r;
          return r;
        })
        .catch(() => endTurn);

      let fullBotReply = "";
      let segmentIdx = 0;
      let playedAnyTts = false;

      for await (const segment of this.llm.streamReply(userText)) {
        if (segmentIdx === 0 && END_CALL_HEAD_START_MS > 0) {
          await Promise.race([endTurnPromise, sleep(END_CALL_HEAD_START_MS)]);
        }

        if (endTurn.endCall && !this.cancelFlag && myGen === this._pipelineGen) {
          if (playedAnyTts) this._clearTwilioAudio();
          break;
        }

        segmentIdx++;

        if (this.cancelFlag || myGen !== this._pipelineGen) {
          break;
        }

        fullBotReply += (fullBotReply ? " " : "") + segment;
        await this._streamTTSToTwilio(segment, myGen);
        playedAnyTts = true;

        if (this.cancelFlag || myGen !== this._pipelineGen) {
          break;
        }
      }

      if (!endTurn.endCall) {
        try {
          endTurn = await endTurnPromise;
        } catch {
          /* keep last endTurn */
        }
      }

      if (endTurn.endCall && !this.cancelFlag && myGen === this._pipelineGen) {
        const fallbackFarewell = String(
          process.env.TWILIO_INBOUND_VOICE_FAREWELL ||
            "Thank you for calling. Take care and goodbye."
        ).trim();
        const farewell = String(endTurn.farewell || "").trim() || fallbackFarewell;

        const lastAssistant = [...this.llm.history].reverse().find((m) => m.role === "assistant");
        if (lastAssistant) lastAssistant.content = farewell;
        else this.llm.history.push({ role: "assistant", content: farewell });

        await this._streamTTSToTwilio(farewell, myGen);

        if (this.call) {
          saveIncomingMessageRow({
            callId: this.call.id,
            audio: null,
            transcription: farewell,
            userType: "bot",
            status: "success",
          }).catch(() => {});
        }

        if (this.clinicId && this.callSid) {
          try {
            await endCall(this.callSid, { clinicId: this.clinicId });
          } catch {
            /* hangup failed */
          }
        }
        return;
      }

      if (this.call && fullBotReply && playedAnyTts) {
        saveIncomingMessageRow({
          callId: this.call.id,
          audio: null,
          transcription: fullBotReply,
          userType: "bot",
          status: "success",
        }).catch(() => {});
      }
    } catch {
      /* pipeline failed */
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
      return;
    }

    const audioStream = await this.tts.streamAudio(text);

    if (isStale()) {
      return;
    }

    if (!audioStream) {
      return;
    }

    this.isBotSpeaking = true;

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
              break;
            }
            if (!value || !value.length) continue;
            const buf = Buffer.from(value);
            this.ws.send(
              JSON.stringify({
                event: "media",
                streamSid: this.streamSid,
                media: { payload: buf.toString("base64") },
              })
            );
          }
        } finally {
          try { reader.releaseLock(); } catch { /* ignore */ }
        }
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
        }
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
            }
          }
        });
        audioStream.on("end", () => {
          resolve();
        });
        audioStream.on("error", () => {
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
    this._cancelPipeline();
    this._clearTwilioAudio();
  }

  _cancelPipeline() {
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
