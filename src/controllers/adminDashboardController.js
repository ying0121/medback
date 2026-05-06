const axios = require("axios");
const { Op } = require("sequelize");
const { Conversation, Message, User, Clinic, Call, IncomingMessage } = require("../db");
const { listVoices, textToSpeechMp3 } = require("../services/elevenlabsService");

function detectAudioMimeFromBase64(rawBase64) {
  try {
    if (!rawBase64) return "audio/webm";
    const clean = String(rawBase64)
      .replace(/\s+/g, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), "=");
    const head = Buffer.from(padded.slice(0, 96), "base64");
    if (head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      return "audio/mpeg";
    }
    if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
      return "audio/mpeg";
    }
    if (
      head.length >= 4 &&
      head[0] === 0x4f &&
      head[1] === 0x67 &&
      head[2] === 0x67 &&
      head[3] === 0x53
    ) {
      return "audio/ogg";
    }
    if (
      head.length >= 12 &&
      head[0] === 0x52 &&
      head[1] === 0x49 &&
      head[2] === 0x46 &&
      head[3] === 0x46 &&
      head[8] === 0x57 &&
      head[9] === 0x41 &&
      head[10] === 0x56 &&
      head[11] === 0x45
    ) {
      return "audio/wav";
    }
    if (
      head.length >= 4 &&
      head[0] === 0x1a &&
      head[1] === 0x45 &&
      head[2] === 0xdf &&
      head[3] === 0xa3
    ) {
      return "audio/webm";
    }
    return "audio/webm";
  } catch {
    return "audio/webm";
  }
}

function normalizeAudioPayload(rawAudio) {
  if (!rawAudio) return { audioUrl: undefined, audioMimeType: undefined };
  const value = String(rawAudio).trim();
  const dataUrlMatch = value.match(/^data:([^;]+);base64,(.+)$/i);
  if (dataUrlMatch) {
    return {
      audioUrl: `data:${dataUrlMatch[1]};base64,${dataUrlMatch[2]}`,
      audioMimeType: dataUrlMatch[1]
    };
  }
  const mimeType = detectAudioMimeFromBase64(value);
  return {
    audioUrl: `data:${mimeType};base64,${value}`,
    audioMimeType: mimeType
  };
}

function makeClinicSummary(clinicId) {
  return {
    id: String(clinicId),
    clinicId: `CL-${String(clinicId).padStart(4, "0")}`,
    name: `Clinic ${clinicId}`,
    acronym: `C${clinicId}`,
    city: "",
    twilioConfigured: false,
    elevenLabsConfigured: false,
    elevenLabsVoiceConfigured: false,
    elevenLabsVoiceId: null
  };
}

function parseConversationUserInfo(rawUserInfo) {
  if (!rawUserInfo) return { name: "", email: "" };
  try {
    const parsed = JSON.parse(String(rawUserInfo));
    return {
      name: String(parsed?.name || "").trim(),
      email: String(parsed?.email || "").trim()
    };
  } catch {
    return { name: "", email: "" };
  }
}

async function listClinics(req, res, next) {
  try {
    const clinicRows = await Clinic.findAll({
      order: [["id", "ASC"]]
    });

    let clinics = clinicRows.map((row) => ({
      id: String(row.id),
      clinicId: row.clinicId ? String(row.clinicId) : `CL-${String(row.id).padStart(4, "0")}`,
      name: row.name || `Clinic ${row.id}`,
      acronym: row.acronym || `C${row.id}`,
      city: row.city || "",
      address1: row.address1 || "",
      address2: row.address2 || "",
      state: row.state || "",
      zip: row.zip || "",
      tel: row.phone || "",
      web: row.web || "",
      portal: row.portal || "",
      twilioConfigured: Boolean(
        row.twilioPhoneNumber &&
          row.twilioAccountSid &&
          row.twilioAuthToken &&
          row.twilioApiKeySid &&
          row.twilioApiKeySecret &&
          row.twilioTwimlAppSid
      ),
      elevenLabsConfigured: Boolean(row.elevenlabsApiKey),
      elevenLabsVoiceConfigured: Boolean(row.elevenlabsVoiceId),
      elevenLabsVoiceId: row.elevenlabsVoiceId ? String(row.elevenlabsVoiceId) : null
    }));

    // Backward-compat fallback for existing conversation-only data.
    if (clinics.length === 0) {
      const rows = await Conversation.findAll({
        attributes: ["clinicId"],
        group: ["clinicId"],
        order: [["clinicId", "ASC"]]
      });
      clinics = rows.map((row) => makeClinicSummary(row.clinicId));
    }

    return res.status(200).json({ clinics });
  } catch (err) {
    return next(err);
  }
}

