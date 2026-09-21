/**
 * Analyze conversation, call, and campaign histories → system alerts.
 */

const OpenAI = require("openai");
const { Op } = require("sequelize");
const SystemAlert = require("../models/systemAlert");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const Call = require("../models/call");
const IncomingMessage = require("../models/incomingMessage");
const CallAnalysis = require("../models/callAnalysis");
const Campaign = require("../models/campaign");
const CampaignCallHistory = require("../models/campaignCallHistory");
const Clinic = require("../models/clinic");
const Doctor = require("../models/doctor");
const { sendMailSafe } = require("./emailService");
const { sendAlertSms, sendVoiceAlertSay } = require("./twilioService");

const PRIORITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

const CRITICAL_WORDS = [
  "chest pain",
  "can't breathe",
  "cannot breathe",
  "suicidal",
  "suicide",
  "stroke",
  "unconscious",
  "severe bleeding",
  "911",
  "emergency"
];

const HIGH_WORDS = [
  "urgent",
  "asap",
  "same day",
  "worse",
  "vomiting blood",
  "allergic",
  "side effect",
  "refill urgent",
  "out of medication",
  "complaint",
  "angry",
  "lawsuit",
  "billing dispute"
];

function envKey() {
  return String(process.env.OPENAI_API_KEY || "").trim();
}

