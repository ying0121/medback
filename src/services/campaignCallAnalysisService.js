/**
 * Campaign outbound call attempt lifecycle + AI result analysis.
 */

const {
  Campaign,
  CampaignContact,
  CampaignCallHistory,
  ConversationFlow,
  IncomingMessage
} = require("../db");
const { analyzeCampaignCallTranscript } = require("./openaiService");
const {
  RESULT_TYPES,
  normalizeLanguage,
  buildCampaignFlowInstructionsWithKnowledge,
  isCampaignResultType
} = require("./campaignFlowRuntime");

function serializeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

function toHistoryDto(row) {
  if (!row) return null;
  let rawAnalysis = null;
  if (row.rawAnalysis) {
    try {
      rawAnalysis =
        typeof row.rawAnalysis === "string" ? JSON.parse(row.rawAnalysis) : row.rawAnalysis;
    } catch {
      rawAnalysis = null;
    }
  }
  let transcript = [];
  if (row.transcriptSnapshot) {
    try {
      const parsed =
        typeof row.transcriptSnapshot === "string"
          ? JSON.parse(row.transcriptSnapshot)
          : row.transcriptSnapshot;
      transcript = Array.isArray(parsed) ? parsed : [];
    } catch {
      transcript = [];
    }
  }

  return {
    id: String(row.id),
    campaignId: String(row.campaignId),
    campaignContactId: String(row.campaignContactId),
    callId: row.callId != null ? String(row.callId) : null,
    callSid: row.callSid || null,
    flowId: row.flowId != null ? String(row.flowId) : null,
    attemptNumber: Number(row.attemptNumber) || 1,
    language: row.language || null,
    resultType: row.resultType || "pending",
    summary: row.summary || "",
    analysisNotes: row.analysisNotes || "",
    rawAnalysis,
    transcript,
    durationSeconds: row.durationSeconds != null ? Number(row.durationSeconds) : null,
    startedAt: row.startedAt ? new Date(row.startedAt).toISOString() : null,
    endedAt: row.endedAt ? new Date(row.endedAt).toISOString() : null,
    errorMessage: row.errorMessage || null,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : null,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : null
  };
}

async function loadTranscriptForCall(callId) {
  if (!callId) return [];
  const messages = await IncomingMessage.findAll({
    where: { callId },
    order: [["created_at", "ASC"]],
    attributes: ["transcription", "userType", "createdAt"]
  });
  return messages
    .filter((m) => String(m.transcription || "").trim())
    .map((m) => ({
      role: m.userType === "user" ? "Patient" : "Bot",
      text: String(m.transcription).trim()
    }));
}

/**
 * Create a history row when the dialer begins calling a contact.
 * Updates contact status → calling.
 */
async function startCampaignCallAttempt({
  campaignId,
  contactId,
  callId = null,
  callSid = null,
  flowId = null
} = {}) {
  const contact = await CampaignContact.findOne({
    where: { id: contactId, campaignId }
  });
  if (!contact) throw new Error("Campaign contact not found.");

  const campaign = await Campaign.findByPk(campaignId);
  let resolvedFlowId = flowId || campaign?.flowId || null;
  if (!resolvedFlowId && campaign?.agentId) {
    const { getAgentById } = require("./agentRuntimeService");
    const agent = await getAgentById(campaign.agentId);
    resolvedFlowId = agent?.flowId || null;
  }
  const attemptNumber = (Number(contact.attemptCount) || 0) + 1;
  const language = normalizeLanguage(contact.patientLanguage);

  const history = await CampaignCallHistory.create({
    campaignId,
    campaignContactId: contact.id,
    callId,
    callSid,
    flowId: resolvedFlowId,
    attemptNumber,
    language,
    resultType: "calling",
    startedAt: new Date()
  });

  contact.status = "calling";
  contact.attemptCount = attemptNumber;
  contact.lastCallAt = new Date();
  contact.lastError = null;
  await contact.save();

  return { history, contact, campaign };
}

/**
 * After the call ends: save transcript, run AI analysis, update contact status.
 */
