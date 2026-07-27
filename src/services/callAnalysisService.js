/**
 * Post-call analysis pipeline for inbound phone calls.
 *
 * Triggered when a call is finalized. Loads the saved transcript, extracts
 * structured patient/intent information via OpenAI, persists to call_analyses,
 * and emails staff using BCC delivery.
 */

const { Call, IncomingMessage, CallAnalysis, Clinic } = require("../db");
const { analyzeInboundCallTranscript } = require("./openaiService");
const { sendCallAnalysisEmail } = require("./emailService");

const inFlightCallIds = new Set();

function serializeJson(value) {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return null;
  }
}

function deserializeJson(value, fallback = null) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

async function loadCallTranscript(callId) {
  const messages = await IncomingMessage.findAll({
    where: { callId },
    order: [["created_at", "ASC"]],
    attributes: ["transcription", "userType", "createdAt"]
  });

  return messages
    .filter((message) => String(message.transcription || "").trim())
    .map((message) => ({
      role: message.userType === "user" ? "Caller" : "Assistant",
      text: String(message.transcription).trim()
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

function toAnalysisRecordFields(analysis, call, clinicId) {
  return {
    callSid: call.callSid || null,
    clinicId: clinicId || null,
    patientName: analysis.patientName || null,
    patientPhoneSpoken: analysis.patientPhoneSpoken || null,
    callerPhone: call.phone || null,
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

/**
 * Analyze a completed inbound call once and notify staff by email.
 * Safe to call multiple times — only the first successful run processes.
 */
async function processCallAnalysis(call, { clinicId = null } = {}) {
  if (!call?.id) return null;

  if (inFlightCallIds.has(call.id)) return null;
  inFlightCallIds.add(call.id);

  try {
    const existing = await CallAnalysis.findOne({ where: { callId: call.id } });
    if (existing?.emailStatus === "sent" || existing?.emailStatus === "skipped") {
      return existing;
    }

    const transcript = await loadCallTranscript(call.id);
    const hasCallerTurns = transcript.some((turn) => turn.role === "Caller");

    const analysisResult = await analyzeInboundCallTranscript({
      transcript,
      callerPhone: call.phone || null
    });

    const recordFields = toAnalysisRecordFields(analysisResult, call, clinicId);
    let analysisRow = existing;

    if (!analysisRow) {
      analysisRow = await CallAnalysis.create({
        callId: call.id,
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

    if (!hasCallerTurns) {
      await analysisRow.update({
        emailStatus: "skipped",
        emailError: "No caller speech was captured for analysis."
      });
      return analysisRow;
    }

    const { clinic, clinicLabel } = await loadClinicDetails(clinicId);
    const emailPayload = {
      call: {
        id: call.id,
        callSid: call.callSid,
        phone: call.phone,
        seconds: call.seconds,
        createdAt: call.createdAt
      },
      analysis: {
        ...analysisResult,
        callerPhone: call.phone || null,
        createdAt: analysisRow.createdAt
      },
      clinic,
      clinicLabel,
      transcriptTurns: transcript
    };

    const emailResult = await sendCallAnalysisEmail(emailPayload);
    if (!emailResult.sent) {
      await analysisRow.update({
        emailStatus: "failed",
        emailError: emailResult.reason || "Failed to send call analysis email."
      });
      return analysisRow;
    }

    await analysisRow.update({
      emailStatus: "sent",
      emailMessageId: emailResult.messageId || null,
      emailError: null
    });

    // eslint-disable-next-line no-console
    console.log(
      `[CallAnalysis] sent callId=${call.id} callSid=${call.callSid || "-"} messageId=${emailResult.messageId || "-"}`
    );

    return analysisRow;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(
      `[CallAnalysis] failed callId=${call?.id || "-"} callSid=${call?.callSid || "-"}: ${err.message}`
    );

    try {
      const existing = await CallAnalysis.findOne({ where: { callId: call.id } });
      if (existing) {
        await existing.update({
          emailStatus: "failed",
          emailError: err.message
        });
      }
    } catch {
      // ignore secondary persistence errors
    }

    return null;
  } finally {
    inFlightCallIds.delete(call.id);
  }
}

function scheduleCallAnalysis(call, options = {}) {
  if (!call?.id) return;

  setImmediate(() => {
    processCallAnalysis(call, options).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        `[CallAnalysis] scheduled run failed callId=${call.id}: ${err.message}`
      );
    });
  });
}

module.exports = {
  loadCallTranscript,
  processCallAnalysis,
  scheduleCallAnalysis,
  deserializeJson
};
