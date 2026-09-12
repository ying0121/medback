/**
 * Agent Test Lab — multi-channel sandbox (webchat, voice, inbound, campaign).
 * Production behavior assembly lives in agentRuntimeService.
 */

const {
  normalizeAgentRow,
  parseIdList,
  buildAgentBehaviorContext,
  buildInboundBehaviorBySystemClinicId,
  buildCampaignBehavior,
  resolveAgentForCampaign
} = require("./agentRuntimeService");
const { resolveOpenAiVoice } = require("./openaiRealtimeVoices");
const {
  generateAssistantReply,
  generateSpeechFromText,
  transcribeAudioBase64
} = require("./openaiService");
const { resolveInboundGreeting } = require("./greetingService");
const { Clinic, Campaign, CampaignContact } = require("../db");

const CHANNELS = new Set(["webchat", "inbound", "campaign"]);

function normalizeChannel(raw) {
  const c = String(raw || "webchat").trim().toLowerCase();
  // Legacy "voice" tab folded into webchat (type + speak + mic).
  if (c === "voice") return "webchat";
  return CHANNELS.has(c) ? c : "webchat";
}

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

function pickModelForChannel(config, channel) {
  if (channel === "inbound") {
    return (
      config.openaiInboundModel ||
      config.openaiRealtimeModel ||
      config.openaiModel ||
      process.env.OPENAI_INBOUND_MODEL ||
      process.env.OPENAI_MODEL ||
      "gpt-5.4-mini"
    );
  }
  if (channel === "campaign") {
    return (
      config.openaiRealtimeModel ||
      config.openaiInboundModel ||
      config.openaiModel ||
      process.env.OPENAI_MODEL ||
      "gpt-5.4-mini"
    );
  }
  return config.openaiModel || process.env.OPENAI_MODEL || "gpt-5.4-mini";
}

function shouldSpeakByDefault(channel, speakFlag) {
  if (speakFlag === true) return true;
  if (speakFlag === false) return false;
  return channel === "inbound" || channel === "campaign";
}

async function listAgentTestOptions(agentId) {
  const id = Number(agentId);
  const whereAgent =
    Number.isFinite(id) && id > 0 ? { agentId: id } : null;

  const clinics = await Clinic.findAll({
    where: whereAgent || undefined,
    attributes: ["id", "name", "acronym", "city", "agentId"],
    order: [["name", "ASC"]],
    limit: whereAgent ? 100 : 50
  });

  const campaigns = await Campaign.findAll({
    where: whereAgent || undefined,
    attributes: ["id", "name", "status", "clinicId", "agentId", "flowId"],
    order: [["id", "DESC"]],
    limit: whereAgent ? 100 : 50
  });

  return {
    clinics: clinics.map((c) => ({
      id: String(c.id),
      name: String(c.name || c.acronym || `Clinic #${c.id}`).trim(),
      acronym: c.acronym || null,
      city: c.city || null
    })),
    campaigns: campaigns.map((c) => ({
      id: String(c.id),
      name: String(c.name || `Campaign #${c.id}`).trim(),
      status: c.status || null,
      clinicId: c.clinicId != null ? String(c.clinicId) : null
    }))
  };
}

async function resolveTestPatient({ contactId, patient, language }) {
  if (contactId) {
    const contact = await CampaignContact.findByPk(Number(contactId));
    if (contact) {
      return {
        patientFirstName: contact.patientFirstName || "",
        patientLastName: contact.patientLastName || "",
        patientPhone: contact.patientPhone || "",
        patientEmail: contact.patientEmail || "",
        patientDob: contact.patientDob || "",
        patientLanguage: contact.patientLanguage || language || "English",
        patientMemberNumber: contact.patientMemberNumber || ""
      };
    }
  }
  const p = patient && typeof patient === "object" ? patient : {};
  return {
    patientFirstName: String(p.patientFirstName || p.firstName || "Test").trim() || "Test",
    patientLastName: String(p.patientLastName || p.lastName || "Patient").trim() || "Patient",
    patientPhone: String(p.patientPhone || p.phone || "").trim(),
    patientEmail: String(p.patientEmail || p.email || "").trim(),
    patientDob: String(p.patientDob || p.dob || "").trim(),
    patientLanguage: String(p.patientLanguage || p.language || language || "English").trim(),
    patientMemberNumber: String(p.patientMemberNumber || p.memberNumber || "").trim()
  };
}