async function listConversationsByClinic(req, res, next) {
  try {
    const clinicId = Number(req.params.clinicId);
    if (!clinicId) return res.status(400).json({ error: "Invalid clinic id." });

    const conversations = await Conversation.findAll({
      where: { clinicId },
      order: [["updatedAt", "DESC"]]
    });

    const mapped = await Promise.all(
      conversations.map(async (conversation) => {
        const userInfo = parseConversationUserInfo(conversation.userInfo);
        const messageCount = await Message.count({
          where: { conversationId: conversation.id }
        });
        const lastMessage = await Message.findOne({
          attributes: ["createdAt"],
          where: { conversationId: conversation.id },
          order: [["createdAt", "DESC"]]
        });
        return {
          id: String(conversation.id),
          clinicId: String(conversation.clinicId),
          title: `Conversation #${conversation.id}`,
          userName: userInfo.name,
          userEmail: userInfo.email,
          messageCount,
          lastMessageAt:
            lastMessage?.createdAt?.toISOString?.() ||
            conversation.updatedAt?.toISOString?.() ||
            conversation.createdAt?.toISOString?.()
        };
      })
    );

    return res.status(200).json({ conversations: mapped });
  } catch (err) {
    return next(err);
  }
}

async function listConversationMessages(req, res, next) {
  try {
    const conversationId = Number(req.params.conversationId);
    if (!conversationId) return res.status(400).json({ error: "Invalid conversation id." });

    const rows = await Message.findAll({
      where: { conversationId },
      order: [["createdAt", "ASC"]]
    });

    const messages = rows.map((row) => {
      const audioPayload = normalizeAudioPayload(row.audio);
      return {
      id: String(row.id),
      conversationId: String(row.conversationId),
      role: row.userType === "bot" ? "assistant" : "user",
      type: row.messageType === "voice" ? "voice" : "text",
      status: row.status || "success",
      content: row.message || "",
      audioUrl: audioPayload.audioUrl,
      audioMimeType: audioPayload.audioMimeType,
      durationSec: undefined,
      language: undefined,
      translatedText: row.messageType === "voice" ? row.message || "" : undefined,
      createdAt: row.createdAt?.toISOString?.() || new Date().toISOString()
    };
    });

    return res.status(200).json({ messages });
  } catch (err) {
    return next(err);
  }
}

async function getStats(req, res, next) {
  try {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);

    const [conversations, messages, users, clinicCount, clinicRows] = await Promise.all([
      Conversation.count(),
      Message.count(),
      User.count(),
      Clinic.count(),
      Conversation.findAll({
        attributes: ["clinicId"],
        group: ["clinicId"]
      })
    ]);

    const recentMessages = await Message.findAll({
      attributes: ["createdAt"],
      where: { createdAt: { [Op.gte]: start } }
    });

    const bucket = new Map();
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      bucket.set(key, {
        day: d.toLocaleDateString(undefined, { weekday: "short" }),
        count: 0
      });
    }

    recentMessages.forEach((row) => {
      const key = row.createdAt?.toISOString?.().slice(0, 10);
      if (key && bucket.has(key)) {
        bucket.get(key).count += 1;
      }
    });

    return res.status(200).json({
      totalClinics: clinicCount || clinicRows.length,
      totalConversations: conversations,
      totalMessages: messages,
      totalUsers: users,
      perDay: Array.from(bucket.values())
    });
  } catch (err) {
    return next(err);
  }
}

function sanitizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function normalizeTwilioUsPhoneNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return null;
}

async function updateClinicElevenLabsApiKey(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid clinic id." });
    }

    const apiKeyRaw = req.body?.apiKey;
    const voiceIdRaw = req.body?.voiceId;
    const apiKey =
      typeof apiKeyRaw === "string" ? apiKeyRaw.trim() : undefined;
    const voiceId =
      typeof voiceIdRaw === "string" ? voiceIdRaw.trim() : undefined;

    if (apiKey === undefined && voiceId === undefined) {
      return res.status(400).json({ error: "Provide apiKey and/or voiceId." });
    }
    if (apiKey !== undefined && !apiKey) {
      return res.status(400).json({ error: "apiKey cannot be empty when provided." });
    }

    const clinic = await Clinic.findByPk(id);
    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }

    const updates = {};
    if (apiKey !== undefined) updates.elevenlabsApiKey = apiKey;
    if (voiceId !== undefined) updates.elevenlabsVoiceId = voiceId || null;

    await clinic.update(updates);
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

async function getClinicElevenLabsConfig(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid clinic id." });
    }
    const clinic = await Clinic.findByPk(id, { attributes: ["id", "elevenlabsApiKey"] });
    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }
    return res.status(200).json({
      apiKey: clinic.elevenlabsApiKey ? String(clinic.elevenlabsApiKey) : ""
    });
  } catch (err) {
    return next(err);
  }
}

async function updateClinicTwilioConfig(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid clinic id." });
    }

    const twilioPhoneNumberRaw = String(req.body?.twilioPhoneNumber || "").trim();
    const twilioPhoneNumber = normalizeTwilioUsPhoneNumber(twilioPhoneNumberRaw);
    const twilioAccountSid = String(req.body?.twilioAccountSid || "").trim();
    const twilioAuthToken = String(req.body?.twilioAuthToken || "").trim();
    const twilioApiKeySid = String(req.body?.twilioApiKeySid || "").trim();
    const twilioApiKeySecret = String(req.body?.twilioApiKeySecret || "").trim();
    const twilioTwimlAppSid = String(req.body?.twilioTwimlAppSid || "").trim();

    if (
      !twilioPhoneNumber ||
      !twilioAccountSid ||
      !twilioAuthToken ||
      !twilioApiKeySid ||
      !twilioApiKeySecret ||
      !twilioTwimlAppSid
    ) {
      return res.status(400).json({
        error:
          "twilioPhoneNumber, twilioAccountSid, twilioAuthToken, twilioApiKeySid, twilioApiKeySecret and twilioTwimlAppSid are required."
      });
    }
    if (!/^\+1\d{10}$/.test(twilioPhoneNumber)) {
      return res.status(400).json({
        error: "twilioPhoneNumber must be a US number in +1XXXXXXXXXX format."
      });
    }

    const clinic = await Clinic.findByPk(id);
    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }

    await clinic.update({
      twilioPhoneNumber,
      twilioAccountSid,
      twilioAuthToken,
      twilioApiKeySid,
      twilioApiKeySecret,
      twilioTwimlAppSid
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

async function getClinicTwilioConfig(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid clinic id." });
    }

    const clinic = await Clinic.findByPk(id, {
      attributes: [
        "id",
        "twilioPhoneNumber",
        "twilioAccountSid",
        "twilioAuthToken",
        "twilioApiKeySid",
        "twilioApiKeySecret",
        "twilioTwimlAppSid"
      ]
    });
    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }

    return res.status(200).json({
      twilioPhoneNumber: clinic.twilioPhoneNumber ? String(clinic.twilioPhoneNumber) : "",
      twilioAccountSid: clinic.twilioAccountSid ? String(clinic.twilioAccountSid) : "",
      twilioAuthToken: clinic.twilioAuthToken ? String(clinic.twilioAuthToken) : "",
      twilioApiKeySid: clinic.twilioApiKeySid ? String(clinic.twilioApiKeySid) : "",
      twilioApiKeySecret: clinic.twilioApiKeySecret ? String(clinic.twilioApiKeySecret) : "",
      twilioTwimlAppSid: clinic.twilioTwimlAppSid ? String(clinic.twilioTwimlAppSid) : ""
    });
  } catch (err) {
    return next(err);
  }
}

