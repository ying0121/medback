/**
 * Fetch / categorize OpenAI models for Agents admin UI.
 */

const DEFAULT_CHAT = [
  "gpt-5.4-mini",
  "gpt-5.4",
  "gpt-4.1-mini",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4o"
];

const DEFAULT_REALTIME = [
  "gpt-realtime-1.5",
  "gpt-realtime-2",
  "gpt-realtime",
  "gpt-realtime-mini"
];

const DEFAULT_TRANSCRIPTION = [
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "whisper-1"
];

const DEFAULT_TTS = ["gpt-5.4-mini-tts", "gpt-4o-mini-tts", "tts-1", "tts-1-hd"];

function uniqueSorted(list) {
  return [...new Set((list || []).map((x) => String(x || "").trim()).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b)
  );
}

function categorizeModelId(id) {
  const s = String(id || "").toLowerCase();
  if (!s) return null;
  if (s.includes("realtime")) return "realtime";
  if (s.includes("transcribe") || s.includes("whisper")) return "transcription";
  if (s.includes("tts") || s.startsWith("tts-")) return "tts";
  if (
    s.includes("embedding") ||
    s.includes("moderation") ||
    s.includes("dall-e") ||
    s.includes("image") ||
    s.includes("audio") ||
    s.includes("search") ||
    s.includes("omni-moderation")
  ) {
    return "other";
  }
  if (s.includes("gpt") || s.includes("o1") || s.includes("o3") || s.includes("o4")) {
    return "chat";
  }
  return "other";
}

/**
 * @param {string} apiKey
 * @returns {Promise<{
 *   chat: string[],
 *   realtime: string[],
 *   transcription: string[],
 *   tts: string[],
 *   other: string[],
 *   source: "api"|"fallback",
 *   error?: string
 * }>}
 */
async function listOpenAiModelsForAdmin(apiKey) {
  const key = String(apiKey || process.env.OPENAI_API_KEY || "").trim();
  const fallback = {
    chat: uniqueSorted([
      ...DEFAULT_CHAT,
      process.env.OPENAI_MODEL,
      process.env.OPENAI_INBOUND_MODEL
    ]),
    realtime: uniqueSorted([
      ...DEFAULT_REALTIME,
      process.env.OPENAI_REALTIME_MODEL
    ]),
    transcription: uniqueSorted([
      ...DEFAULT_TRANSCRIPTION,
      process.env.OPENAI_TRANSCRIPTION_MODEL,
      process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL
    ]),
    tts: uniqueSorted([...DEFAULT_TTS, process.env.OPENAI_TTS_MODEL]),
    other: [],
    source: "fallback"
  };

  if (!key) {
    return { ...fallback, error: "No OpenAI API key available." };
  }

  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${key}`
      }
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return {
        ...fallback,
        error: `OpenAI models API ${res.status}: ${text.slice(0, 200)}`
      };
    }
    const data = await res.json();
    const ids = (Array.isArray(data?.data) ? data.data : [])
      .map((m) => m?.id)
      .filter(Boolean);

    const buckets = {
      chat: [],
      realtime: [],
      transcription: [],
      tts: [],
      other: []
    };
    for (const id of ids) {
      const cat = categorizeModelId(id);
      if (!cat || cat === "other") {
        // keep only useful gpt-like others out of noise — skip most "other"
        continue;
      }
      buckets[cat].push(id);
    }

    // Ensure env defaults appear even if API omits them
    return {
      chat: uniqueSorted([...buckets.chat, ...fallback.chat]),
      realtime: uniqueSorted([...buckets.realtime, ...fallback.realtime]),
      transcription: uniqueSorted([...buckets.transcription, ...fallback.transcription]),
      tts: uniqueSorted([...buckets.tts, ...fallback.tts]),
      other: uniqueSorted(buckets.other),
      source: "api"
    };
  } catch (err) {
    return {
      ...fallback,
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

module.exports = {
  listOpenAiModelsForAdmin,
  categorizeModelId
};