async function buildChannelPrompt({
  agentConfig,
  channel,
  language,
  clinicId,
  campaignId,
  patient
}) {
  const config = normalizeAgentConfig(agentConfig);

  if (channel === "inbound") {
    let clinic = null;
    if (clinicId) {
      clinic = await Clinic.findByPk(Number(clinicId));
    } else if (config.id) {
      clinic = await Clinic.findOne({
        where: { agentId: Number(config.id) },
        order: [["id", "ASC"]]
      });
    }

    if (clinic) {
      const ctx = await buildInboundBehaviorBySystemClinicId(clinic.id, { language });
      const greeting = resolveInboundGreeting(clinic);
      return {
        systemPrompt: [
          `You are on a LIVE INBOUND PHONE CALL for clinic "${ctx.clinicName || clinic.name || "Clinic"}".`,
          "Speak naturally for voice: short sentences, no markdown, no bullet lists unless listing brief options.",
          "The caller just dialed the clinic number. Follow the conversation flow and knowledge.",
          ctx.systemPrompt || ""
        ]
          .filter(Boolean)
          .join("\n\n"),
        greeting,
        meta: {
          channel,
          flowId: ctx.flowId,
          flowName: ctx.flowName,
          knowledgeCount: ctx.knowledgeCount,
          model: pickModelForChannel(config, channel),
          voice: config.openaiVoice || ctx.openaiVoice,
          realtimeModel: config.openaiRealtimeModel || null,
          clinicId: String(clinic.id),
          clinicName: ctx.clinicName || clinic.name || null,
          campaignId: null,
          campaignName: null,
          patientName: null
        }
      };
    }

    const ctx = await buildAgentBehaviorContext({
      agent: config,
      clinic: null,
      channel: "inbound",
      language,
      fallbackClinicKnowledge: false,
      campaign: { name: `${config.title} (inbound test)` },
      patient: {
        patientFirstName: "Caller",
        patientLastName: "",
        patientLanguage: language
      }
    });
    const greeting = resolveInboundGreeting(null);
    return {
      systemPrompt: [
        `You are on a LIVE INBOUND PHONE CALL simulated for agent "${config.title}".`,
        "Speak naturally for voice: short sentences, no markdown.",
        ctx.systemPrompt || ""
      ]
        .filter(Boolean)
        .join("\n\n"),
      greeting,
      meta: {
        channel,
        flowId: ctx.flowId,
        flowName: ctx.flowName,
        knowledgeCount: ctx.knowledgeCount,
        model: pickModelForChannel(config, channel),
        voice: config.openaiVoice,
        realtimeModel: config.openaiRealtimeModel || null,
        clinicId: null,
        clinicName: null,
        campaignId: null,
        campaignName: null,
        patientName: null
      }
    };
  }

  if (channel === "campaign") {
    if (!campaignId) {
      throw Object.assign(new Error("Select a campaign to test outbound dialing."), {
        status: 400
      });
    }
    const { campaign, agent } = await resolveAgentForCampaign(campaignId);
    if (!campaign) {
      throw Object.assign(new Error("Campaign not found."), { status: 404 });
    }
    if (config.id && campaign.agentId && String(campaign.agentId) !== String(config.id)) {
      throw Object.assign(
        new Error("This campaign is assigned to a different agent."),
        { status: 400 }
      );
    }

    const behavior = await buildCampaignBehavior(campaign, patient);
    const patientName = [patient?.patientFirstName, patient?.patientLastName]
      .filter(Boolean)
      .join(" ")
      .trim();

    return {
      systemPrompt: [
        `You are placing an OUTBOUND CAMPAIGN PHONE CALL for "${campaign.name}".`,
        patientName ? `You are speaking with patient ${patientName}.` : "",
        "Speak naturally for voice: short sentences, no markdown, no bullet lists.",
        "Follow the campaign conversation flow strictly. Open the call when asked to begin.",
        behavior.systemPrompt || behavior.instructions || ""
      ]
        .filter(Boolean)
        .join("\n\n"),
      greeting: null,
      meta: {
        channel,
        flowId: behavior.flowId,
        flowName: behavior.flowName,
        knowledgeCount: behavior.knowledgeCount || 0,
        model: pickModelForChannel(agent || config, channel),
        voice: (agent || config).openaiVoice || behavior.openaiVoice,
        realtimeModel: (agent || config).openaiRealtimeModel || null,
        clinicId: campaign.clinicId != null ? String(campaign.clinicId) : null,
        clinicName: behavior.clinic?.name || null,
        campaignId: String(campaign.id),
        campaignName: campaign.name || null,
        patientName: patientName || null
      }
    };
  }

  // webchat — typed and/or spoken (mic) in one surface
  const ctx = await buildAgentBehaviorContext({
    agent: config,
    clinic: null,
    channel: "chat",
    language,
    fallbackClinicKnowledge: false,
    campaign: { name: `${config.title} (test lab · webchat)` },
    patient: {
      patientFirstName: "Test",
      patientLastName: "Patient",
      patientLanguage: language
    }
  });

  return {
    systemPrompt: [
      `You are running inside the MedBot Agent Test Lab for agent "${config.title}".`,
      "Channel: webchat. Behave exactly as the production bot would with this agent profile.",
      "The tester may type or speak. Keep replies clear; when speaking aloud later, avoid heavy markdown.",
      ctx.systemPrompt || ""
    ]
      .filter(Boolean)
      .join("\n\n"),
    greeting: null,
    meta: {
      channel,
      flowId: ctx.flowId,
      flowName: ctx.flowName,
      knowledgeCount: ctx.knowledgeCount,
      model: pickModelForChannel(config, channel),
      voice: config.openaiVoice,
      realtimeModel: config.openaiRealtimeModel || null,
      clinicId: null,
      clinicName: null,
      campaignId: null,
      campaignName: null,
      patientName: null
    }
  };
}

