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

  async connect() {
    const endpointingMs = parseInt(process.env.VAD_SILENCE_MS || "600", 10);
    // Deepgram requires utterance_end_ms >= 1000 when using UtteranceEnd; lower values can reject the connection (400).
    const utteranceEndConfigured = parseInt(
      process.env.DEEPGRAM_UTTERANCE_END_MS || String(Math.max(1000, endpointingMs + 400)),
      10
    );
    const utteranceEndMs = Number.isFinite(utteranceEndConfigured)
      ? Math.max(1000, utteranceEndConfigured)
      : 1000;

    // v5: client.listen.v1.connect() returns the socket object (not yet connected).
    this.socket = await this.client.listen.v1.connect({
      model: "nova-2-phonecall",
      language: "en-US",
      encoding: "mulaw",
      sample_rate: 8000,
      channels: 1,
      interim_results: true,
      endpointing: endpointingMs,
      utterance_end_ms: utteranceEndMs,
      vad_events: true,
      smart_format: true,
    });

    this.socket.on("open", () => {
      this.isOpen = true;
      console.log(`[Deepgram] connection opened callSid=${this.callSid}`);
      for (const chunk of this.audioQueue) {
        this.socket.sendMedia(chunk);
      }
      this.audioQueue = [];
    });

    // v5: all server messages (transcripts, utterance end, metadata, etc.)
    // arrive on the "message" event. Distinguish by data.type.
    this.socket.on("message", (data) => {
      if (!data) return;

      if (data.type === "UtteranceEnd") {
        this.emit("utteranceEnd");
        return;
      }

      // Results message — same shape as v3 transcript response.
      if (data.type === "Results" || data.channel) {
        const alt = data?.channel?.alternatives?.[0];
        if (!alt || !String(alt.transcript || "").trim()) return;

        const transcript = alt.transcript.trim();
        const isFinal = data.is_final;
        const speechFinal = data.speech_final;

        if (isFinal || speechFinal) {
          this.emit("final", transcript);
        } else {
          this.emit("interim", transcript);
        }
      }
    });

    this.socket.on("error", (err) => {
      console.error(`[Deepgram] error callSid=${this.callSid}: ${err?.message ?? err}`);
      this.emit("error", err);
    });

    this.socket.on("close", () => {
      this.isOpen = false;
      console.log(`[Deepgram] connection closed callSid=${this.callSid}`);
      this.emit("close");
    });

    // v5: must call connect() to actually open the WebSocket.
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
      console.warn(`[Deepgram] failed to send audio callSid=${this.callSid}`);
    }
  }

  close() {
    if (this.socket && this.isOpen) {
      this.socket.close();
    }
  }
}

module.exports = { DeepgramService };
