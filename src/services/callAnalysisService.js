/**
 * Post-call analysis pipeline for inbound phone calls.
 *
 * Triggered when a call is finalized. Loads the saved transcript, extracts
 * structured patient/intent information via OpenAI, persists to call_analyses,
 * and emails staff using BCC delivery.
 *
 * Transcript rows often land a few seconds after the call is marked completed,
 * so scheduling is deferred and empty transcripts are retried before skip.
 */

const { Call, IncomingMessage, CallAnalysis, Clinic } = require("../db");
const { analyzeInboundCallTranscript } = require("./openaiService");
const { sendCallAnalysisEmail, sendPatientMeetingNotificationEmail } = require("./emailService");
const {
  tryCreateGoogleMeetForAppointment,
  helpRequestedIncludesAppointment
} = require("./googleMeetService");
const { createAppointmentFromIntake } = require("./appointmentService");
const {
  mergePatientInfo,
  isAppointmentComplete,
  normalizePatientInfo
} = require("./appointmentIntakeService");

const inFlightCallIds = new Set();
const pendingTimers = new Map();
const attemptCounts = new Map();

const ANALYSIS_DELAY_MS = Number(process.env.CALL_ANALYSIS_DELAY_MS) || 8000;
const ANALYSIS_RETRY_MS = Number(process.env.CALL_ANALYSIS_RETRY_MS) || 15000;
const ANALYSIS_MAX_ATTEMPTS = Number(process.env.CALL_ANALYSIS_MAX_ATTEMPTS) || 4;

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
    order: [["createdAt", "ASC"]],
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
 * Safe to call multiple times — successful `sent` runs are not repeated.
 * Empty transcripts use `pending_retry` and reschedule instead of permanent skip.
 */
