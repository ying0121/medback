/**
 * Post-session analysis pipeline for webchat conversations.
 *
 * Triggered when the chat WebSocket disconnects (session finished). Loads
 * messages, extracts structured patient/intent information via OpenAI,
 * persists to conversation_analyses, and emails staff (same notify list as calls).
 */

const { Conversation, Message, ConversationAnalysis, Clinic } = require("../db");
const { analyzeInboundCallTranscript } = require("./openaiService");
const { sendCallAnalysisEmail } = require("./emailService");

const inFlightIds = new Set();
const pendingTimers = new Map();
const attemptCounts = new Map();

const ANALYSIS_DELAY_MS = Number(process.env.CONVERSATION_ANALYSIS_DELAY_MS) || 5000;
const ANALYSIS_RETRY_MS = Number(process.env.CONVERSATION_ANALYSIS_RETRY_MS) || 12000;
const ANALYSIS_MAX_ATTEMPTS = Number(process.env.CONVERSATION_ANALYSIS_MAX_ATTEMPTS) || 3;

function serializeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

function parseUserInfo(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function loadConversationTranscript(conversationId) {
  const messages = await Message.findAll({
    where: { conversationId },
    order: [["createdAt", "ASC"]],
    attributes: ["message", "userType", "createdAt"]
  });

  return messages
    .filter((m) => String(m.message || "").trim())
    .map((m) => ({
      role: m.userType === "user" ? "Caller" : "Assistant",
      text: String(m.message).trim()
    }));
}

async function loadClinicDetails(systemClinicId) {
  const id = Number(systemClinicId);
  if (!Number.isFinite(id) || id <= 0) {
    return { clinic: {}, clinicLabel: "Clinic" };
  }

  const clinic = await Clinic.findByPk(id, {
    attributes: [
      "id",
      "clinicId",
      "name",
      "acronym",
      "address1",
      "address2",
      "city",
      "state",
      "zip",
      "phone",
      "email",
      "web"
    ]
  });

  if (!clinic) {
    return { clinic: {}, clinicLabel: "Clinic" };
  }

  const clinicLabel =
    String(clinic.name || "").trim() ||
    String(clinic.acronym || "").trim() ||
    "Clinic";

  return { clinic: clinic.toJSON ? clinic.toJSON() : clinic, clinicLabel };
}

function toAnalysisRecordFields(analysis, conversation, clinicId, userInfo = {}) {
  return {
    clinicId: clinicId || conversation.clinicId || null,
    patientName: analysis.patientName || userInfo.name || null,
    patientPhoneSpoken: analysis.patientPhoneSpoken || userInfo.phone || null,
    callerPhone: userInfo.phone || null,
    reasonForCall: analysis.reasonForCall || null,
    symptomsConditions: analysis.symptomsConditions || null,
    helpRequested: serializeJson(analysis.helpRequested || []),
    urgency: analysis.urgency || "unknown",
    sentiment: analysis.sentiment || "unknown",
    outcomeNextStep: analysis.outcomeNextStep || null,
    summary: analysis.summary || null,
    keyQuotes: serializeJson(analysis.keyQuotes || []),
    notes: analysis.notes || null,
    rawAnalysis: serializeJson(analysis)
  };
}

async function processConversationAnalysis(conversationId, { clinicId = null } = {}) {
  const id = Number(conversationId);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (inFlightIds.has(id)) return null;
  inFlightIds.add(id);

  try {
    const conversation = await Conversation.findByPk(id);
    if (!conversation) return null;

    const existing = await ConversationAnalysis.findOne({ where: { conversationId: id } });
    if (existing?.emailStatus === "sent") {
      return existing;
    }

    const transcript = await loadConversationTranscript(id);
    const hasUserTurns = transcript.some((turn) => turn.role === "Caller");
    const resolvedClinicId = clinicId || conversation.clinicId || null;
    const userInfo = parseUserInfo(conversation.userInfo);

    if (!hasUserTurns) {
      const attempts = (attemptCounts.get(id) || 0) + 1;
      attemptCounts.set(id, attempts);

      const emptyFields = toAnalysisRecordFields(
        {
          patientName: "",
          patientPhoneSpoken: "",
          reasonForCall: "",
          symptomsConditions: "",
          helpRequested: [],
          urgency: "unknown",
          sentiment: "unknown",
          outcomeNextStep: "",
          summary: "Waiting for webchat messages before analysis.",
          keyQuotes: [],
          notes: ""
        },
        conversation,
        resolvedClinicId,
        userInfo
      );

      let analysisRow = existing;
      if (!analysisRow) {
        analysisRow = await ConversationAnalysis.create({
          conversationId: id,
          emailStatus: "pending_retry",
          emailError: "No user messages yet; retrying.",
          ...emptyFields
        });
      } else {
        await analysisRow.update({
          ...emptyFields,
          emailStatus: "pending_retry",
          emailError: `No user messages yet (attempt ${attempts}/${ANALYSIS_MAX_ATTEMPTS}).`
        });
      }

      if (attempts < ANALYSIS_MAX_ATTEMPTS) {
        // eslint-disable-next-line no-console
        console.log(
          `[ConversationAnalysis] empty transcript conversationId=${id}; retry ${attempts}/${ANALYSIS_MAX_ATTEMPTS}`
        );
        scheduleConversationAnalysis(id, { clinicId: resolvedClinicId, delayMs: ANALYSIS_RETRY_MS });
      } else {
        attemptCounts.delete(id);
        await analysisRow.update({
          emailStatus: "skipped",
          emailError: "No user messages were captured for analysis after retries."
        });
      }
      return analysisRow;
    }

    attemptCounts.delete(id);

    const analysisResult = await analyzeInboundCallTranscript({
      transcript,
      callerPhone: userInfo.phone || null
    });

    const recordFields = toAnalysisRecordFields(
      analysisResult,
      conversation,
      resolvedClinicId,
      userInfo
    );

    let analysisRow = existing;
    if (!analysisRow) {
      analysisRow = await ConversationAnalysis.create({
        conversationId: id,
        emailStatus: "pending",
        ...recordFields
      });
    } else {
      await analysisRow.update({
        ...recordFields,
        emailStatus: "pending",
        emailError: null
      });
    }

    const { clinic, clinicLabel } = await loadClinicDetails(resolvedClinicId);

    const emailPayload = {
      call: {
        id,
        callSid: `webchat-${id}`,
        seconds: null,
        createdAt: conversation.createdAt || conversation.updatedAt
      },
      analysis: {
        urgency: analysisResult.urgency,
        sentiment: analysisResult.sentiment,
        helpRequested: analysisResult.helpRequested,
        reasonForCall: analysisResult.reasonForCall,
        symptomsConditions: analysisResult.symptomsConditions,
        outcomeNextStep: analysisResult.outcomeNextStep,
        summary: analysisResult.summary,
        keyQuotes: analysisResult.keyQuotes,
        notes: analysisResult.notes,
        createdAt: analysisRow.createdAt
      },
      clinic,
      clinicLabel,
      googleMeet: null
    };

    const emailResult = await sendCallAnalysisEmail(emailPayload);
    if (!emailResult.sent) {
      await analysisRow.update({
        emailStatus: "failed",
        emailError: emailResult.reason || "Failed to send conversation analysis email."
      });
    } else {
      await analysisRow.update({
        emailStatus: "sent",
        emailMessageId: emailResult.messageId || null,
        emailError: null
      });
    }

    // eslint-disable-next-line no-console
    console.log(
      `[ConversationAnalysis] done conversationId=${id} emailStatus=${emailResult.sent ? "sent" : "failed"}`
    );

    return analysisRow;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[ConversationAnalysis] failed conversationId=${id}: ${err.message}`);
    try {
      const existing = await ConversationAnalysis.findOne({ where: { conversationId: id } });
      if (existing) {
        await existing.update({
          emailStatus: "failed",
          emailError: err.message
        });
      }
    } catch {
      // ignore
    }
    return null;
  } finally {
    inFlightIds.delete(id);
  }
}

function scheduleConversationAnalysis(conversationId, options = {}) {
  const id = Number(conversationId);
  if (!Number.isFinite(id) || id <= 0) return;

  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Number(options.delayMs))
    : ANALYSIS_DELAY_MS;

  const prior = pendingTimers.get(id);
  if (prior) clearTimeout(prior);

  const timer = setTimeout(() => {
    pendingTimers.delete(id);
    processConversationAnalysis(id, options).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        `[ConversationAnalysis] scheduled run failed conversationId=${id}: ${err.message}`
      );
    });
  }, delayMs);

  if (typeof timer.unref === "function") timer.unref();
  pendingTimers.set(id, timer);
}

/**
 * Backfill analysis for recent webchats that have user messages but no successful analysis.
 */
async function backfillPendingConversationAnalyses({ lookbackDays = 2, limit = 40 } = {}) {
  const { Op } = require("sequelize");
  const since = new Date(Date.now() - lookbackDays * 86400000);

  const conversations = await Conversation.findAll({
    where: {
      [Op.or]: [{ updatedAt: { [Op.gte]: since } }, { createdAt: { [Op.gte]: since } }]
    },
    order: [["id", "DESC"]],
    limit
  });

  let scheduled = 0;
  for (const conv of conversations) {
    const existing = await ConversationAnalysis.findOne({
      where: { conversationId: conv.id }
    });
    if (existing?.emailStatus === "sent") continue;

    const userMsg = await Message.findOne({
      where: { conversationId: conv.id, userType: "user" },
      attributes: ["id"]
    });
    if (!userMsg) continue;

    attemptCounts.delete(conv.id);
    scheduleConversationAnalysis(conv.id, {
      clinicId: conv.clinicId,
      delayMs: 400 + scheduled * 600
    });
    scheduled += 1;
  }
  return scheduled;
}

module.exports = {
  loadConversationTranscript,
  processConversationAnalysis,
  scheduleConversationAnalysis,
  backfillPendingConversationAnalyses
};