async function maybeSpeak(reply, config, speak) {
  if (!speak || !reply) return { audioBase64: null, audioMimeType: null };
  const speech = await generateSpeechFromText({
    text: reply,
    voice: config.openaiVoice,
    apiKey: config.openaiApiKey || process.env.OPENAI_API_KEY || null,
    model: config.openaiTtsModel || process.env.OPENAI_TTS_MODEL || null
  });
  return {
    audioBase64: speech.audioBase64,
    audioMimeType: speech.audioMimeType
  };
}

/**
 * Start a channel session (inbound greeting / campaign dial opening).
 */
async function startAgentTestSession({
  agentConfig,
  channel: channelRaw = "webchat",
  language = "English",
  speak = null,
  clinicId = null,
  campaignId = null,
  contactId = null,
  patient: patientInput = null
} = {}) {
  const channel = normalizeChannel(channelRaw);
  const config = normalizeAgentConfig(agentConfig);
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw Object.assign(new Error("No OpenAI API key on this agent or in server .env."), {
      status: 400
    });
  }

  const patient = await resolveTestPatient({
    contactId,
    patient: patientInput,
    language
  });
  const doSpeak = shouldSpeakByDefault(channel, speak);
  const built = await buildChannelPrompt({
    agentConfig: config,
    channel,
    language: patient.patientLanguage || language,
    clinicId,
    campaignId,
    patient
  });

  if (channel === "inbound") {
    const reply = String(built.greeting || "").trim() || "Hello. How can I help you today?";
    const audio = await maybeSpeak(reply, config, doSpeak);
    return {
      action: "start",
      reply,
      userTranscript: null,
      messages: [{ role: "assistant", content: reply }],
      meta: { ...built.meta, model: built.meta.model },
      ...audio
    };
  }

  if (channel === "campaign") {
    const model = built.meta.model;
    const reply = await generateAssistantReply(
      [
        {
          role: "user",
          content:
            "Begin the outbound campaign call now. Deliver your opening line to the patient. Do not wait for them to speak first."
        }
      ],
      {
        apiKey,
        model,
        systemPrompt: built.systemPrompt,
        temperature: 0.45,
        maxCompletionTokens: 320
      }
    );
    const text = String(reply || "").trim();
    const audio = await maybeSpeak(text, { ...config, openaiVoice: built.meta.voice }, doSpeak);
    return {
      action: "start",
      reply: text,
      userTranscript: null,
      messages: [{ role: "assistant", content: text }],
      meta: built.meta,
      ...audio
    };
  }

  // webchat / voice — ready state, no bot opener required
  return {
    action: "start",
    reply: null,
    userTranscript: null,
    messages: [],
    meta: built.meta,
    audioBase64: null,
    audioMimeType: null
  };
}

