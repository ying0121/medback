/**
 * Resolve clinic/campaign → Agent and build production bot behavior
 * (conversation flow + agent knowledge). Shared by webchat, inbound voice,
 * campaign outbound, and the Agent Test Lab.
 */

const { Op } = require("sequelize");
const { Agent, Clinic, ConversationFlow, Knowledge, Campaign } = require("../db");
const {
  buildCampaignFlowInstructionsWithKnowledge,
  normalizeLanguage
} = require("./campaignFlowRuntime");
const {
  formatClinicPrompt,
  formatKnowledgePrompt,
  loadActiveKnowledge
} = require("./contextPromptService");
const { resolveOpenAiVoice } = require("./openaiRealtimeVoices");

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

function normalizeAgentRow(row) {
  if (!row) return null;
  return {
    id: String(row.id),
    title: String(row.title || "").trim() || "Agent",
    description: String(row.description || "").trim(),
    status: row.status || "active",
    openaiApiKey: String(row.openaiApiKey || "").trim(),
    openaiModel: String(row.openaiModel || "").trim(),
    openaiRealtimeModel: String(row.openaiRealtimeModel || "").trim(),
    openaiTranscriptionModel: String(row.openaiTranscriptionModel || "").trim(),
    openaiTtsModel: String(row.openaiTtsModel || "").trim(),
    openaiInboundModel: String(row.openaiInboundModel || "").trim(),
    openaiVoice: resolveOpenAiVoice(row.openaiVoice) || "marin",
    flowId: row.flowId != null && row.flowId !== "" ? String(row.flowId) : null,
    knowledgeIds: parseIdList(row.knowledgeIds)
  };
}