function parseJson(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function serializeMeta(obj) {
  try {
    return JSON.stringify(obj || {});
  } catch {
    return "{}";
  }
}

function scoreText(text) {
  const t = String(text || "").toLowerCase();
  if (!t.trim()) return { priority: null, hits: [] };
  const hits = [];
  for (const w of CRITICAL_WORDS) {
    if (t.includes(w)) hits.push(w);
  }
  if (hits.length) return { priority: "critical", hits };
  for (const w of HIGH_WORDS) {
    if (t.includes(w)) hits.push(w);
  }
  if (hits.length) return { priority: "high", hits };
  return { priority: null, hits: [] };
}

function mapUrgency(urgency) {
  const u = String(urgency || "").toLowerCase();
  if (["emergency", "critical", "stat"].some((x) => u.includes(x))) return "critical";
  if (["high", "urgent", "same-day", "same day"].some((x) => u.includes(x))) return "high";
  if (["medium", "moderate"].some((x) => u.includes(x))) return "medium";
  if (["low", "routine"].some((x) => u.includes(x))) return "low";
  return null;
}

async function existingAlertKey(sourceType, sourceId) {
  const row = await SystemAlert.findOne({
    where: { sourceType, sourceId: String(sourceId), status: { [Op.ne]: "resolved" } },
    order: [["id", "DESC"]]
  });
  return row;
}

async function createAlertIfNew(draft) {
  const existing = await existingAlertKey(draft.sourceType, draft.sourceId);
  if (existing) {
    // Escalate priority if new signal is stronger
    if (PRIORITY_RANK[draft.priority] > PRIORITY_RANK[existing.priority]) {
      await existing.update({
        priority: draft.priority,
        title: draft.title,
        analysisResult: draft.analysisResult,
        reason: draft.reason,
        recommendation: draft.recommendation,
        metadata: draft.metadata
      });
      return { alert: existing, created: false, updated: true };
    }
    return { alert: existing, created: false, updated: false };
  }
  const alert = await SystemAlert.create(draft);
  return { alert, created: true, updated: false };
}

async function analyzeCalls({ lookbackDays = 14, limit = 40 } = {}) {
  const since = new Date(Date.now() - lookbackDays * 86400000);
  const analyses = await CallAnalysis.findAll({
    where: { createdAt: { [Op.gte]: since } },
    order: [["id", "DESC"]],
    limit
  });

  let created = 0;
  for (const a of analyses) {
    const urgencyPri = mapUrgency(a.urgency);
    const textBlob = [a.summary, a.reasonForCall, a.symptomsConditions, a.helpRequested, a.outcomeNextStep]
      .filter(Boolean)
      .join("\n");
    const scored = scoreText(textBlob);
    const sentiment = String(a.sentiment || "").toLowerCase();
    let priority = urgencyPri || scored.priority;
    if (!priority && (sentiment.includes("neg") || sentiment.includes("angry"))) priority = "medium";
    if (!priority) continue;

    const clinicId = a.clinicId != null ? String(a.clinicId) : null;
    const title =
      priority === "critical"
        ? "Critical inbound call signal"
        : priority === "high"
          ? "High-urgency inbound call"
          : "Call needs clinical review";

    const result = await createAlertIfNew({
      sourceType: "call",
      sourceId: String(a.callId || a.id),
      clinicId,
      priority,
      title,
      analysisResult:
        a.summary ||
        `Urgency ${a.urgency || "n/a"}; sentiment ${a.sentiment || "n/a"}. ${a.reasonForCall || ""}`.trim(),
      reason:
        scored.hits.length
          ? `Detected clinical keywords: ${scored.hits.join(", ")}. Call urgency=${a.urgency || "n/a"}.`
          : `Call analysis marked urgency=${a.urgency || "n/a"} and sentiment=${a.sentiment || "n/a"}.`,
      recommendation:
        priority === "critical"
          ? "Contact the patient immediately or escalate to on-call clinical staff. Confirm emergency redirect was given if needed."
          : priority === "high"
            ? "Have a nurse or provider review this call today and follow up with the patient."
            : "Review the transcript and close the loop with a callback or chart note.",
      status: "open",
      metadata: serializeMeta({
        callSid: a.callSid,
        patientName: a.patientName,
        urgency: a.urgency,
        sentiment: a.sentiment
      })
    });
    if (result.created) created += 1;
  }

  // Calls without analysis but with concerning transcript snippets
  const calls = await Call.findAll({
    where: { createdAt: { [Op.gte]: since } },
    order: [["id", "DESC"]],
    limit: Math.min(limit, 25)
  });
  for (const call of calls) {
    const msgs = await IncomingMessage.findAll({
      where: { callId: call.id },
      order: [["id", "ASC"]],
      limit: 40
    });
    const blob = msgs.map((m) => m.transcription || "").join("\n");
    const scored = scoreText(blob);
    if (!scored.priority) continue;
    const result = await createAlertIfNew({
      sourceType: "call",
      sourceId: String(call.id),
      clinicId: call.clinicId != null ? String(call.clinicId) : null,
      priority: scored.priority,
      title:
        scored.priority === "critical"
          ? "Critical language in inbound call"
          : "Concerning language in inbound call",
      analysisResult: blob.slice(0, 800) || "Transcript flagged by keyword scan.",
      reason: `Keyword hits: ${scored.hits.join(", ")}.`,
      recommendation:
        scored.priority === "critical"
          ? "Escalate to clinical staff immediately and verify patient safety."
          : "Review the call recording/transcript and follow up with the patient.",
      status: "open",
      metadata: serializeMeta({ callSid: call.callSid, hits: scored.hits })
    });
    if (result.created) created += 1;
  }

  return created;
}

function parseConversationUserInfo(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function analyzeConversations({ lookbackDays = 14, limit = 40 } = {}) {
  const since = new Date(Date.now() - lookbackDays * 86400000);
  const conversations = await Conversation.findAll({
    where: {
      [Op.or]: [{ updatedAt: { [Op.gte]: since } }, { createdAt: { [Op.gte]: since } }]
    },
    order: [["id", "DESC"]],
    limit
  });

  let created = 0;
  for (const conv of conversations) {
    const msgs = await Message.findAll({
      where: { conversationId: conv.id },
      order: [["id", "DESC"]],
      limit: 30
    });
    const blob = msgs
      .map((m) => m.message || "")
      .reverse()
      .join("\n");
    const scored = scoreText(blob);
    if (!scored.priority) continue;

    const userInfo = parseConversationUserInfo(conv.userInfo);
    const result = await createAlertIfNew({
      sourceType: "conversation",
      sourceId: String(conv.id),
      clinicId: conv.clinicId != null ? String(conv.clinicId) : null,
      priority: scored.priority,
      title:
        scored.priority === "critical"
          ? "Critical webchat patient message"
          : scored.priority === "high"
            ? "High-priority webchat thread"
            : "Webchat thread needs review",
      analysisResult: blob.slice(0, 800) || "Chat thread flagged by keyword scan.",
      reason: `Patient/chat keywords detected: ${scored.hits.join(", ")}.`,
      recommendation:
        scored.priority === "critical"
          ? "Warm-transfer or call the patient now; confirm emergency guidance was given."
          : "Have staff open Conversation History, review the thread, and respond same day.",
      status: "open",
      metadata: serializeMeta({
        userName: userInfo.name || null,
        userEmail: userInfo.email || null,
        hits: scored.hits
      })
    });
    if (result.created) created += 1;
  }
  return created;
}

async function analyzeCampaigns({ lookbackDays = 14, limit = 50 } = {}) {
  const since = new Date(Date.now() - lookbackDays * 86400000);
  const histories = await CampaignCallHistory.findAll({
    where: { created_at: { [Op.gte]: since } },
    order: [["id", "DESC"]],
    limit
  });

  let created = 0;
  for (const h of histories) {
    const resultType = String(h.resultType || "").toLowerCase();
    const notes = [h.summary, h.analysisNotes, h.transcriptSnapshot, h.errorMessage]
      .filter(Boolean)
      .join("\n");
    const scored = scoreText(notes);
    const failed = ["reject", "error", "failed"].some((x) => resultType.includes(x)) || Boolean(h.errorMessage);
    const needsReview = ["interesting", "not_interesting", "reject"].includes(resultType);

    let priority = scored.priority;
    if (!priority && failed) priority = "medium";
    if (!priority && needsReview && notes.trim()) priority = "low";
    if (!priority) continue;

    const campaignId = h.campaignId != null ? String(h.campaignId) : "unknown";
    const sourceId = `${campaignId}:${h.id}`;

    let campaignTitle = "Campaign";
    let clinicId = null;
    try {
      const camp = await Campaign.findByPk(h.campaignId);
      if (camp?.name) campaignTitle = camp.name;
      if (camp?.clinicId != null) clinicId = String(camp.clinicId);
    } catch {
      /* ignore */
    }

    const result = await createAlertIfNew({
      sourceType: "campaign",
      sourceId,
      clinicId,
      priority,
      title:
        scored.priority === "critical"
          ? `Critical signal in campaign “${campaignTitle}”`
          : failed
            ? `Campaign outreach issue — ${campaignTitle}`
            : `Campaign review — ${campaignTitle}`,
      analysisResult: notes.slice(0, 800) || `Result=${resultType || "n/a"}`,
      reason: scored.hits.length
        ? `Keyword hits: ${scored.hits.join(", ")}.`
        : `Campaign call result=${resultType || "n/a"}.`,
      recommendation: scored.priority
        ? "Pause similar outreach if needed and have clinical staff review this contact."
        : "Retry failed contacts or update the campaign script / contact list.",
      status: "open",
      metadata: serializeMeta({
        campaignId,
        historyId: h.id,
        resultType,
        hits: scored.hits
      })
    });
    if (result.created) created += 1;
  }
  return created;
}

async function enrichWithAi(alert) {
  const key = envKey();
  if (!key) return alert;
  try {
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a medical clinic operations analyst. Return JSON with keys analysisResult, reason, recommendation, priority (critical|high|medium|low). Stay patient-safety focused. Do not invent PHI."
        },
        {
          role: "user",
          content: JSON.stringify({
            sourceType: alert.sourceType,
            title: alert.title,
            priority: alert.priority,
            analysisResult: alert.analysisResult,
            reason: alert.reason,
            recommendation: alert.recommendation
          })
        }
      ]
    });
    const raw = completion.choices?.[0]?.message?.content || "";
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return alert;
    }
    if (!parsed || typeof parsed !== "object") return alert;
    const priority = ["critical", "high", "medium", "low"].includes(parsed.priority)
      ? parsed.priority
      : alert.priority;
    await alert.update({
      priority,
      analysisResult: String(parsed.analysisResult || alert.analysisResult).slice(0, 4000),
      reason: String(parsed.reason || alert.reason).slice(0, 4000),
      recommendation: String(parsed.recommendation || alert.recommendation).slice(0, 4000)
    });
    return alert;
  } catch {
    return alert;
  }
}