async function processCallAnalysis(call, { clinicId = null } = {}) {
  if (!call?.id) return null;

  if (inFlightCallIds.has(call.id)) return null;
  inFlightCallIds.add(call.id);

  try {
    const existing = await CallAnalysis.findOne({ where: { callId: call.id } });
    if (existing?.emailStatus === "sent") {
      return existing;
    }

    const transcript = await loadCallTranscript(call.id);
    const hasCallerTurns = transcript.some((turn) => turn.role === "Caller");

    if (!hasCallerTurns) {
      const attempts = (attemptCounts.get(call.id) || 0) + 1;
      attemptCounts.set(call.id, attempts);

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
          summary: "Waiting for call transcript before analysis.",
          keyQuotes: [],
          notes: ""
        },
        call,
        clinicId
      );

      let analysisRow = existing;
      if (!analysisRow) {
        analysisRow = await CallAnalysis.create({
          callId: call.id,
          emailStatus: "pending_retry",
          emailError: "No caller speech captured yet; retrying.",
          ...emptyFields
        });
      } else {
        await analysisRow.update({
          ...emptyFields,
          emailStatus: "pending_retry",
          emailError: `No caller speech captured yet (attempt ${attempts}/${ANALYSIS_MAX_ATTEMPTS}).`
        });
      }

      if (attempts < ANALYSIS_MAX_ATTEMPTS) {
        // eslint-disable-next-line no-console
        console.log(
          `[CallAnalysis] empty transcript callId=${call.id}; retry ${attempts}/${ANALYSIS_MAX_ATTEMPTS} in ${ANALYSIS_RETRY_MS}ms`
        );
        scheduleCallAnalysis(call, { clinicId, delayMs: ANALYSIS_RETRY_MS });
      } else {
        attemptCounts.delete(call.id);
        await analysisRow.update({
          emailStatus: "skipped",
          emailError: "No caller speech was captured for analysis after retries."
        });
        // eslint-disable-next-line no-console
        console.log(`[CallAnalysis] skipped callId=${call.id} after empty-transcript retries`);
      }
      return analysisRow;
    }

    attemptCounts.delete(call.id);

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

    const { clinic, clinicLabel } = await loadClinicDetails(clinicId);
    let googleMeet = null;
    let appointmentIntake = null;
    if (helpRequestedIncludesAppointment(analysisResult.helpRequested)) {
      const intake = mergePatientInfo(
        {
          name: analysisResult.patientName,
          phone: analysisResult.patientPhoneSpoken || call.phone
        },
        analysisResult.appointmentIntake || {}
      );
      appointmentIntake = normalizePatientInfo(intake);
      if (isAppointmentComplete(intake)) {
        googleMeet = await tryCreateGoogleMeetForAppointment({
          clinicId,
          clinicName: clinicLabel,
          patientInfo: appointmentIntake,
          summary: `Phone appointment · ${clinicLabel}`,
          description: [
            `Inbound phone appointment request.`,
            analysisResult.reasonForCall ? `Reason: ${analysisResult.reasonForCall}` : "",
            analysisResult.summary ? `Summary: ${analysisResult.summary}` : ""
          ]
            .filter(Boolean)
            .join("\n")
        });
        const persistResult = await createAppointmentFromIntake({
          clinicId,
          callId: call.id,
          source: "phone",
          patientInfo: appointmentIntake,
          meetResult: googleMeet
        });
        if (persistResult?.error) {
          // eslint-disable-next-line no-console
          console.warn(
            `[CallAnalysis] appointment not saved callId=${call.id}: ${persistResult.error.code} ${persistResult.error.message}`
          );
        }
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `[CallAnalysis] appointment intake incomplete callId=${call.id}; Google Meet skipped`
        );
      }
    }

    const emailPayload = {
      call: {
        id: call.id,
        callSid: call.callSid,
        seconds: call.seconds,
        createdAt: call.createdAt
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
      googleMeet
    };

    const emailResult = await sendCallAnalysisEmail(emailPayload);
    if (!emailResult.sent) {
      await analysisRow.update({
        emailStatus: "failed",
        emailError: emailResult.reason || "Failed to send call analysis email."
      });
    }

    if (appointmentIntake) {
      const patientEmailResult = await sendPatientMeetingNotificationEmail({
        clinicName: clinicLabel,
        clinic,
        patientInfo: appointmentIntake,
        googleMeet: googleMeet || {},
        source: "phone"
      });
      if (!patientEmailResult.sent) {
        // eslint-disable-next-line no-console
        console.error(
          `[CallAnalysis] patient meeting email failed callId=${call.id}: ${patientEmailResult.reason || "unknown"}`
        );
      } else {
        // eslint-disable-next-line no-console
        console.log(
          `[CallAnalysis] patient meeting email sent callId=${call.id} to ${patientEmailResult.to}`
        );
      }
    }

    if (emailResult.sent) {
      await analysisRow.update({
        emailStatus: "sent",
        emailMessageId: emailResult.messageId || null,
        emailError: null
      });
    }

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

  const delayMs = Number.isFinite(Number(options.delayMs))
    ? Math.max(0, Number(options.delayMs))
    : ANALYSIS_DELAY_MS;

  const prior = pendingTimers.get(call.id);
  if (prior) clearTimeout(prior);

  const timer = setTimeout(() => {
    pendingTimers.delete(call.id);
    processCallAnalysis(call, options).catch((err) => {
      // eslint-disable-next-line no-console
      console.error(
        `[CallAnalysis] scheduled run failed callId=${call.id}: ${err.message}`
      );
    });
  }, delayMs);

  if (typeof timer.unref === "function") timer.unref();
  pendingTimers.set(call.id, timer);
}

/**
 * Re-run analysis for recent completed calls that never got a successful result.
 * Used by the daily alert/history job.
 */
async function backfillPendingCallAnalyses({ lookbackDays = 2, limit = 40 } = {}) {
  const since = new Date(Date.now() - lookbackDays * 86400000);
  const { Op } = require("sequelize");

  const calls = await Call.findAll({
    where: {
      createdAt: { [Op.gte]: since },
      status: "completed"
    },
    order: [["id", "DESC"]],
    limit
  });

  let scheduled = 0;
  for (const call of calls) {
    const existing = await CallAnalysis.findOne({ where: { callId: call.id } });
    if (existing?.emailStatus === "sent") continue;
    if (
      existing &&
      !["skipped", "pending_retry", "failed", "pending"].includes(String(existing.emailStatus || ""))
    ) {
      continue;
    }
    attemptCounts.delete(call.id);
    scheduleCallAnalysis(call, {
      clinicId: call.clinicId,
      delayMs: 500 + scheduled * 750
    });
    scheduled += 1;
  }
  return scheduled;
}

module.exports = {
  loadCallTranscript,
  processCallAnalysis,
  scheduleCallAnalysis,
  backfillPendingCallAnalyses,
  deserializeJson
};