async function runAgentTestTurn({
  agentConfig,
  messages = [],
  language = "English",
  speak = null,
  channel: channelRaw = "webchat",
  clinicId = null,
  campaignId = null,
  contactId = null,
  patient: patientInput = null,
  audioBase64 = null,
  audioMimeType = null
} = {}) {
  const channel = normalizeChannel(channelRaw);
  const config = normalizeAgentConfig(agentConfig);
  const apiKey = config.openaiApiKey || process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    throw Object.assign(new Error("No OpenAI API key on this agent or in server .env."), {
      status: 400
    });
  }

  const patient = await resolveTestPatient({
    contactId,
    patient: patientInput,
    language
  });
  const doSpeak = shouldSpeakByDefault(channel, speak);

  let turns = (Array.isArray(messages) ? messages : [])
    .map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").trim()
    }))
    .filter((m) => m.content);

  let userTranscript = null;
  if (audioBase64) {
    userTranscript = await transcribeAudioBase64({
      audioBase64,
      audioMimeType: audioMimeType || "audio/webm",
      apiKey,
      model: config.openaiTranscriptionModel || null
    });
    turns = [...turns, { role: "user", content: userTranscript }];
  }

  if (!turns.length) {
    throw Object.assign(new Error("Send at least one user message or voice clip."), {
      status: 400
    });
  }

  const built = await buildChannelPrompt({
    agentConfig: config,
    channel,
    language: patient.patientLanguage || language,
    clinicId,
    campaignId,
    patient
  });

  const model = built.meta.model;
  const reply = await generateAssistantReply(turns, {
    apiKey,
    model,
    systemPrompt: built.systemPrompt,
    temperature: 0.45,
    maxCompletionTokens: channel === "webchat" ? 700 : 360
  });

  const text = String(reply || "").trim();
  const audio = await maybeSpeak(text, { ...config, openaiVoice: built.meta.voice }, doSpeak);

  return {
    action: "message",
    reply: text,
    userTranscript,
    messages: [...turns, { role: "assistant", content: text }],
    meta: built.meta,
    ...audio
  };
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
  normalizeChannel,
  listAgentTestOptions,
  startAgentTestSession,
  runAgentTestTurn,
  previewAgentVoiceAudio,
  // back-compat alias used nowhere critical
  buildAgentTestSystemPrompt: async (agentConfig, opts) => {
    const built = await buildChannelPrompt({
      agentConfig,
      channel: "webchat",
      language: opts?.language || "English"
    });
    return { systemPrompt: built.systemPrompt, meta: built.meta };
  }
};
