/**
 * OpenAIRealtimeBridge
 *
 * WebSocket client for the OpenAI Realtime API (GA).
 * Bridges μ-law 8 kHz audio between Twilio Media Streams and GPT Realtime.
 *
 * Handles STT, LLM, and TTS in a single session — no Deepgram or ElevenLabs.
 */

const WebSocket = require("ws");
const { EventEmitter } = require("events");
const { resolveOpenAiVoice } = require("./openaiRealtimeVoices");

const DEFAULT_MODEL =
  String(process.env.OPENAI_REALTIME_MODEL || "").trim() || "gpt-realtime-1.5";

const TRANSCRIPTION_MODEL =
  String(process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL || "").trim() ||
  "gpt-4o-mini-transcribe";

class OpenAIRealtimeBridge extends EventEmitter {
  /**
   * @param {string} callSid
   * @param {{
   *   instructions: string,
   *   voice: string|null,
   * }} opts
   */
  constructor(callSid, opts = {}) {
    super();
    this.callSid = callSid;
    this.instructions = String(opts.instructions || "").trim();
    this.voice = resolveOpenAiVoice(opts.voice);
    this.ws = null;
    this.isOpen = false;
    this._sessionReady = false;
    this._pendingAudio = [];
    this._botSpeaking = false;
    this._currentBotTranscript = "";
    this._currentBotAudio = [];
  }

