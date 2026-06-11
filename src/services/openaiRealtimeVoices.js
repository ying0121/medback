/**
 * Built-in voices for OpenAI Realtime / TTS.
 * @see https://platform.openai.com/docs/guides/realtime
 */

const OPENAI_REALTIME_VOICES = [
  { id: "marin", name: "Marin", description: "Warm, natural (recommended)" },
  { id: "cedar", name: "Cedar", description: "Clear, professional (recommended)" },
  { id: "alloy", name: "Alloy", description: "Neutral and balanced" },
  { id: "ash", name: "Ash", description: "Confident and direct" },
  { id: "ballad", name: "Ballad", description: "Soft and expressive" },
  { id: "coral", name: "Coral", description: "Friendly and upbeat" },
  { id: "echo", name: "Echo", description: "Calm and steady" },
  { id: "sage", name: "Sage", description: "Thoughtful and measured" },
  { id: "shimmer", name: "Shimmer", description: "Bright and energetic" },
  { id: "verse", name: "Verse", description: "Dynamic and versatile" }
];

const VOICE_IDS = new Set(OPENAI_REALTIME_VOICES.map((v) => v.id));

const DEFAULT_OPENAI_REALTIME_VOICE =
  String(process.env.OPENAI_REALTIME_VOICE || process.env.OPENAI_TTS_VOICE || "marin").trim() ||
  "marin";

function resolveOpenAiVoice(raw) {
  const voice = String(raw || "").trim().toLowerCase();
  if (voice && VOICE_IDS.has(voice)) return voice;
  if (VOICE_IDS.has(DEFAULT_OPENAI_REALTIME_VOICE)) return DEFAULT_OPENAI_REALTIME_VOICE;
  return "marin";
}

function listOpenAiVoicesForAdmin() {
  return OPENAI_REALTIME_VOICES.map((v) => ({ ...v }));
}

module.exports = {
  OPENAI_REALTIME_VOICES,
  DEFAULT_OPENAI_REALTIME_VOICE,
  resolveOpenAiVoice,
  listOpenAiVoicesForAdmin
};