async function runHistoryAnalysis(options = {}) {
  const lookbackDays = Number(options.lookbackDays) || 14;
  const limit = Number(options.limit) || 40;
  const enrich = options.enrich !== false;

  let callCreated = 0;
  let convCreated = 0;
  let campCreated = 0;

  try {
    callCreated = await analyzeCalls({ lookbackDays, limit });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[AlertAnalysis] calls failed: ${err.message}`);
  }
  try {
    convCreated = await analyzeConversations({ lookbackDays, limit });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[AlertAnalysis] conversations failed: ${err.message}`);
  }
  try {
    campCreated = await analyzeCampaigns({ lookbackDays, limit });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[AlertAnalysis] campaigns failed: ${err.message}`);
  }

  if (enrich) {
    const recent = await SystemAlert.findAll({
      where: { status: "open" },
      order: [["id", "DESC"]],
      limit: 8
    });
    for (const a of recent) {
      // eslint-disable-next-line no-await-in-loop
      await enrichWithAi(a);
    }
  }

  const openCount = await SystemAlert.count({ where: { status: "open" } });
  return {
    created: callCreated + convCreated + campCreated,
    bySource: { call: callCreated, conversation: convCreated, campaign: campCreated },
    openCount
  };
}

function toAlertDto(row) {
  if (!row) return null;
  const plain = typeof row.get === "function" ? row.get({ plain: true }) : row;
  return {
    id: String(plain.id),
    sourceType: plain.sourceType,
    sourceId: plain.sourceId,
    clinicId: plain.clinicId || null,
    priority: plain.priority,
    title: plain.title,
    analysisResult: plain.analysisResult,
    reason: plain.reason,
    recommendation: plain.recommendation,
    status: plain.status,
    notifiedEmailAt: plain.notifiedEmailAt || null,
    notifiedVoiceAt: plain.notifiedVoiceAt || null,
    metadata: parseJson(plain.metadata),
    createdAt: plain.createdAt || plain.created_at || null,
    updatedAt: plain.updatedAt || plain.updated_at || null
  };
}

async function listAlerts({
  q = "",
  priority = "",
  status = "",
  sourceType = "",
  clinicId = "",
  page = 1,
  limit = 40
} = {}) {
  const where = {};
  if (priority && priority !== "all") where.priority = priority;
  if (status && status !== "all") where.status = status;
  if (sourceType && sourceType !== "all") where.sourceType = sourceType;
  if (clinicId) where.clinicId = String(clinicId);

  const query = String(q || "").trim();
  if (query) {
    where[Op.or] = [
      { title: { [Op.like]: `%${query}%` } },
      { analysisResult: { [Op.like]: `%${query}%` } },
      { reason: { [Op.like]: `%${query}%` } },
      { recommendation: { [Op.like]: `%${query}%` } }
    ];
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(limit) || 40));
  const { rows, count } = await SystemAlert.findAndCountAll({
    where,
    order: [
      ["priority", "ASC"], // MySQL ENUM order: critical, high, medium, low — not ideal
      ["id", "DESC"]
    ],
    offset: (pageNum - 1) * pageSize,
    limit: pageSize
  });

  // Sort by priority rank in JS
  const sorted = [...rows].sort((a, b) => {
    const d = (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0);
    if (d !== 0) return d;
    return Number(b.id) - Number(a.id);
  });

  const openCount = await SystemAlert.count({ where: { status: "open" } });
  const criticalCount = await SystemAlert.count({
    where: { status: "open", priority: "critical" }
  });

  return {
    alerts: sorted.map(toAlertDto),
    total: count,
    page: pageNum,
    limit: pageSize,
    openCount,
    criticalCount
  };
}

async function getAlert(id) {
  const row = await SystemAlert.findByPk(id);
  return toAlertDto(row);
}

async function deleteAlert(id) {
  const deleted = await SystemAlert.destroy({ where: { id } });
  return { deleted };
}

async function deleteAllAlerts() {
  const deleted = await SystemAlert.destroy({ where: {} });
  return { deleted: typeof deleted === "number" ? deleted : 0 };
}

async function updateAlertStatus(id, status) {
  const row = await SystemAlert.findByPk(id);
  if (!row) return { error: "Alert not found." };
  if (!["open", "acknowledged", "resolved"].includes(status)) {
    return { error: "Invalid status." };
  }
  await row.update({ status });
  return { alert: toAlertDto(row) };
}

async function resolveNotifyTargets({ clinicId, doctorId, toEmail, toPhone } = {}) {
  let email = String(toEmail || "").trim();
  let phone = String(toPhone || "").trim();
  let doctorName = "";

  if (doctorId) {
    const doc = await Doctor.findByPk(doctorId);
    if (doc) {
      doctorName = `${doc.firstName || ""} ${doc.lastName || ""}`.trim();
      if (!email && doc.email) email = doc.email;
      if (!phone && doc.phone) phone = doc.phone;
    }
  }

  if ((!email || !phone) && clinicId) {
    const clinicKey = Number.isFinite(Number(clinicId)) ? Number(clinicId) : clinicId;
    const doctors = await Doctor.findAll({
      where: { clinicId: clinicKey, status: "active" },
      limit: 5
    });
    for (const d of doctors) {
      if (!email && d.email) {
        email = d.email;
        doctorName = doctorName || `${d.firstName || ""} ${d.lastName || ""}`.trim();
      }
      if (!phone && d.phone) phone = d.phone;
      if (email && phone) break;
    }
    if (!email || !phone) {
      const clinic = await Clinic.findByPk(clinicId);
      if (clinic) {
        if (!email && clinic.email) email = clinic.email;
        if (!phone && clinic.phone) phone = clinic.phone;
      }
    }
  }

  if (!email) email = String(process.env.ALERT_EMAIL || "").trim();
  return { email, phone, doctorName };
}

function buildAlertNotifyCopy(alert) {
  const subject = `[${String(alert.priority || "alert").toUpperCase()}] ${alert.title}`;
  const text = [
    `Priority: ${alert.priority}`,
    `Source: ${alert.sourceType} #${alert.sourceId}`,
    "",
    "Analysis:",
    alert.analysisResult,
    "",
    "Reason:",
    alert.reason,
    "",
    "Recommendation:",
    alert.recommendation,
    "",
    "— MedBot clinical operations alert"
  ].join("\n");
  const spoken = [
    `Medical clinic alert. Priority ${alert.priority}.`,
    alert.title + ".",
    "Analysis: " + String(alert.analysisResult || "").slice(0, 280),
    "Recommendation: " + String(alert.recommendation || "").slice(0, 200)
  ].join(" ");
  return { subject, text, spoken };
}

