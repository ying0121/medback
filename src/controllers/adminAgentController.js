const { Agent, ConversationFlow, Knowledge } = require("../db");
const { listOpenAiModelsForAdmin } = require("../services/openaiModelsService");
const { listOpenAiVoicesForAdmin, resolveOpenAiVoice } = require("../services/openaiRealtimeVoices");
const {
  normalizeAgentConfig,
  runAgentTestTurn,
  previewAgentVoiceAudio
} = require("../services/agentTestService");

function parseIdList(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return [...new Set(raw.map((v) => String(v).trim()).filter(Boolean))];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.map((v) => String(v).trim()).filter(Boolean))];
  } catch {
    return [];
  }
}

function serializeIdList(ids) {
  const safe = parseIdList(ids);
  return safe.length ? JSON.stringify(safe) : null;
}

function cleanStr(value, max = 255) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.slice(0, max);
}

function maskSecret(value) {
  const s = String(value || "");
  if (!s) return "";
  if (s.length <= 8) return "••••••••";
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function isTwilioConfigured(row) {
  return Boolean(
    row.twilioPhoneNumber &&
      row.twilioCallerId &&
      row.twilioAccountSid &&
      row.twilioAuthToken &&
      row.twilioApiKeySid &&
      row.twilioApiKeySecret &&
      row.twilioTwimlAppSid
  );
}

function isMeetingConfigured(row) {
  const provider = row.meetingProvider || "google";
  if (provider === "ecw") return Boolean(row.ecwApiEndpoint);
  if (provider === "azul") return Boolean(row.azulApiEndpoint);
  return Boolean(row.googleClientId && row.googleClientSecret && row.googleRefreshToken);
}

function toAgentDto(row, { revealSecrets = false } = {}) {
  if (!row) return null;
  const knowledgeIds = parseIdList(row.knowledgeIds);
  return {
    id: String(row.id),
    title: row.title || "",
    description: row.description || "",
    status: row.status || "active",
    openaiApiKey: revealSecrets ? row.openaiApiKey || "" : maskSecret(row.openaiApiKey),
    openaiApiKeySet: Boolean(row.openaiApiKey),
    openaiModel: row.openaiModel || "",
    openaiRealtimeModel: row.openaiRealtimeModel || "",
    openaiTranscriptionModel: row.openaiTranscriptionModel || "",
    openaiTtsModel: row.openaiTtsModel || "",
    openaiInboundModel: row.openaiInboundModel || "",
    openaiVoice: row.openaiVoice || "",
    twilioPhoneNumber: row.twilioPhoneNumber || "",
    twilioCallerId: row.twilioCallerId || "",
    twilioAccountSid: row.twilioAccountSid || "",
    twilioAuthToken: revealSecrets ? row.twilioAuthToken || "" : maskSecret(row.twilioAuthToken),
    twilioAuthTokenSet: Boolean(row.twilioAuthToken),
    twilioApiKeySid: row.twilioApiKeySid || "",
    twilioApiKeySecret: revealSecrets
      ? row.twilioApiKeySecret || ""
      : maskSecret(row.twilioApiKeySecret),
    twilioApiKeySecretSet: Boolean(row.twilioApiKeySecret),
    twilioTwimlAppSid: row.twilioTwimlAppSid || "",
    twilioConfigured: isTwilioConfigured(row),
    meetingProvider: row.meetingProvider || "google",
    googleClientId: row.googleClientId || "",
    googleClientSecret: revealSecrets
      ? row.googleClientSecret || ""
      : maskSecret(row.googleClientSecret),
    googleClientSecretSet: Boolean(row.googleClientSecret),
    googleRefreshToken: revealSecrets
      ? row.googleRefreshToken || ""
      : maskSecret(row.googleRefreshToken),
    googleRefreshTokenSet: Boolean(row.googleRefreshToken),
    googleCreateMeet: Boolean(row.googleCreateMeet),
    ecwApiEndpoint: row.ecwApiEndpoint || "",
    azulApiEndpoint: row.azulApiEndpoint || "",
    meetingConfigured: isMeetingConfigured(row),
    flowId: row.flowId != null ? String(row.flowId) : null,
    knowledgeIds,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  };
}

function pickSecret(incoming, existing, { clear = false } = {}) {
  if (clear) return null;
  if (incoming === undefined || incoming === null) return existing ?? null;
  const s = String(incoming).trim();
  if (!s) return existing ?? null;
  // Ignore masked placeholders sent back from the UI
  if (s.includes("…") || s.includes("•")) return existing ?? null;
  return s;
}

function buildPatch(body, existing = null) {
  const src = body && typeof body === "object" ? body : {};
  const patch = {};

  if (src.title !== undefined) {
    const title = cleanStr(src.title, 255);
    if (!title) return { error: "Title is required." };
    patch.title = title;
  }
  if (src.description !== undefined) {
    patch.description = cleanStr(src.description, 4000) || null;
  }
  if (src.status !== undefined) {
    const status = cleanStr(src.status, 16) || "active";
    if (!["active", "inactive"].includes(status)) {
      return { error: "Status must be active or inactive." };
    }
    patch.status = status;
  }

  if (src.openaiApiKey !== undefined) {
    patch.openaiApiKey = pickSecret(src.openaiApiKey, existing?.openaiApiKey, {
      clear: src.clearOpenaiApiKey === true
    });
  }
  for (const [key, col] of [
    ["openaiModel", "openaiModel"],
    ["openaiRealtimeModel", "openaiRealtimeModel"],
    ["openaiTranscriptionModel", "openaiTranscriptionModel"],
    ["openaiTtsModel", "openaiTtsModel"],
    ["openaiInboundModel", "openaiInboundModel"],
    ["openaiVoice", "openaiVoice"]
  ]) {
    if (src[key] !== undefined) patch[col] = cleanStr(src[key], 128) || null;
  }

  for (const key of [
    "twilioPhoneNumber",
    "twilioCallerId",
    "twilioAccountSid",
    "twilioApiKeySid",
    "twilioTwimlAppSid"
  ]) {
    if (src[key] !== undefined) patch[key] = cleanStr(src[key], 128) || null;
  }
  if (src.twilioAuthToken !== undefined) {
    patch.twilioAuthToken = pickSecret(src.twilioAuthToken, existing?.twilioAuthToken);
  }
  if (src.twilioApiKeySecret !== undefined) {
    patch.twilioApiKeySecret = pickSecret(src.twilioApiKeySecret, existing?.twilioApiKeySecret);
  }

  if (src.meetingProvider !== undefined) {
    const p = cleanStr(src.meetingProvider, 16) || "google";
    if (!["google", "ecw", "azul"].includes(p)) {
      return { error: "Invalid meeting provider." };
    }
    patch.meetingProvider = p;
  }
  if (src.googleClientId !== undefined) {
    patch.googleClientId = cleanStr(src.googleClientId, 2000) || null;
  }
  if (src.googleClientSecret !== undefined) {
    patch.googleClientSecret = pickSecret(src.googleClientSecret, existing?.googleClientSecret);
  }
  if (src.googleRefreshToken !== undefined) {
    patch.googleRefreshToken = pickSecret(src.googleRefreshToken, existing?.googleRefreshToken);
  }
  if (src.googleCreateMeet !== undefined) {
    patch.googleCreateMeet = Boolean(src.googleCreateMeet);
  }
  if (src.ecwApiEndpoint !== undefined) {
    patch.ecwApiEndpoint = cleanStr(src.ecwApiEndpoint, 2000) || null;
  }
  if (src.azulApiEndpoint !== undefined) {
    patch.azulApiEndpoint = cleanStr(src.azulApiEndpoint, 2000) || null;
  }

  if (src.flowId !== undefined) {
    if (src.flowId === null || src.flowId === "") patch.flowId = null;
    else {
      const n = Number(src.flowId);
      if (!n) return { error: "Invalid flow id." };
      patch.flowId = n;
    }
  }
  if (src.knowledgeIds !== undefined) {
    patch.knowledgeIds = serializeIdList(src.knowledgeIds);
  }

  return { patch };
}

async function listAgents(req, res, next) {
  try {
    const rows = await Agent.findAll({ order: [["updated_at", "DESC"], ["id", "DESC"]] });
    return res.status(200).json({ agents: rows.map((r) => toAgentDto(r)) });
  } catch (err) {
    return next(err);
  }
}

async function getAgent(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid agent id." });
    const row = await Agent.findByPk(id);
    if (!row) return res.status(404).json({ error: "Agent not found." });
    const reveal = String(req.query.reveal || "") === "1";
    return res.status(200).json({ agent: toAgentDto(row, { revealSecrets: reveal }) });
  } catch (err) {
    return next(err);
  }
}

