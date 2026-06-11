/**
 * InboundCallSession
 *
 * One instance per active inbound phone call.
 * Bridges Twilio Media Streams ↔ OpenAI Realtime API (STT + LLM + TTS in one).
 *
 * Flow:
 *   Twilio WS → sendAudio() → OpenAI Realtime input_audio_buffer.append
 *   OpenAI Realtime response.output_audio.delta → Twilio media events
 *
 * Barge-in: OpenAI server VAD interrupts the model; we also send Twilio "clear".
 *
 * DB persistence:
 *   - User utterance → incoming_messages (from input_audio_transcription.completed)
 *   - Bot reply      → incoming_messages (from output_audio_transcript.done + μ-law audio)
 */

const {
  OpenAIRealtimeBridge,
  buildRealtimeInstructions
} = require("./openaiRealtimeService");
const { mulawToWavBase64 } = require("./inboundAudioCodec");
const { saveIncomingMessageRow, findOrCreateCallBySid } = require("./callPersistenceService");
const { analyzeInboundEndCallTurn } = require("./openaiService");
const { endCall } = require("./twilioService");

class InboundCallSession {
  /**
   * @param {string} callSid
   * @param {import("ws").WebSocket} ws  – Twilio Media Stream WebSocket
   * @param {{
   *   clinicPrompt: string|null,
   *   knowledgePrompt: string|null,
   *   openaiVoice: string|null,
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

    /** @type {Buffer[]} μ-law frames from caller's current utterance. */
    this._userTurnMulawChunks = [];
    this._userCapturing = false;

    this.realtime = new OpenAIRealtimeBridge(callSid, {
      instructions: buildRealtimeInstructions({
        clinicPrompt: opts.clinicPrompt || null,
        knowledgePrompt: opts.knowledgePrompt || null
      }),
      voice: opts.openaiVoice || null
    });

    this.streamSid = null;
    this._startupComplete = false;
    this._greetingActive = false;
    this._pendingEndCall = null;

