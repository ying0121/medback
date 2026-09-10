/**
 * Agent test lab — sandbox turns for an agent profile.
 * Production behavior assembly lives in agentRuntimeService.
 */

const {
  normalizeAgentRow,
  parseIdList,
  buildAgentBehaviorContext
} = require("./agentRuntimeService");
const { resolveOpenAiVoice } = require("./openaiRealtimeVoices");
const { generateAssistantReply, generateSpeechFromText } = require("./openaiService");

/**
 * Normalize either a Sequelize Agent row or a draft payload from the admin UI.
 */
function normalizeAgentConfig(source = {}) {
  if (source && typeof source.get === "function") {
    return normalizeAgentRow(source);
  }
  return {
    id: source.id != null ? String(source.id) : null,
    title: String(source.title || "Test agent").trim() || "Test agent",
    description: String(source.description || "").trim(),
    openaiApiKey: String(source.openaiApiKey || "").trim(),
    openaiModel: String(source.openaiModel || "").trim(),
    openaiRealtimeModel: String(source.openaiRealtimeModel || "").trim(),
    openaiTranscriptionModel: String(source.openaiTranscriptionModel || "").trim(),
    openaiTtsModel: String(source.openaiTtsModel || "").trim(),
    openaiInboundModel: String(source.openaiInboundModel || "").trim(),
    openaiVoice: resolveOpenAiVoice(source.openaiVoice) || "marin",
    flowId: source.flowId != null && source.flowId !== "" ? String(source.flowId) : null,
    knowledgeIds: parseIdList(source.knowledgeIds)
  };
}

async function buildAgentTestSystemPrompt(agentConfig, { language = "English" } = {}) {
  const config = normalizeAgentConfig(agentConfig);
  const ctx = await buildAgentBehaviorContext({
    agent: config,
    clinic: null,
    channel: "chat",
    language,
    fallbackClinicKnowledge: false,
    campaign: { name: `${config.title} (test lab)` },
    patient: {
      patientFirstName: "Test",
      patientLastName: "Patient",
      patientLanguage: language
    }
  });

  const parts = [
    `You are running inside the MedBot Agent Test Lab for agent "${config.title}".`,
    "This is a sandbox. Behave exactly as the production bot would with this agent profile.",
    ctx.systemPrompt || ""
  ].filter(Boolean);

  return {
    systemPrompt: parts.join("\n\n"),
    meta: {
      flowId: ctx.flowId,
      flowName: ctx.flowName,
      knowledgeCount: ctx.knowledgeCount,
      model: config.openaiModel || process.env.OPENAI_MODEL || "gpt-5.4-mini",
      voice: config.openaiVoice,
      realtimeModel: config.openaiRealtimeModel || null
    }
  };
}

async function runAgentTestTurn({
  agentConfig,
  messages = [],
  language = "English",
  speak = false
} = {}) {
  const config = normalizeAgentConfig(agentConfig);
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw new Error("No OpenAI API key on this agent or in server .env.");
  }

  const turns = (Array.isArray(messages) ? messages : [])
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").trim()
    }))
    .filter((m) => m.content);

  if (!turns.length) {
    throw new Error("Send at least one user message.");
  }

  const { systemPrompt, meta } = await buildAgentTestSystemPrompt(config, { language });
  const model =
    config.openaiModel ||
    config.openaiInboundModel ||
    process.env.OPENAI_MODEL ||
    "gpt-5.4-mini";

  const reply = await generateAssistantReply(turns, {
    apiKey,
    model,
    systemPrompt,
    temperature: 0.45,
    maxCompletionTokens: 700
  });

  const result = {
    reply: String(reply || "").trim(),
    meta: { ...meta, model }
  };

  if (speak && result.reply) {
    const speech = await generateSpeechFromText({
      text: result.reply,
      voice: config.openaiVoice,
      apiKey,
      model: config.openaiTtsModel || process.env.OPENAI_TTS_MODEL || null
    });
    result.audioBase64 = speech.audioBase64;
    result.audioMimeType = speech.audioMimeType;
  }

  return result;
}

async function previewAgentVoiceAudio({
  voice,
  apiKey = null,
  ttsModel = null,
  text = null
} = {}) {
  const resolved = resolveOpenAiVoice(voice);
  if (!resolved) {
    throw new Error("voice is required.");
  }
  const sample =
    String(text || process.env.OPENAI_VOICE_PREVIEW_TEXT || "").trim() ||
    "Hello, this is a short preview of how I will sound with this agent.";

  return generateSpeechFromText({
    text: sample,
    voice: resolved,
    apiKey: apiKey || process.env.OPENAI_API_KEY || null,
    model: ttsModel || process.env.OPENAI_TTS_MODEL || null
  });
}

module.exports = {
  normalizeAgentConfig,
  buildAgentTestSystemPrompt,
  runAgentTestTurn,
  previewAgentVoiceAudio
};