async function createAgent(req, res, next) {
  try {
    const title = cleanStr(req.body?.title, 255);
    if (!title) return res.status(400).json({ error: "Title is required." });

    const { patch, error } = buildPatch({ ...req.body, title }, null);
    if (error) return res.status(400).json({ error });

    const created = await Agent.create({
      title,
      description: patch.description ?? null,
      status: patch.status || "active",
      ...patch
    });
    return res.status(201).json({ agent: toAgentDto(created) });
  } catch (err) {
    return next(err);
  }
}

async function updateAgent(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid agent id." });
    const row = await Agent.findByPk(id);
    if (!row) return res.status(404).json({ error: "Agent not found." });

    const { patch, error } = buildPatch(req.body, row);
    if (error) return res.status(400).json({ error });
    if (!Object.keys(patch).length) {
      return res.status(400).json({ error: "No fields to update." });
    }

    await row.update(patch);
    return res.status(200).json({ agent: toAgentDto(row) });
  } catch (err) {
    return next(err);
  }
}

async function deleteAgent(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid agent id." });
    const deleted = await Agent.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: "Agent not found." });
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

async function listAgentModels(req, res, next) {
  try {
    const keyFromBody = req.body?.apiKey || req.query?.apiKey;
    const agentId = Number(req.query.agentId || req.body?.agentId || 0);
    let apiKey = keyFromBody;
    if ((!apiKey || String(apiKey).includes("…")) && agentId) {
      const row = await Agent.findByPk(agentId);
      apiKey = row?.openaiApiKey || "";
    }
    const models = await listOpenAiModelsForAdmin(apiKey);
    return res.status(200).json({
      models,
      defaults: {
        openaiModel: process.env.OPENAI_MODEL || "gpt-5.4-mini",
        openaiRealtimeModel: process.env.OPENAI_REALTIME_MODEL || "gpt-realtime-1.5",
        openaiTranscriptionModel:
          process.env.OPENAI_REALTIME_TRANSCRIPTION_MODEL ||
          process.env.OPENAI_TRANSCRIPTION_MODEL ||
          "gpt-4o-mini-transcribe",
        openaiTtsModel: process.env.OPENAI_TTS_MODEL || "gpt-5.4-mini-tts",
        openaiInboundModel:
          process.env.OPENAI_INBOUND_MODEL || process.env.OPENAI_MODEL || "gpt-5.4-mini",
        openaiVoice: process.env.OPENAI_REALTIME_VOICE || process.env.OPENAI_TTS_VOICE || "marin"
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function listAgentVoices(req, res, next) {
  try {
    return res.status(200).json({ voices: listOpenAiVoicesForAdmin() });
  } catch (err) {
    return next(err);
  }
}

async function listAgentLinkOptions(req, res, next) {
  try {
    const [flows, knowledge] = await Promise.all([
      ConversationFlow.findAll({
        where: { status: "active" },
        order: [["name", "ASC"], ["id", "DESC"]]
      }),
      Knowledge.findAll({
        where: { status: "active" },
        order: [["id", "DESC"]]
      })
    ]);

    return res.status(200).json({
      flows: flows.map((f) => ({
        id: String(f.id),
        name: f.name,
        description: f.description || "",
        status: f.status
      })),
      knowledge: knowledge.map((k) => ({
        id: String(k.id),
        knowledge: String(k.knowledge || "").slice(0, 160),
        promptKey: k.promptKey || "",
        status: k.status
      }))
    });
  } catch (err) {
    return next(err);
  }
}

async function resolveAgentConfigFromRequest(req) {
  const body = req.body || {};
  const agentId = Number(body.agentId || req.params.id || 0);
  let row = null;
  if (agentId) {
    row = await Agent.findByPk(agentId);
    if (!row) {
      const err = new Error("Agent not found.");
      err.status = 404;
      throw err;
    }
  }

  const draft = body.draft && typeof body.draft === "object" ? body.draft : body;
  const merged = {
    ...(row ? row.get({ plain: true }) : {}),
    ...draft
  };

  // Prefer explicit draft secrets; otherwise keep saved secrets
  if (row) {
    if (!String(draft.openaiApiKey || "").trim() || String(draft.openaiApiKey).includes("…")) {
      merged.openaiApiKey = row.openaiApiKey;
    }
  }

  return { row, config: normalizeAgentConfig(merged) };
}

async function previewAgentVoice(req, res, next) {
  try {
    const body = req.body || {};
    const voice = resolveOpenAiVoice(body.voice || req.query?.voice || "");
    if (!voice) return res.status(400).json({ error: "voice is required." });

    let apiKey = String(body.apiKey || "").trim();
    let ttsModel = String(body.ttsModel || "").trim();
    const agentId = Number(body.agentId || req.params.id || 0);
    if (agentId) {
      const row = await Agent.findByPk(agentId);
      if (!row) return res.status(404).json({ error: "Agent not found." });
      if (!apiKey || apiKey.includes("…") || apiKey.includes("•")) {
        apiKey = row.openaiApiKey || "";
      }
      if (!ttsModel) ttsModel = row.openaiTtsModel || "";
    }

    const { audioBase64, audioMimeType } = await previewAgentVoiceAudio({
      voice,
      apiKey: apiKey || null,
      ttsModel: ttsModel || null,
      text: body.text || null
    });
    const buf = Buffer.from(audioBase64, "base64");
    res.setHeader("Content-Type", audioMimeType || "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(buf);
  } catch (err) {
    const status = err.status || 502;
    return res.status(status).json({ error: err.message || "Preview failed." });
  }
}

async function testAgent(req, res, next) {
  try {
    const body = req.body || {};
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const language = body.language || "English";
    const speak = body.speak === true;

    const { config } = await resolveAgentConfigFromRequest(req);
    const result = await runAgentTestTurn({
      agentConfig: config,
      messages,
      language,
      speak
    });

    return res.status(200).json({
      reply: result.reply,
      meta: result.meta,
      audioBase64: result.audioBase64 || null,
      audioMimeType: result.audioMimeType || null
    });
  } catch (err) {
    const status = err.status || 502;
    return res.status(status).json({ error: err.message || "Agent test failed." });
  }
}

module.exports = {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  listAgentModels,
  listAgentVoices,
  listAgentLinkOptions,
  previewAgentVoice,
  testAgent,
  toAgentDto
};