  connect() {
    const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
    if (!apiKey) {
      return Promise.reject(new Error("Missing OPENAI_API_KEY"));
    }

    const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(DEFAULT_MODEL)}`;

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      const ready = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`
        }
      });

      const onOpen = () => {
        this.isOpen = true;
        console.log(`[OpenAIRealtime] connected callSid=${this.callSid} model=${DEFAULT_MODEL}`);
        this._sendSessionUpdate();
      };

      const onError = (err) => {
        console.error(`[OpenAIRealtime] WS error callSid=${this.callSid}: ${err.message}`);
        this.emit("error", err);
        fail(err);
      };

      const onClose = () => {
        const wasReady = this._sessionReady;
        this.isOpen = false;
        this._sessionReady = false;
        console.log(`[OpenAIRealtime] closed callSid=${this.callSid}`);
        this.emit("close");
        if (!wasReady) {
          fail(new Error("OpenAI Realtime connection closed before session was ready"));
        }
      };

      this.ws.on("open", onOpen);
      this.ws.on("error", onError);
      this.ws.on("close", onClose);

      this.ws.on("message", (raw) => {
        try {
          const event = JSON.parse(raw.toString());
          this._handleServerEvent(event, ready, fail);
        } catch (err) {
          console.warn(`[OpenAIRealtime] bad message callSid=${this.callSid}: ${err.message}`);
        }
      });
    });
  }

  close() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
    this.ws = null;
    this.isOpen = false;
    this._sessionReady = false;
  }

  /** @returns {boolean} */
  get botSpeaking() {
    return this._botSpeaking;
  }

  appendAudio(buffer) {
    if (!buffer?.length) return;
    if (!this.isOpen || !this._sessionReady) {
      this._pendingAudio.push(buffer);
      return;
    }
    this._send({
      type: "input_audio_buffer.append",
      audio: Buffer.from(buffer).toString("base64")
    });
  }

  /**
   * Speak a greeting or scripted line via response.create.
   * @param {string} text
   */
  speakText(text) {
    const spoken = String(text || "").trim();
    if (!spoken) return;
    this._currentBotTranscript = "";
    this._currentBotAudio = [];
    this._send({
      type: "response.create",
      response: {
        instructions: `Say the following exactly, naturally and warmly: "${spoken}"`
      }
    });
  }

  cancelResponse() {
    this._send({ type: "response.cancel" });
    this._botSpeaking = false;
  }

  _sendSessionUpdate() {
    this._send({
      type: "session.update",
      session: {
        type: "realtime",
        model: DEFAULT_MODEL,
        instructions: this.instructions,
        output_modalities: ["audio"],
        audio: {
          input: {
            format: { type: "audio/pcmu" },
            turn_detection: {
              type: "server_vad",
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: parseInt(process.env.VAD_SILENCE_MS || "500", 10) || 500,
              interrupt_response: true,
              create_response: true
            },
            transcription: {
              model: TRANSCRIPTION_MODEL
            }
          },
          output: {
            format: { type: "audio/pcmu" },
            voice: this.voice
          }
        }
      }
    });
  }

  _flushPendingAudio() {
    if (!this._pendingAudio.length) return;
    const queued = this._pendingAudio;
    this._pendingAudio = [];
    for (const chunk of queued) {
      this.appendAudio(chunk);
    }
  }

  /**
   * @param {object} event
   * @param {() => void} [onReady]
   * @param {(err: Error) => void} [onFail]
   */
  _handleServerEvent(event, onReady, onFail) {
    const type = event?.type;
    if (!type) return;

    if (type !== "response.output_audio.delta" && type !== "input_audio_buffer.append") {
      console.log(`[OpenAIRealtime] event=${type} callSid=${this.callSid}`);
    }

    switch (type) {
      case "session.updated":
      case "session.created":
        if (!this._sessionReady) {
          this._sessionReady = true;
          this._flushPendingAudio();
          if (onReady) onReady();
        }
        break;

      case "response.output_audio.delta": {
        const delta = event.delta;
        if (!delta) break;
        this._botSpeaking = true;
        const buf = Buffer.from(delta, "base64");
        this._currentBotAudio.push(buf);
        this.emit("audioDelta", buf);
        break;
      }

      case "response.output_audio.done":
        this._botSpeaking = false;
        this.emit("audioDone");
        break;

      case "response.output_audio_transcript.delta":
        this._currentBotTranscript += String(event.delta || "");
        break;

      case "response.output_audio_transcript.done": {
        const transcript = String(event.transcript || this._currentBotTranscript || "").trim();
        const audioBuf =
          this._currentBotAudio.length > 0 ? Buffer.concat(this._currentBotAudio) : null;
        this._currentBotTranscript = "";
        this._currentBotAudio = [];
        if (transcript) {
          this.emit("botTranscript", { transcript, audioBuf });
        }
        break;
      }

      case "conversation.item.input_audio_transcription.completed": {
        const transcript = String(event.transcript || "").trim();
        if (transcript) {
          this.emit("userTranscript", transcript);
        }
        break;
      }

      case "input_audio_buffer.speech_started":
        this.emit("speechStarted");
        break;

      case "error": {
        const apiErr = new Error(event.error?.message || "Realtime API error");
        console.error(
          `[OpenAIRealtime] API error callSid=${this.callSid}: ${JSON.stringify(event.error || event)}`
        );
        this.emit("error", apiErr);
        if (!this._sessionReady && onFail) onFail(apiErr);
        break;
      }

      default:
        break;
    }
  }

  _send(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    try {
      this.ws.send(JSON.stringify(payload));
    } catch (err) {
      console.warn(`[OpenAIRealtime] send failed callSid=${this.callSid}: ${err.message}`);
    }
  }
}

/**
 * Build the system instructions for an inbound call session.
 * @param {{ clinicPrompt: string|null, knowledgePrompt: string|null }} ctx
 * @returns {string}
 */
function buildRealtimeInstructions(ctx = {}) {
  const base =
    String(process.env.BOT_SYSTEM_PROMPT || "").trim() ||
    "You are a friendly, concise medical office voice assistant. " +
      "Keep replies under 3 sentences. Speak naturally — no markdown, no lists, no special characters. " +
      "When the caller wants to end the call, say a brief warm goodbye.";

  const parts = [base];
  if (ctx.clinicPrompt) parts.push(ctx.clinicPrompt);
  if (ctx.knowledgePrompt) parts.push(ctx.knowledgePrompt);
  return parts.join("\n\n");
}

module.exports = {
  OpenAIRealtimeBridge,
  buildRealtimeInstructions,
  DEFAULT_REALTIME_MODEL: DEFAULT_MODEL
};