async function getAgentById(agentId) {
  const id = Number(agentId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const row = await Agent.findByPk(id);
  return normalizeAgentRow(row);
}

/**
 * Resolve agent assigned to a clinic.
 * @param {{ systemClinicId?: number|string|null, businessClinicId?: number|string|null }} opts
 */
async function resolveAgentForClinic(opts = {}) {
  let clinic = null;
  const systemId = Number(opts.systemClinicId);
  const businessId = Number(opts.businessClinicId);

  if (Number.isFinite(systemId) && systemId > 0) {
    clinic = await Clinic.findByPk(systemId);
  } else if (Number.isFinite(businessId) && businessId > 0) {
    clinic = await Clinic.findOne({ where: { clinicId: businessId } });
  }

  if (!clinic) {
    return { clinic: null, agent: null };
  }

  const agent = clinic.agentId ? await getAgentById(clinic.agentId) : null;
  return { clinic, agent };
}

async function resolveAgentForCampaign(campaignOrId) {
  let campaign = campaignOrId;
  if (!campaign || typeof campaign !== "object" || !campaign.clinicId) {
    const id = Number(campaignOrId?.id ?? campaignOrId);
    if (!Number.isFinite(id) || id <= 0) return { campaign: null, agent: null, clinic: null };
    campaign = await Campaign.findByPk(id);
  }
  if (!campaign) return { campaign: null, agent: null, clinic: null };

  const agent = campaign.agentId ? await getAgentById(campaign.agentId) : null;
  const clinic = await Clinic.findByPk(campaign.clinicId);
  return { campaign, agent, clinic };
}

async function loadFlowById(flowId) {
  if (!flowId) return null;
  const id = Number(flowId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return ConversationFlow.findByPk(id);
}

async function loadAgentKnowledgePrompt(knowledgeIds = []) {
  const ids = knowledgeIds.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0);
  if (!ids.length) return { knowledgePrompt: null, count: 0, rows: [] };

  const rows = await Knowledge.findAll({
    where: { id: { [Op.in]: ids } },
    order: [["id", "ASC"]]
  });
  const texts = rows.map((r) => String(r.knowledge || "").trim()).filter(Boolean);
  if (!texts.length) return { knowledgePrompt: null, count: 0, rows };

  const knowledgePrompt = [
    "AGENT KNOWLEDGE — source of truth for this bot.",
    "Follow these facts and instructions closely for every reply:",
    ...texts.map((t, i) => `${i + 1}. ${t}`)
  ].join("\n");

  return { knowledgePrompt, count: texts.length, rows };
}

/**
 * Build behavior context from an agent (flow + knowledge) plus optional clinic profile.
 */
async function buildAgentBehaviorContext({
  agent,
  clinic = null,
  patient = null,
  campaign = null,
  language = "English",
  channel = "chat",
  fallbackClinicKnowledge = true
} = {}) {
  const lang = normalizeLanguage(
    language || patient?.patientLanguage || patient?.language || "English"
  );

  const clinicPrompt = clinic ? formatClinicPrompt(clinic) : null;
  let knowledgePrompt = null;
  let knowledgeCount = 0;
  let flow = null;
  let flowInstructions = null;
  let openaiVoice = resolveOpenAiVoice(clinic?.openaiVoice);

  if (agent) {
    openaiVoice = resolveOpenAiVoice(agent.openaiVoice) || openaiVoice;

    const knowledge = await loadAgentKnowledgePrompt(agent.knowledgeIds);
    knowledgePrompt = knowledge.knowledgePrompt;
    knowledgeCount = knowledge.count;

    flow = await loadFlowById(agent.flowId);
    if (flow) {
      flowInstructions = await buildCampaignFlowInstructionsWithKnowledge({
        flow: {
          name: flow.name,
          graph: flow.graph
        },
        patient: patient || {
          patientFirstName: channel === "chat" ? "Caller" : "Patient",
          patientLastName: "",
          patientLanguage: lang
        },
        campaign: campaign || {
          name:
            channel === "inbound"
              ? `${agent.title} (inbound)`
              : channel === "chat"
                ? `${agent.title} (web chat)`
                : agent.title
        }
      });
    }
  } else if (fallbackClinicKnowledge && clinic?.clinicId) {
    const rows = await loadActiveKnowledge(clinic.clinicId);
    knowledgePrompt = formatKnowledgePrompt(rows);
    knowledgeCount = rows.length;
  }

  const parts = [];
  if (agent) {
    parts.push(
      `You are the clinic assistant for agent "${agent.title}".`,
      agent.description ? `Agent purpose: ${agent.description}` : "",
      `LANGUAGE: Speak in ${lang} unless the user clearly switches language.`
    );
  }
  if (clinicPrompt) parts.push(clinicPrompt);
  if (flowInstructions) {
    parts.push("CONVERSATION FLOW (must follow):\n" + flowInstructions);
  } else if (agent) {
    parts.push(
      "No conversation flow is linked to this agent. Greet helpfully and ask how you can assist."
    );
  }
  if (knowledgePrompt) parts.push(knowledgePrompt);

  return {
    agent,
    clinic,
    flow,
    flowId: flow ? String(flow.id) : agent?.flowId || null,
    flowName: flow?.name || null,
    clinicPrompt,
    knowledgePrompt,
    flowInstructions,
    systemPrompt: parts.filter(Boolean).join("\n\n") || null,
    openaiVoice,
    knowledgeCount,
    language: lang,
    channel
  };
}

/**
 * Webchat: business clinicId on Conversation → clinic.agentId → behavior.
 */
async function buildChatBehaviorByBusinessClinicId(businessClinicId, opts = {}) {
  const { clinic, agent } = await resolveAgentForClinic({
    businessClinicId
  });
  if (!clinic && !agent) {
    return {
      clinicPrompt: null,
      knowledgePrompt: null,
      flowInstructions: null,
      systemPrompt: null,
      openaiVoice: resolveOpenAiVoice(null),
      agent: null,
      flow: null,
      flowId: null,
      knowledgeCount: 0
    };
  }
  return buildAgentBehaviorContext({
    agent,
    clinic,
    channel: "chat",
    language: opts.language || "English",
    fallbackClinicKnowledge: true
  });
}

/**
 * Inbound phone: system clinic PK → clinic.agentId → behavior.
 */
async function buildInboundBehaviorBySystemClinicId(systemClinicId, opts = {}) {
  const { clinic, agent } = await resolveAgentForClinic({ systemClinicId });
  const clinicName =
    String(clinic?.name || "").trim() ||
    String(clinic?.acronym || "").trim() ||
    "";

  if (!clinic && !agent) {
    return {
      clinicPrompt: null,
      knowledgePrompt: null,
      flowInstructions: null,
      systemPrompt: null,
      openaiVoice: resolveOpenAiVoice(null),
      clinicName: "",
      agent: null,
      flow: null,
      flowId: null,
      knowledgeCount: 0
    };
  }

  const ctx = await buildAgentBehaviorContext({
    agent,
    clinic,
    channel: "inbound",
    language: opts.language || "English",
    fallbackClinicKnowledge: true
  });

  return { ...ctx, clinicName };
}

/**
 * Campaign outbound: campaign.agentId → behavior (flow + knowledge from agent).
 */
async function buildCampaignBehavior(campaign, contact = null) {
  const { agent, clinic } = await resolveAgentForCampaign(campaign);
  if (!agent) {
    const flow = campaign?.flowId ? await loadFlowById(campaign.flowId) : null;
    if (!flow) {
      throw new Error(
        "This campaign has no agent assigned. Assign an agent with a conversation flow."
      );
    }
    const instructions = await buildCampaignFlowInstructionsWithKnowledge({
      flow: { name: flow.name, graph: flow.graph },
      patient: contact,
      campaign
    });
    return {
      agent: null,
      clinic,
      flow,
      flowId: String(flow.id),
      flowName: flow.name,
      instructions,
      knowledgePrompt: null,
      flowInstructions: instructions,
      systemPrompt: instructions,
      openaiVoice: resolveOpenAiVoice(clinic?.openaiVoice),
      language: normalizeLanguage(contact?.patientLanguage),
      knowledgeCount: 0
    };
  }

  const ctx = await buildAgentBehaviorContext({
    agent,
    clinic,
    patient: contact,
    campaign,
    channel: "campaign",
    language: contact?.patientLanguage || "English",
    fallbackClinicKnowledge: false
  });

  if (!ctx.flowInstructions) {
    throw new Error(
      `Agent "${agent.title}" has no conversation flow. Link a flow on the agent before running campaigns.`
    );
  }

  return {
    ...ctx,
    instructions: [ctx.flowInstructions, ctx.knowledgePrompt].filter(Boolean).join("\n\n")
  };
}

module.exports = {
  parseIdList,
  normalizeAgentRow,
  getAgentById,
  resolveAgentForClinic,
  resolveAgentForCampaign,
  loadFlowById,
  loadAgentKnowledgePrompt,
  buildAgentBehaviorContext,
  buildChatBehaviorByBusinessClinicId,
  buildInboundBehaviorBySystemClinicId,
  buildCampaignBehavior
};
