const axios = require("axios");

const ELEVEN_BASE = "https://api.elevenlabs.io/v1";

/**
 * ElevenLabs list-voice payloads use `preview_url` (often GCS). Some entries expose alternates.
 * @param {Record<string, unknown>} v
 * @returns {string | null}
 */
/**
 * @param {Record<string, unknown>} v
 * @returns {string | null}
 */
function pickImageUrlFromVoice(v) {
  const raw =
    v.image_url ||
    v.imageUrl ||
    v.avatar_url ||
    v.avatarUrl ||
    null;
  if (!raw) return null;
  const s = String(raw).trim();
  return s.length ? s : null;
}

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
 * @param {string} key
 * @returns {string}
 */
function normalizeLabelKey(key) {
  return String(key || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {Record<string, string>}
 */
function normalizeLabels(raw) {
  if (!raw || typeof raw !== "object") return {};
  const out = {};
  for (const [k, val] of Object.entries(raw)) {
    const normalized = normalizeLabelKey(k);
    const text = String(val ?? "").trim();
    if (normalized && text) out[normalized] = text;
  }
  return out;
}

/**
 * @param {unknown} entry
 * @returns {{ language: string; locale: string | null; accent: string | null } | null}
 */
function mapVerifiedLanguage(entry) {
  if (!entry || typeof entry !== "object") return null;
  const language = String(entry.language || "").trim();
  if (!language) return null;
  const locale = String(entry.locale || "").trim() || null;
  const accent = String(entry.accent || "").trim() || null;
  return { language, locale, accent };
}

/**
 * @param {Record<string, unknown>} v
 * @returns {{
 *   voice_id: string;
 *   name: string;
 *   category: string | null;
 *   description: string | null;
 *   language: string | null;
 *   labels: Record<string, string>;
 *   verified_languages: Array<{ language: string; locale: string | null; accent: string | null }>;
 *   preview_url: string | null;
 *   image_url: string | null;
 *   source: "workspace" | "shared";
 * }}
 */
function mapWorkspaceVoiceForAdmin(v) {
  const labels = normalizeLabels(v.labels);
  const verified = Array.isArray(v.verified_languages) ? v.verified_languages : [];
  const verifiedLanguages = verified
    .map(mapVerifiedLanguage)
    .filter(Boolean);

  const language =
    String(v.language || labels.language || "").trim() ||
    (verifiedLanguages[0] ? verifiedLanguages[0].language : "") ||
    null;

  return {
    voice_id: String(v.voice_id || "").trim(),
    name: String(v.name || "").trim() || "Voice",
    category: v.category ? String(v.category) : null,
    description: v.description ? String(v.description).trim() : null,
    language: language || null,
    labels,
    verified_languages: verifiedLanguages,
    preview_url: pickPreviewUrlFromVoice(v),
    image_url: pickImageUrlFromVoice(v),
    source: "workspace"
  };
}

/** @param {Record<string, unknown>} v */
function mapSharedVoiceForAdmin(v) {
  const labels = normalizeLabels({
    gender: v.gender,
    age: v.age,
    accent: v.accent,
    use_case: v.use_case,
    descriptive: v.descriptive,
    language: v.language
  });

  return {
    voice_id: String(v.voice_id || "").trim(),
    name: String(v.name || "").trim() || "Voice",
    category: v.category ? String(v.category) : null,
    description: v.description ? String(v.description).trim() : null,
    language: v.language ? String(v.language) : labels.language || null,
    labels,
    verified_languages: [],
    preview_url: pickPreviewUrlFromVoice(v),
    image_url: pickImageUrlFromVoice(v),
    source: "shared"
  };
}

const FILTER_LANG_TO_API = {
  english: "en",
  spanish: "es",
  french: "fr",
  german: "de",
  italian: "it",
  portuguese: "pt",
  japanese: "ja",
  chinese: "zh",
  korean: "ko",
  arabic: "ar",
  hindi: "hi",
  dutch: "nl",
  polish: "pl",
  turkish: "tr",
  russian: "ru"
};

/**
 * @param {string} raw
 * @returns {string|undefined}
 */
function mapLanguageFilterToApi(raw) {
  const key = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!key || key === "all" || key === "multi") return undefined;
  if (FILTER_LANG_TO_API[key]) return FILTER_LANG_TO_API[key];
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(key)) return key;
  return key;
}