async function notifyAlertEmail(id, options = {}) {
  const row = await SystemAlert.findByPk(id);
  if (!row) return { error: "Alert not found." };
  const alert = toAlertDto(row);
  const targets = await resolveNotifyTargets({
    clinicId: alert.clinicId,
    doctorId: options.doctorId,
    toEmail: options.toEmail
  });
  if (!targets.email) {
    return { error: "No doctor or clinic email available. Provide toEmail or configure a doctor." };
  }
  const { subject, text } = buildAlertNotifyCopy(alert);
  const smtpUser = process.env.SMTP_USER || "";
  const result = await sendMailSafe(
    {
      from: smtpUser,
      to: targets.email,
      subject,
      text,
      html: `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap;line-height:1.45">${text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")}</pre>`
    },
    "system alert"
  );
  if (!result.sent) return { error: result.reason || "Email failed." };
  await row.update({ notifiedEmailAt: new Date() });
  return { success: true, to: targets.email, alert: toAlertDto(row) };
}

async function notifyAlertVoice(id, options = {}) {
  const row = await SystemAlert.findByPk(id);
  if (!row) return { error: "Alert not found." };
  const alert = toAlertDto(row);
  const targets = await resolveNotifyTargets({
    clinicId: alert.clinicId,
    doctorId: options.doctorId,
    toPhone: options.toPhone,
    toEmail: options.toEmail
  });
  if (!targets.phone) {
    return { error: "No doctor or clinic phone available. Provide toPhone or configure a doctor." };
  }
  if (!alert.clinicId && !options.clinicId) {
    return { error: "clinicId is required for voice/SMS notify (Twilio clinic config)." };
  }
  const clinicId = alert.clinicId || String(options.clinicId);
  const { spoken, text } = buildAlertNotifyCopy(alert);

  let voiceResult = null;
  try {
    voiceResult = await sendVoiceAlertSay({
      clinicId,
      toPhoneNumber: targets.phone,
      message: spoken
    });
  } catch (err) {
    // Fall back to SMS
    try {
      const sms = await sendAlertSms({
        clinicId,
        toPhoneNumber: targets.phone,
        body: text.slice(0, 1400)
      });
      if (!sms.sent) return { error: sms.reason || err.message || "Voice notify failed." };
      await row.update({ notifiedVoiceAt: new Date() });
      return {
        success: true,
        channel: "sms",
        to: targets.phone,
        alert: toAlertDto(row)
      };
    } catch (smsErr) {
      return { error: smsErr.message || err.message || "Voice notify failed." };
    }
  }

  if (!voiceResult?.sent) {
    return { error: voiceResult?.reason || "Voice notify failed." };
  }
  await row.update({ notifiedVoiceAt: new Date() });
  return {
    success: true,
    channel: "voice",
    to: targets.phone,
    sid: voiceResult.sid,
    alert: toAlertDto(row)
  };
}

module.exports = {
  runHistoryAnalysis,
  listAlerts,
  getAlert,
  deleteAlert,
  deleteAllAlerts,
  updateAlertStatus,
  notifyAlertEmail,
  notifyAlertVoice,
  toAlertDto
};