    this._bindRealtimeEvents();
  }

  async _ensureCallRecord() {
    if (this.call?.id) return this.call;

    const sid = String(this.callSid || "").trim();
    if (!sid || sid === "unknown") return null;

    try {
      this.call = await findOrCreateCallBySid({
        callSid: sid,
        from: "unknown",
        status: "in-progress"
      });
    } catch (err) {
      console.error(
        `[InboundSession] call record ensure failed callSid=${sid}: ${err.message}`
      );
      this.call = null;
    }
    return this.call;
  }

  async start() {
    await this._ensureCallRecord();
    await this.realtime.connect();

    if (this.greetingText) {
      try {
        await this._speakGreeting();
      } catch (err) {
        console.error(`[InboundSession] greeting failed callSid=${this.callSid}: ${err.message}`);
      }
    }

    this._startupComplete = true;
    console.log(`[InboundSession] startup complete callSid=${this.callSid}`);
  }

  close() {
    this.realtime.close();
    console.log(`[InboundSession] closed callSid=${this.callSid}`);
  }

  setStreamSid(streamSid) {
    this.streamSid = streamSid;
  }

  sendAudio(audioBuffer) {
    if (!this._startupComplete || this._greetingActive) return;

    if (this._userCapturing && audioBuffer?.length) {
      this._userTurnMulawChunks.push(Buffer.from(audioBuffer));
    }

    this.realtime.appendAudio(audioBuffer);
  }

  _beginUserTurnCapture() {
    this._userCapturing = true;
    this._userTurnMulawChunks = [];
  }

  _takeUserAudioSnapshot() {
    this._userCapturing = false;
    const chunks = this._userTurnMulawChunks;
    this._userTurnMulawChunks = [];
    if (!chunks.length) return null;
    return Buffer.concat(chunks);
  }

  _bindRealtimeEvents() {
    this.realtime.on("audioDelta", (buf) => {
      if (this.ws.readyState !== 1 /* OPEN */ || !this.streamSid) return;
      this.ws.send(
        JSON.stringify({
          event: "media",
          streamSid: this.streamSid,
          media: { payload: buf.toString("base64") }
        })
      );
    });

    this.realtime.on("speechStarted", () => {
      if (this._greetingActive) return;
      this._beginUserTurnCapture();
      if (this.realtime.botSpeaking) {
        this.realtime.cancelResponse();
        this._clearTwilioAudio();
      }
    });

    this.realtime.on("userTranscript", (transcript) => {
      if (this._greetingActive) return;

      const userMulaw = this._takeUserAudioSnapshot();
      const userAudioB64 = mulawToWavBase64(userMulaw);

      if (this.call) {
        saveIncomingMessageRow({
          callId: this.call.id,
          audio: userAudioB64,
          transcription: transcript,
          userType: "user",
          status: userAudioB64 ? "success" : "success-no-audio"
        }).catch((err) => {
          console.error(
            `[InboundSession] user message save failed callSid=${this.callSid}: ${err.message}`
          );
        });
      }

      this._checkEndCall(transcript);
    });

    this.realtime.on("botTranscript", ({ transcript, audioBuf }) => {
      if (this._greetingActive) return;

      const wavB64 = mulawToWavBase64(audioBuf);
      if (this.call) {
        saveIncomingMessageRow({
          callId: this.call.id,
          audio: wavB64,
          transcription: transcript,
          userType: "bot",
          status: wavB64 ? "success" : "no-audio"
        }).catch((err) => {
          console.error(
            `[InboundSession] bot message save failed callSid=${this.callSid}: ${err.message}`
          );
        });
      }

      this._maybeHangupAfterFarewell(transcript);
    });

    this.realtime.on("error", (err) => {
      console.error(
        `[InboundSession] Realtime error callSid=${this.callSid}: ${err?.message ?? err}`
      );
    });
  }

  async _speakGreeting() {
    this._greetingActive = true;

    return new Promise((resolve) => {
      const onDone = ({ transcript, audioBuf }) => {
        cleanup();
        if (this.call && transcript) {
          const wavB64 = mulawToWavBase64(audioBuf);
          saveIncomingMessageRow({
            callId: this.call.id,
            audio: wavB64,
            transcription: transcript,
            userType: "bot",
            status: wavB64 ? "success" : "no-audio"
          }).catch(() => {});
        }
        resolve();
      };

      const onAudioDone = () => {
        // If transcript event didn't fire, still unblock startup.
        setTimeout(() => {
          if (this._greetingActive) {
            cleanup();
            resolve();
          }
        }, 500);
      };

      const cleanup = () => {
        this._greetingActive = false;
        this.realtime.off("botTranscript", onDone);
        this.realtime.off("audioDone", onAudioDone);
      };

      this.realtime.on("botTranscript", onDone);
      this.realtime.on("audioDone", onAudioDone);
      this.realtime.speakText(this.greetingText);
    });
  }

  async _checkEndCall(userText) {
    if (String(process.env.INBOUND_END_CALL_ENABLED || "1").trim() === "0") return;

    try {
      const endTurn = await analyzeInboundEndCallTurn({
        text: userText,
        clinicPrompt: this.clinicPrompt,
        knowledgePrompt: this.knowledgePrompt
      });

      if (!endTurn.endCall) return;

      this._pendingEndCall = endTurn;
      const fallbackFarewell = String(
        process.env.TWILIO_INBOUND_VOICE_FAREWELL ||
          "Thank you for calling. Take care and goodbye."
      ).trim();
      const farewell = String(endTurn.farewell || "").trim() || fallbackFarewell;

      console.log(`[InboundSession] end-call farewell="${farewell.slice(0, 80)}" callSid=${this.callSid}`);
      this.realtime.speakText(farewell);
    } catch (err) {
      console.warn(
        `[InboundSession] end-call classify failed callSid=${this.callSid}: ${err.message}`
      );
    }
  }

  async _maybeHangupAfterFarewell(transcript) {
    if (!this._pendingEndCall) return;

    const spoken = String(transcript || "").trim();
    if (!spoken) return;

    this._pendingEndCall = null;

    if (this.clinicId && this.callSid) {
      try {
        await endCall(this.callSid, { clinicId: this.clinicId });
        console.log(`[InboundSession] Twilio call ended callSid=${this.callSid}`);
      } catch (hangErr) {
        console.error(
          `[InboundSession] endCall REST failed callSid=${this.callSid}: ${hangErr.message}`
        );
      }
    }
  }

  _clearTwilioAudio() {
    if (this.ws.readyState === 1 && this.streamSid) {
      this.ws.send(JSON.stringify({ event: "clear", streamSid: this.streamSid }));
    }
  }
}

module.exports = { InboundCallSession };
