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
      const audioStream = await this.client.generate({
        voice: this.voiceId,
        text,
        model_id: this.model,
        stream: true,
        output_format: "ulaw_8000",
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.8,
          style: 0.0,
          use_speaker_boost: false,
        },
      });

      return audioStream;
    } catch (err) {
      console.error(`[InboundTTS] ElevenLabs error callSid=${this.callSid}: ${err.message}`);
      return null;
    }
  }
}

module.exports = { InboundTtsService };