async function finalizeCampaignCallAttempt({
  historyId,
  callId = null,
  transcript = null,
  durationSeconds = null,
  errorMessage = null
} = {}) {
  const history = await CampaignCallHistory.findByPk(historyId);
  if (!history) throw new Error("Campaign call history not found.");

  const contact = await CampaignContact.findByPk(history.campaignContactId);
  const campaign = await Campaign.findByPk(history.campaignId);
  const flow = history.flowId
    ? await ConversationFlow.findByPk(history.flowId)
    : campaign?.flowId
      ? await ConversationFlow.findByPk(campaign.flowId)
      : null;

  if (callId) history.callId = callId;

  let turns = Array.isArray(transcript) ? transcript : null;
  if (!turns?.length && (callId || history.callId)) {
    turns = await loadTranscriptForCall(callId || history.callId);
  }
  turns = turns || [];

  history.transcriptSnapshot = serializeJson(turns);
  history.durationSeconds =
    durationSeconds != null ? Number(durationSeconds) : history.durationSeconds;
  history.endedAt = new Date();
  if (errorMessage) history.errorMessage = String(errorMessage);

  if (!turns.length && errorMessage) {
    history.resultType = "reject";
    history.summary = "Call did not complete successfully.";
    history.analysisNotes = String(errorMessage);
  } else {
    const analysis = await analyzeCampaignCallTranscript({
      transcript: turns,
      patient: {
        patientName: contact?.patientName,
        patientPhone: contact?.patientPhone
      },
      campaignName: campaign?.name || "",
      flowName: flow?.name || "",
      language: history.language || contact?.patientLanguage || ""
    });

    history.resultType = analysis.resultType;
    history.summary = analysis.summary;
    history.analysisNotes = analysis.notes;
    history.rawAnalysis = serializeJson(analysis);
  }

  await history.save();

  if (contact) {
    contact.status = history.resultType;
    contact.lastAnalysisSummary = history.summary;
    contact.lastCallAt = history.endedAt;
    if (errorMessage) contact.lastError = String(errorMessage);
    await contact.save();
  }

  return { history: toHistoryDto(history), contact };
}

/**
 * Build bot instructions for an outbound campaign call (flow + patient language).
 */
async function getCampaignCallBotContext(campaignId, contactId) {
  const contact = await CampaignContact.findOne({
    where: { id: contactId, campaignId }
  });
  if (!contact) throw new Error("Campaign contact not found.");

  const campaign = await Campaign.findByPk(campaignId);
  if (!campaign) throw new Error("Campaign not found.");

  const { buildCampaignBehavior } = require("./agentRuntimeService");
  const behavior = await buildCampaignBehavior(campaign, contact);

  return {
    contact,
    campaign,
    flow: behavior.flow,
    language: behavior.language,
    instructions: behavior.instructions,
    agent: behavior.agent,
    knowledgePrompt: behavior.knowledgePrompt,
    openaiVoice: behavior.openaiVoice
  };
}

async function listContactCallHistory(campaignId, contactId) {
  const rows = await CampaignCallHistory.findAll({
    where: { campaignId, campaignContactId: contactId },
    order: [["attempt_number", "DESC"], ["id", "DESC"]]
  });
  return rows.map(toHistoryDto);
}

async function getCallHistoryById(campaignId, historyId) {
  const row = await CampaignCallHistory.findOne({
    where: { id: historyId, campaignId }
  });
  return toHistoryDto(row);
}

async function reanalyzeCallHistory(campaignId, historyId) {
  const history = await CampaignCallHistory.findOne({
    where: { id: historyId, campaignId }
  });
  if (!history) throw new Error("Call history not found.");

  let turns = [];
  if (history.transcriptSnapshot) {
    try {
      const parsed = JSON.parse(history.transcriptSnapshot);
      turns = Array.isArray(parsed) ? parsed : [];
    } catch {
      turns = [];
    }
  }
  if (!turns.length && history.callId) {
    turns = await loadTranscriptForCall(history.callId);
  }

  return finalizeCampaignCallAttempt({
    historyId: history.id,
    callId: history.callId,
    transcript: turns,
    durationSeconds: history.durationSeconds
  });
}

module.exports = {
  RESULT_TYPES,
  isCampaignResultType,
  toHistoryDto,
  startCampaignCallAttempt,
  finalizeCampaignCallAttempt,
  getCampaignCallBotContext,
  listContactCallHistory,
  getCallHistoryById,
  reanalyzeCallHistory
};