async function listClinicElevenLabsVoices(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid clinic id." });
    }
    const clinic = await Clinic.findByPk(id, { attributes: ["id", "elevenlabsApiKey"] });
    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }
    if (!clinic.elevenlabsApiKey) {
      return res.status(400).json({ error: "Save an ElevenLabs API key for this clinic first." });
    }
    const voices = await listVoices(clinic.elevenlabsApiKey);
    return res.status(200).json({ voices });
  } catch (err) {
    const msg = String(err?.response?.data?.detail?.message || err?.message || "Failed to list voices.");
    return res.status(502).json({ error: msg });
  }
}

async function previewClinicElevenLabsVoice(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid clinic id." });
    }
    const voiceId = String(req.query?.voiceId || "").trim();
    if (!voiceId) {
      return res.status(400).json({ error: "voiceId query parameter is required." });
    }

    const clinic = await Clinic.findByPk(id, { attributes: ["id", "elevenlabsApiKey"] });
    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }
    if (!clinic.elevenlabsApiKey) {
      return res.status(400).json({ error: "Save an ElevenLabs API key for this clinic first." });
    }

    const sample =
      String(process.env.ELEVENLABS_PREVIEW_TEXT || "").trim() ||
      "Hello, this is a short preview of how I will sound on your phone line.";

    const mp3 = await textToSpeechMp3(clinic.elevenlabsApiKey, voiceId, sample);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(mp3);
  } catch (err) {
    const msg = String(err?.response?.data?.detail?.message || err?.message || "Preview failed.");
    return res.status(502).json({ error: msg });
  }
}

function isAllowedElevenLabsPreviewUrl(parsed) {
  if (parsed.protocol !== "https:") return false;
  const host = String(parsed.hostname || "").toLowerCase();
  if (host === "api.elevenlabs.io") return true;
  if (host === "elevenlabs.io" || host.endsWith(".elevenlabs.io")) return true;
  if (host === "storage.googleapis.com") {
    const p = String(parsed.pathname || "").toLowerCase();
    return p.includes("eleven");
  }
  return false;
}

/**
 * Proxies ElevenLabs `preview_url` so the admin UI can play audio same-origin (avoids browser CORS / decode issues).
 * GET ?previewUrl=https%3A%2F%2F...
 */
async function streamElevenLabsPreviewSource(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      return res.status(400).json({ error: "Invalid clinic id." });
    }
    const previewUrl = String(req.query?.previewUrl || "").trim();
    if (!previewUrl.startsWith("https://")) {
      return res.status(400).json({ error: "previewUrl must be an https URL." });
    }

    let parsed;
    try {
      parsed = new URL(previewUrl);
    } catch {
      return res.status(400).json({ error: "Invalid previewUrl." });
    }
    if (!isAllowedElevenLabsPreviewUrl(parsed)) {
      return res.status(400).json({ error: "Preview URL host is not allowed." });
    }

    const clinic = await Clinic.findByPk(id, { attributes: ["id", "elevenlabsApiKey"] });
    if (!clinic) {
      return res.status(404).json({ error: "Clinic not found." });
    }
    if (!clinic.elevenlabsApiKey) {
      return res.status(400).json({ error: "Save an ElevenLabs API key for this clinic first." });
    }

    const headers = { Accept: "audio/*,*/*;q=0.9" };
    if (parsed.hostname.toLowerCase() === "api.elevenlabs.io") {
      headers["xi-api-key"] = clinic.elevenlabsApiKey;
    }

    const response = await axios.get(previewUrl, {
      responseType: "arraybuffer",
      headers,
      timeout: 45000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400
    });

    const rawCt = response.headers["content-type"];
    const ct =
      typeof rawCt === "string" && rawCt.trim().length
        ? rawCt.split(";")[0].trim()
        : "audio/mpeg";
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "private, max-age=120");
    return res.send(Buffer.from(response.data));
  } catch (err) {
    const status = err?.response?.status;
    const msg = String(err?.response?.data?.detail?.message || err?.message || "Failed to fetch preview.");
    return res.status(status === 401 || status === 403 ? status : 502).json({ error: msg });
  }
}

