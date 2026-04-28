const { Op } = require("sequelize");
const { Conversation, Message, User, Clinic } = require("../db");

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
    city: ""
  };
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
      portal: row.portal || ""
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

module.exports = {
  listClinics,
  listConversationsByClinic,
  listConversationMessages,
  getStats
};
