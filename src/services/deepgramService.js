/**
 * DeepgramService
 *
 * Persistent live-transcription connection for one inbound phone call.
 * Uses nova-2-phonecall model (tuned for 8 kHz μ-law Twilio audio) with
 * interim_results + endpointing for low-latency turn-taking.
 *
 * Written for @deepgram/sdk v5 (DeepgramClient class-based API).
 *
 * Emits:
 *   "interim"      – partial transcript (for early LLM flush)
 *   "final"        – is_final/speech_final transcript (trigger pipeline)
 *   "utteranceEnd" – safety-net flush when DG endpointing fires without final
 *   "error"        – connection / API error
 *   "close"        – connection closed
 */

const { DeepgramClient } = require("@deepgram/sdk");
const { EventEmitter } = require("events");

class DeepgramService extends EventEmitter {
  constructor(callSid) {
    super();
    this.callSid = callSid;
    this.client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
    this.socket = null;
    this.isOpen = false;
    this.audioQueue = [];
  }

  /**
   * Discard all queued audio (e.g. silence collected during greeting playback).
   * Call this before connect() to avoid sending stale audio to Deepgram.
   */
  clearQueue() {
    this.audioQueue = [];
  }

  async connect() {
    const endpointingRaw = parseInt(process.env.VAD_SILENCE_MS || "300", 10);
    const endpointingMs = Number.isFinite(endpointingRaw)
      ? Math.max(100, Math.min(2000, endpointingRaw))
      : 300;
    // Deepgram requires utterance_end_ms >= 1000 when using UtteranceEnd; lower values reject the connection (400).
    const utteranceEndConfigured = parseInt(
      process.env.DEEPGRAM_UTTERANCE_END_MS || String(Math.max(1000, endpointingMs + 300)),
      10
    );
    const utteranceEndMs = Number.isFinite(utteranceEndConfigured)
      ? Math.max(1000, utteranceEndConfigured)
      : 1000;

    const model =
      String(process.env.DEEPGRAM_MODEL || "").trim() || "nova-2-phonecall";
    const smartFormat =
      String(process.env.DEEPGRAM_SMART_FORMAT || "0").trim() === "1";

    // v5: client.listen.v1.connect() returns a Promise that resolves to the
    // socket wrapper (WrappedListenV1Socket) — NOT yet connected.
    // Call socket.connect() afterwards to open the underlying WebSocket.
    this.socket = await this.client.listen.v1.connect({
      model,
      language: "en-US",
      encoding: "mulaw",
      sample_rate: 8000,
      channels: 1,
      interim_results: true,
      endpointing: endpointingMs,
      utterance_end_ms: utteranceEndMs,
      vad_events: true,
      smart_format: smartFormat,
    });

    this.socket.on("open", () => {
      this.isOpen = true;
      for (const chunk of this.audioQueue) {
        this.socket.sendMedia(chunk);
      }
      this.audioQueue = [];
    });

    // v5: all server messages (transcripts, utterance end, metadata, etc.)
    // arrive on the "message" event keyed by data.type.
    this.socket.on("message", (data) => {
      if (!data) return;

      // SpeechStarted is Deepgram's VAD signal: the user has begun speaking.
      // We emit this so InboundCallSession can trigger barge-in ONLY when the
      // user actually speaks, rather than on every silent audio frame.
      if (data.type === "SpeechStarted") {
        this.emit("speechStarted");
        return;
      }

      if (data.type === "UtteranceEnd") {
        this.emit("utteranceEnd");
        return;
      }

      if (data.type === "Results" || data.channel) {
        const alt = data?.channel?.alternatives?.[0];
        if (!alt || !String(alt.transcript || "").trim()) return;

        const transcript = alt.transcript.trim();
        const speechFinal = Boolean(data.speech_final);

        if (speechFinal) {
          // speech_final=true means the user STOPPED SPEAKING (silence detected).
          // This is the correct moment to trigger the LLM pipeline — only once
          // per utterance.  is_final=true alone means a chunk was finalized but
          // speech is still ongoing; treat it as interim so the pipeline does
          // not fire prematurely on every word.
          this.emit("final", transcript);
        } else {
          this.emit("interim", transcript);
        }
      }
    });

    this.socket.on("error", (err) => {
      this.emit("error", err);
    });

    this.socket.on("close", () => {
      this.isOpen = false;
      this.emit("close");
    });

    // v5: must call connect() to actually open the underlying WebSocket.
    this.socket.connect();
  }

  sendAudio(buffer) {
    if (!this.isOpen) {
      this.audioQueue.push(buffer);
      return;
    }
    try {
      this.socket.sendMedia(buffer);
    } catch {
      /* ignore send failures */
    }
  }

  close() {
    if (this.socket && this.isOpen) {
      this.socket.close();
    }
  }
}

module.exports = { DeepgramService };