async function syncClinicsFromExternalApi(req, res, next) {
  try {
    const endpoint = "https://pro.conectorhealth.com/api/setting/getconectorcliniclist";

    const response = await axios.post(endpoint, {});
    const rows = Array.isArray(response.data)
      ? response.data
      : Array.isArray(response.data?.data)
        ? response.data.data
        : Array.isArray(response.data?.items)
          ? response.data.items
          : null;

    if (!rows) {
      return res.status(502).json({ error: "External clinic API did not return an array." });
    }

    let created = 0;
    let skipped = 0;

    for (const item of rows) {
      const externalClinicId = Number(item?.id);
      if (!Number.isFinite(externalClinicId) || externalClinicId <= 0) {
        skipped += 1;
        continue;
      }

      const payload = {
        clinicId: externalClinicId,
        name: sanitizeText(item?.name),
        address1: sanitizeText(item?.address1),
        address2: sanitizeText(item?.address2),
        city: sanitizeText(item?.city),
        state: sanitizeText(item?.state),
        zip: sanitizeText(item?.zip),
        phone: sanitizeText(item?.phone),
        email: sanitizeText(item?.email),
        web: sanitizeText(item?.web),
        portal: sanitizeText(item?.portal)
      };

      const existing = await Clinic.findOne({ where: { clinicId: externalClinicId } });
      if (existing) {
      } else {
        await Clinic.create(payload);
        created += 1;
      }
    }

    return res.status(200).json({
      success: true,
      sourceCount: rows.length,
      created,
      skipped
    });
  } catch (err) {
    return next(err);
  }
}

async function listIncomingCalls(req, res, next) {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query?.limit) || 50));
    const rows = await Call.findAll({
      order: [["createdAt", "DESC"]],
      limit
    });
    const calls = rows.map((row) => ({
      id: String(row.id),
      callSid: row.callSid || "",
      phone: row.phone || "",
      seconds: Number(row.seconds || 0),
      status: row.status || null,
      createdAt: row.createdAt?.toISOString?.() || null
    }));
    return res.status(200).json({ calls });
  } catch (err) {
    return next(err);
  }
}

async function listIncomingCallMessages(req, res, next) {
  try {
    const callId = Number(req.params.callId);
    if (!callId) return res.status(400).json({ error: "Invalid call id." });

    const call = await Call.findByPk(callId);
    if (!call) return res.status(404).json({ error: "Call not found." });

    const rows = await IncomingMessage.findAll({
      where: { callId },
      order: [["createdAt", "ASC"]]
    });
    const messages = rows.map((row) => ({
      id: String(row.id),
      callId: String(row.callId),
      audio: row.audio || null,
      transcription: row.transcription || "",
      userType: row.userType,
      status: row.status || null,
      createdAt: row.createdAt?.toISOString?.() || null
    }));

    return res.status(200).json({
      call: {
        id: String(call.id),
        callSid: call.callSid || "",
        phone: call.phone || "",
        seconds: Number(call.seconds || 0),
        status: call.status || null,
        createdAt: call.createdAt?.toISOString?.() || null
      },
      messages
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listClinics,
  updateClinicElevenLabsApiKey,
  getClinicElevenLabsConfig,
  updateClinicTwilioConfig,
  getClinicTwilioConfig,
  listClinicElevenLabsVoices,
  previewClinicElevenLabsVoice,
  streamElevenLabsPreviewSource,
  listConversationsByClinic,
  listConversationMessages,
  getStats,
  syncClinicsFromExternalApi,
  listIncomingCalls,
  listIncomingCallMessages
};
