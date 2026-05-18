const axios = require("axios");

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

/**
 * ElevenLabs list-voice payloads use `preview_url` (often GCS). Some entries expose alternates.
 * @param {Record<string, unknown>} v
 * @returns {string | null}
 */
function pickPreviewUrlFromVoice(v) {
  const samples = Array.isArray(v.samples) ? v.samples : [];
  const firstSample = samples[0] && typeof samples[0] === "object" ? samples[0] : null;
  const raw =
    v.preview_url ||
    v.previewUrl ||
    v.high_quality_base_model_preview_url ||
    (firstSample && (firstSample.preview_url || firstSample.url)) ||
    null;
  if (!raw) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

function defaultTtsModel() {
  return String(process.env.ELEVENLABS_TTS_MODEL || "").trim() || "eleven_multilingual_v2";
}

/**
 * @param {string} apiKey
 * @returns {Promise<Array<{ voice_id: string; name: string; category: string | null; labels: Record<string, string>; preview_url: string | null }>>}
 */
async function listVoices(apiKey) {
  if (!apiKey) throw new Error("Missing ElevenLabs API key.");
  const res = await axios.get(`${ELEVEN_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
    timeout: 45000
  });
  const voices = Array.isArray(res.data?.voices) ? res.data.voices : [];
  return voices.map((v) => ({
    voice_id: String(v.voice_id || "").trim(),
    name: String(v.name || "").trim() || "Voice",
    category: v.category ? String(v.category) : null,
    labels: v.labels && typeof v.labels === "object" ? v.labels : {},
    preview_url: pickPreviewUrlFromVoice(v)
  }));
}

/**
 * @param {string} apiKey
 * @param {string} voiceId
 * @param {string} text
 * @param {{ modelId?: string }} [opts]
 * @returns {Promise<Buffer>}
 */
async function textToSpeechMp3(apiKey, voiceId, text, opts = {}) {
  if (!apiKey) throw new Error("Missing ElevenLabs API key.");
  if (!voiceId) throw new Error("Missing voice id.");
  const bodyText = String(text || "").trim();
  if (!bodyText) throw new Error("Missing text for speech synthesis.");

  const modelId = opts.modelId || defaultTtsModel();
  const url = `${ELEVEN_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`;

  const res = await axios.post(
    url,
    {
      text: bodyText.slice(0, 2500),
      model_id: modelId
    },
    {
      headers: {
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
        "Content-Type": "application/json"
      },
      responseType: "arraybuffer",
      timeout: 120000
    }
  );
  return Buffer.from(res.data);
}

module.exports = {
  listVoices,
  textToSpeechMp3,
  defaultTtsModel
};