/**
 * @param {string} apiKey
 * @returns {Promise<ReturnType<typeof mapWorkspaceVoiceForAdmin>[]>}
 */
async function listWorkspaceVoices(apiKey) {
  if (!apiKey) throw new Error("Missing ElevenLabs API key.");
  const res = await axios.get(`${ELEVEN_BASE}/voices`, {
    headers: { "xi-api-key": apiKey },
    timeout: 45000
  });
  const voices = Array.isArray(res.data?.voices) ? res.data.voices : [];
  return voices.map(mapWorkspaceVoiceForAdmin).filter((v) => v.voice_id);
}

/**
 * Paginated voice library (community voices) — supports scroll-to-load-more.
 * @param {string} apiKey
 * @param {{
 *   page?: number;
 *   page_size?: number;
 *   language?: string;
 *   gender?: string;
 *   age?: string;
 *   accent?: string;
 *   category?: string;
 *   search?: string;
 * }} [opts]
 */
async function listSharedVoicesPage(apiKey, opts = {}) {
  if (!apiKey) throw new Error("Missing ElevenLabs API key.");

  const page = Math.max(1, parseInt(String(opts.page || "1"), 10) || 1);
  const pageSize = Math.min(
    50,
    Math.max(10, parseInt(String(opts.page_size || "24"), 10) || 24)
  );

  const params = { page, page_size: pageSize };

  const lang = mapLanguageFilterToApi(opts.language);
  if (lang) params.language = lang;

  const gender = String(opts.gender || "").trim().toLowerCase();
  if (gender && gender !== "all") params.gender = gender;

  const age = String(opts.age || "").trim().toLowerCase().replace(/\s+/g, "_");
  if (age && age !== "all") params.age = age;

  const accent = String(opts.accent || "").trim().toLowerCase();
  if (accent && accent !== "all") params.accent = accent;

  const category = String(opts.category || "").trim().toLowerCase();
  if (category && category !== "all") params.category = category;

  const search = String(opts.search || "").trim();
  if (search) params.search = search;

  const res = await axios.get(`${ELEVEN_BASE}/shared-voices`, {
    headers: { "xi-api-key": apiKey },
    params,
    timeout: 45000
  });

  const voices = Array.isArray(res.data?.voices) ? res.data.voices : [];
  const mapped = voices.map(mapSharedVoiceForAdmin).filter((v) => v.voice_id);
  const hasMore = Boolean(
    res.data?.has_more ?? (mapped.length >= pageSize && mapped.length > 0)
  );

  return {
    voices: mapped,
    page,
    page_size: pageSize,
    has_more: hasMore
  };
}

/**
 * Workspace voices on page 1, then paginated shared library.
 * @param {string} apiKey
 * @param {Parameters<typeof listSharedVoicesPage>[1]} [opts]
 */
async function listVoicesForAdmin(apiKey, opts = {}) {
  const page = Math.max(1, parseInt(String(opts.page || "1"), 10) || 1);

  if (page > 1) {
    return listSharedVoicesPage(apiKey, opts);
  }

  const [workspace, shared] = await Promise.all([
    listWorkspaceVoices(apiKey),
    listSharedVoicesPage(apiKey, opts)
  ]);

  const seen = new Set();
  const merged = [];

  for (const voice of workspace) {
    if (seen.has(voice.voice_id)) continue;
    seen.add(voice.voice_id);
    merged.push(voice);
  }
  for (const voice of shared.voices) {
    if (seen.has(voice.voice_id)) continue;
    seen.add(voice.voice_id);
    merged.push(voice);
  }

  return {
    voices: merged,
    page: 1,
    page_size: shared.page_size,
    has_more: shared.has_more
  };
}

/** @deprecated Use listWorkspaceVoices or listVoicesForAdmin */
async function listVoices(apiKey) {
  const result = await listVoicesForAdmin(apiKey, { page: 1, page_size: 100 });
  return result.voices;
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
  listWorkspaceVoices,
  listSharedVoicesPage,
  listVoicesForAdmin,
  textToSpeechMp3,
  defaultTtsModel
};
