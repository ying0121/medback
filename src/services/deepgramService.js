/**
 * DeepgramService
 *
 * Persistent live-transcription connection for one inbound phone call.
 * Multilingual streaming uses language=multi (NOT detect_language — that is
 * pre-recorded only and returns HTTP 400 on live WebSockets).
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

/** Models that only support English — cannot be used with language=multi. */
const ENGLISH_ONLY_MODELS = new Set([
  "nova-2-phonecall",
  "nova-3-phonecall",
  "nova-2-meeting",
  "nova-2-finance",
  "nova-2-conversationalai",
  "nova-2-voicemail",
  "nova-2-video",
  "nova-2-medical",
  "nova-2-drivethru",
  "nova-2-automotive",
  "nova-2-atc",
]);

const DEFAULT_MULTILINGUAL_MODEL = "nova-3";

/**
 * Streaming STT config. By default ALWAYS uses language=multi for inbound calls.
 * Set DEEPGRAM_FORCE_ENGLISH_STT=1 only if you intentionally want English-only STT.
 * @returns {{ model: string, language: string, multilingual: boolean }}
 */
function resolveDeepgramListenConfig() {
  const forceEnglish =
    String(process.env.DEEPGRAM_FORCE_ENGLISH_STT || "0").trim() === "1";

  if (!forceEnglish) {
    let model =
      String(process.env.DEEPGRAM_MULTILINGUAL_MODEL || "").trim() ||
      String(process.env.DEEPGRAM_MODEL || "").trim() ||
      DEFAULT_MULTILINGUAL_MODEL;

    if (ENGLISH_ONLY_MODELS.has(model.toLowerCase())) {
      model =
        String(process.env.DEEPGRAM_MULTILINGUAL_MODEL || "").trim() ||
        DEFAULT_MULTILINGUAL_MODEL;
    }

    return { model, language: "multi", multilingual: true };
  }

  const language =
    String(process.env.DEEPGRAM_LANGUAGE || "en-US").trim() || "en-US";
  const model =
    String(process.env.DEEPGRAM_MODEL || "").trim() || "nova-2-phonecall";

  return { model, language, multilingual: false };
}

/**
 * @param {object|null|undefined} alt Deepgram channel.alternatives[0]
 * @returns {string[]}
 */
function extractDetectedLanguages(alt) {
  if (!alt) return [];
  const langs = new Set();
  if (Array.isArray(alt.languages)) {
    for (const code of alt.languages) {
      const normalized = String(code || "").trim();
      if (normalized) langs.add(normalized);
    }
  }
  if (Array.isArray(alt.words)) {
    for (const word of alt.words) {
      const normalized = String(word?.language || "").trim();
      if (normalized) langs.add(normalized);
    }
  }
  return [...langs];
}

class DeepgramService extends EventEmitter {
  constructor(callSid) {
    super();
    this.callSid = callSid;
    this.client = new DeepgramClient({ apiKey: process.env.DEEPGRAM_API_KEY });
    this.socket = null;
    this.isOpen = false;
    this.audioQueue = [];
    this.lastFinalTranscript = "";
    this.lastFinalAt = 0;
    /** @type {string[]} BCP-47 / ISO codes from latest Deepgram result (e.g. es, ja). */
    this.lastDetectedLanguages = [];
    this.listenConfig = resolveDeepgramListenConfig();
  }

  /**
   * Discard all queued audio (e.g. silence collected during greeting playback).
   * Call this before connect() to avoid sending stale audio to Deepgram.
   */
  clearQueue() {
    const dropped = this.audioQueue.length;
    this.audioQueue = [];
    if (dropped > 0) {
      console.log(`[Deepgram] cleared ${dropped} stale audio frames callSid=${this.callSid}`);
    }
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

    this.listenConfig = resolveDeepgramListenConfig();
    const { model, language, multilingual } = this.listenConfig;

    if (multilingual && language !== "multi") {
      console.error(
        `[Deepgram] invalid multilingual config language=${language} callSid=${this.callSid} — forcing multi`
      );
      this.listenConfig.language = "multi";
    }

    const smartFormat =
      String(process.env.DEEPGRAM_SMART_FORMAT || "0").trim() === "1";

    const connectOptions = {
      model: this.listenConfig.model,
      language: multilingual ? "multi" : this.listenConfig.language,
      encoding: "mulaw",
      sample_rate: 8000,
      channels: 1,
      interim_results: true,
      endpointing: endpointingMs,
      utterance_end_ms: utteranceEndMs,
      vad_events: true,
      smart_format: smartFormat,
    };

    console.log(
      `[Deepgram] listen config callSid=${this.callSid} ${JSON.stringify({
        model: connectOptions.model,
        language: connectOptions.language,
        encoding: connectOptions.encoding,
        sample_rate: connectOptions.sample_rate,
        multilingual,
      })}`
    );

    // v5: client.listen.v1.connect() returns a Promise that resolves to the
    // socket wrapper (WrappedListenV1Socket) — NOT yet connected.
    // Call socket.connect() afterwards to open the underlying WebSocket.
    this.socket = await this.client.listen.v1.connect(connectOptions);

    this.socket.on("open", () => {
      this.isOpen = true;
      console.log(
        `[Deepgram] connection opened callSid=${this.callSid} model=${connectOptions.model} language=${connectOptions.language} endpointing=${endpointingMs}ms queuedFrames=${this.audioQueue.length}`
      );
      for (const chunk of this.audioQueue) {
        this.socket.sendMedia(chunk);
      }
      this.audioQueue = [];
    });

    // v5: all server messages (transcripts, utterance end, metadata, etc.)
    // arrive on the "message" event keyed by data.type.
    this.socket.on("message", (data) => {
      if (!data) return;

      const msgType = data.type ?? (typeof data === "string" ? "raw-string" : "unknown");
      if (msgType !== "Results" && msgType !== "SpeechStarted") {
        console.log(`[Deepgram] msg type=${msgType} callSid=${this.callSid}`);
      }

      if (data.type === "SpeechStarted") {
        console.log(`[Deepgram] SpeechStarted callSid=${this.callSid}`);
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
        const detectedLanguages = extractDetectedLanguages(alt);
        if (detectedLanguages.length) {
          this.lastDetectedLanguages = detectedLanguages;
        }

        const isFinal = Boolean(data.is_final);
        const speechFinal = Boolean(data.speech_final);

        if (speechFinal || isFinal) {
          const langInfo =
            detectedLanguages.length > 0
              ? ` languages=[${detectedLanguages.join(",")}]`
              : this.lastDetectedLanguages.length > 0
                ? ` languages=[${this.lastDetectedLanguages.join(",")}]`
                : "";
          console.log(
            `[Deepgram] transcript="${transcript}"${langInfo} is_final=${isFinal} speech_final=${speechFinal} callSid=${this.callSid}`
          );
        }

        if (speechFinal || isFinal) {
          const now = Date.now();
          const dedupeWindowMs = 800;
          const duplicateFinal =
            transcript === this.lastFinalTranscript &&
            now - this.lastFinalAt < dedupeWindowMs;
          if (!duplicateFinal) {
            this.lastFinalTranscript = transcript;
            this.lastFinalAt = now;
            this.emit("final", transcript);
          }
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

    this.socket.connect();
    console.log(
      `[Deepgram] connecting callSid=${this.callSid} model=${connectOptions.model} language=${connectOptions.language}`
    );
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

module.exports = {
  DeepgramService,
  resolveDeepgramListenConfig,
  extractDetectedLanguages,
  ENGLISH_ONLY_MODELS,
  DEFAULT_MULTILINGUAL_MODEL,
};
