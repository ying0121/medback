/**
 * InboundTtsService
 *
 * Streams μ-law 8 kHz audio via ElevenLabs for a single inbound call.
 * Uses per-clinic API key and voice ID loaded from the clinics table.
 *
 * Returns a Node.js Readable stream of raw μ-law audio chunks that can be
 * forwarded directly over the Twilio Media Streams WebSocket without any
 * format conversion.
 *
 * If ElevenLabs credentials are not configured the service logs a warning
 * and returns null — the session pipeline handles the null case gracefully.
 */

const { ElevenLabsClient } = require("elevenlabs");
const { Readable } = require("stream");

/**
 * ElevenLabs streaming responses may be a Web ReadableStream, a Node Readable, or an async iterable.
 * InboundCallSession expects a Node.js Readable with .on("data").
 */
function toNodeReadableStream(body, callSid) {
  if (!body) return null;
  if (typeof body.on === "function" && typeof body.pipe === "function") {
    return body;
  }
  if (typeof Readable.fromWeb === "function" && typeof body.getReader === "function") {
    try {
      return Readable.fromWeb(body);
    } catch (err) {
      console.warn(`[InboundTTS] Readable.fromWeb failed callSid=${callSid}: ${err.message}`);
    }
  }
  if (typeof body.getReader === "function") {
    const reader = body.getReader();
    return Readable.from(
      (async function* ulawChunks() {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) yield Buffer.isBuffer(value) ? value : Buffer.from(value);
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            /* ignore */
          }
        }
      })(),
      { objectMode: false }
    );
  }
  if (body && typeof body[Symbol.asyncIterator] === "function") {
    return Readable.from(body, { objectMode: false });
  }
  console.warn(
    `[InboundTTS] unknown stream type callSid=${callSid} keys=${body && typeof body === "object" ? Object.keys(body).slice(0, 8).join(",") : typeof body}`
  );
  return null;
}

class InboundTtsService {
  /**
   * @param {string} callSid
   * @param {string|null} apiKey   – per-clinic ElevenLabs API key
   * @param {string|null} voiceId  – per-clinic ElevenLabs voice ID
   */
  constructor(callSid, apiKey, voiceId) {
    this.callSid = callSid;
    this.voiceId = String(voiceId || "").trim() || null;
    this.model =
      String(process.env.ELEVENLABS_INBOUND_TTS_MODEL || process.env.ELEVENLABS_TTS_MODEL || "").trim() ||
      "eleven_turbo_v2_5";

    const key = String(apiKey || "").trim() || null;
    this.client = key ? new ElevenLabsClient({ apiKey: key }) : null;
  }

  /**
   * Stream audio for a single sentence/chunk of text.
   * @param {string} text
   * @returns {Promise<import("stream").Readable|null>}
   */
  async streamAudio(text) {
    if (!text?.trim()) return null;

    if (!this.client || !this.voiceId) {
      console.warn(`[InboundTTS] ElevenLabs not configured — skipping TTS for callSid=${this.callSid}`);
      return null;
    }

    try {
      // ElevenLabs SDK v1.x+ uses textToSpeech.convertAsStream() which returns
      // a web ReadableStream. Convert to Node.js Readable so callers can use .on().
      const rawBody = await this.client.textToSpeech.convertAsStream(this.voiceId, {
        text,
        model_id: this.model,
        output_format: "ulaw_8000",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.0,
          use_speaker_boost: false,
        },
      });

      return toNodeReadableStream(rawBody, this.callSid);
    } catch (err) {
      console.error(`[InboundTTS] ElevenLabs error callSid=${this.callSid}: ${err.message}`);
      return null;
    }
  }
}

module.exports = { InboundTtsService };
