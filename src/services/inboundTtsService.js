/**
 * InboundTtsService
 *
 * Streams μ-law 8 kHz audio via ElevenLabs for a single inbound call.
 * Uses per-clinic API key and voice ID loaded from the clinics table.
 *
 * Returns the raw HTTP response body (a WHATWG ReadableStream on Node 18+).
 * InboundCallSession._streamTTSToTwilio handles consumption via getReader().
 *
 * If ElevenLabs credentials are not configured the service logs a warning
 * and returns null — the session pipeline handles the null case gracefully.
 */

const { ElevenLabsClient } = require("elevenlabs");

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
   * Stream audio for a chunk of text.
   * Returns the raw WHATWG ReadableStream from ElevenLabs (on Node 18+) or
   * null when ElevenLabs is not configured or the call fails.
   * @param {string} text
   * @returns {Promise<ReadableStream|null>}
   */
  async streamAudio(text) {
    if (!text?.trim()) return null;

    if (!this.client || !this.voiceId) {
      console.error(
        `[InboundTTS] ElevenLabs NOT configured — client=${!!this.client} voiceId=${!!this.voiceId} callSid=${this.callSid}`
      );
      return null;
    }

    console.log(`[InboundTTS] calling ElevenLabs voiceId=${this.voiceId} model=${this.model} callSid=${this.callSid}`);

    try {
      // convertAsStream() returns response.body — a WHATWG ReadableStream on
      // Node 18+.  InboundCallSession reads it directly via getReader().
      const stream = await this.client.textToSpeech.convertAsStream(this.voiceId, {
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

      console.log(
        `[InboundTTS] stream ready callSid=${this.callSid} type=${
          typeof stream?.getReader === "function"
            ? "WebReadableStream"
            : typeof stream?.[Symbol.asyncIterator] === "function"
            ? "AsyncIterable"
            : typeof stream?.on === "function"
            ? "NodeReadable"
            : typeof stream
        }`
      );

      return stream;
    } catch (err) {
      console.error(`[InboundTTS] ElevenLabs error callSid=${this.callSid}: ${err.message}`);
      return null;
    }
  }
}

module.exports = { InboundTtsService };
