/**
 * DeepgramService
 *
 * Persistent live-transcription connection for one inbound phone call.
 * Uses nova-2-phonecall model (tuned for 8 kHz μ-law Twilio audio) with
 * interim_results + endpointing for low-latency turn-taking.
 *
 * Emits:
 *   "interim"      – partial transcript (for early LLM flush)
 *   "final"        – is_final/speech_final transcript (trigger pipeline)
 *   "utteranceEnd" – safety-net flush when DG endpointing fires without final
 *   "error"        – connection / API error
 *   "close"        – connection closed
 */

const { createClient, LiveTranscriptionEvents } = require("@deepgram/sdk");
const { EventEmitter } = require("events");

class DeepgramService extends EventEmitter {
  constructor(callSid) {
    super();
    this.callSid = callSid;
    this.client = createClient(process.env.DEEPGRAM_API_KEY);
    this.connection = null;
    this.isOpen = false;
    this.audioQueue = [];
  }

  async connect() {
    const endpointingMs = parseInt(process.env.VAD_SILENCE_MS || "600");

    this.connection = this.client.listen.live({
      model: "nova-2-phonecall",
      language: "en-US",
      encoding: "mulaw",
      sample_rate: 8000,
      channels: 1,
      interim_results: true,
      endpointing: endpointingMs,
      utterance_end_ms: endpointingMs + 200,
      smart_format: true,
      no_delay: true,
    });

    this.connection.on(LiveTranscriptionEvents.Open, () => {
      this.isOpen = true;
      console.log(`[Deepgram] connection opened callSid=${this.callSid}`);
      for (const chunk of this.audioQueue) {
        this.connection.send(chunk);
      }
      this.audioQueue = [];
    });

    this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
      const alt = data?.channel?.alternatives?.[0];
      if (!alt || !alt.transcript.trim()) return;

      const transcript = alt.transcript.trim();
      const isFinal = data.is_final;
      const speechFinal = data.speech_final;

      if (isFinal || speechFinal) {
        this.emit("final", transcript);
      } else {
        this.emit("interim", transcript);
      }
    });

    this.connection.on(LiveTranscriptionEvents.UtteranceEnd, () => {
      this.emit("utteranceEnd");
    });

    this.connection.on(LiveTranscriptionEvents.Error, (err) => {
      console.error(`[Deepgram] error callSid=${this.callSid}: ${err?.message ?? err}`);
      this.emit("error", err);
    });

    this.connection.on(LiveTranscriptionEvents.Close, () => {
      this.isOpen = false;
      console.log(`[Deepgram] connection closed callSid=${this.callSid}`);
      this.emit("close");
    });
  }

  sendAudio(buffer) {
    if (!this.isOpen) {
      this.audioQueue.push(buffer);
      return;
    }
    try {
      this.connection.send(buffer);
    } catch {
      console.warn(`[Deepgram] failed to send audio callSid=${this.callSid}`);
    }
  }

  close() {
    if (this.connection && this.isOpen) {
      this.connection.finish();
    }
  }
}

module.exports = { DeepgramService };
