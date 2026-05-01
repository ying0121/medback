const { Conversation, Message, Clinic, Knowledge } = require("../db");
const {
  generateAssistantReply,
  detectTwilioIntent,
  transcribeAudioBase64,
  generateSpeechFromText
} = require("./openaiService");
const { getCallStatus, endCall } = require("./twilioService");

async function createConversation({ clinicId, userInfo }) {
  const created = await Conversation.create({
    clinicId,
    userInfo
  });

  return created.id;
}

async function ensureConversationExists(conversationId, { clinicId = null, userInfo = "" } = {}) {
  if (!conversationId) {
    throw new Error("conversationId is required.");
  }

  const existing = await Conversation.findByPk(conversationId);
  if (!existing) {
    if (!clinicId || !userInfo) {
      throw new Error("Conversation not found. clinicId and userInfo are required to create a new conversation.");
    }

    const createdConversationId = await createConversation({ clinicId, userInfo });
    return Conversation.findByPk(createdConversationId);
  }

  return existing;
}

async function resolveConversationOnConnect({ conversationId, clinicId, userInfo }) {
  if (conversationId) {
    const existing = await ensureConversationExists(conversationId, { clinicId, userInfo });
    return existing.id;
  }

  if (!clinicId || !userInfo) {
    throw new Error("clinicId and userInfo are required when conversationId is not provided.");
  }

  return createConversation({ clinicId, userInfo });
}

async function buildContextPrompts(clinicId) {
  if (!clinicId) return { clinicPrompt: null, knowledgePrompt: null };

  const [clinic, knowledgeRows] = await Promise.all([
    Clinic.findOne({ where: { clinicId } }),
    Knowledge.findAll({
      where: { clinicId, status: "active" },
      order: [["id", "DESC"]]
    })
  ]);

  const clinicPrompt = clinic
    ? [
        "Clinic Information (But do not share any contact information including clinic id, phone, fax or tel number, email, address, web and portal URL):",
        `- Clinic ID: ${clinic.clinicId || clinicId}`,
        `- Name: ${clinic.name || ""}`,
        `- Acronym: ${clinic.acronym || ""}`,
        `- Address: ${[clinic.address1, clinic.address2, clinic.city, clinic.state, clinic.zip].filter(Boolean).join(", ")}`,
        `- Phone: ${clinic.phone || ""}`,
        `- Email: ${clinic.email || ""}`,
        `- Web: ${clinic.web || ""}`,
        `- Portal: ${clinic.portal || ""}`
      ].join("\n")
    : `Clinic Information:\n- Clinic ID: ${clinicId}`;

  const knowledgeText = knowledgeRows
    .map((row, idx) => `${idx + 1}. ${String(row.knowledge || "").trim()}`)
    .filter(Boolean)
    .join("\n");
  const knowledgePrompt = knowledgeText ? `Product Knowledge:\n${knowledgeText}` : null;

  return { clinicPrompt, knowledgePrompt };
}

async function listMessages(conversationId) {
  const messages = await Message.findAll({
    attributes: ["id", "isTopic", "userType", "message", "audio", "messageType", "status", "createdAt"],
    where: { conversationId },
    order: [["id", "ASC"]]
  });

  return messages.map((message) => ({
    id: message.id,
    isTopic: message.isTopic,
    userType: message.userType,
    message: message.message,
    audio: message.audio,
    messageType: message.messageType,
    status: message.status,
    created_at: message.createdAt
  }));
}

function toAiMessages(dbMessages) {
  return dbMessages
    .filter((msg) => typeof msg.message === "string" && msg.message.trim().length > 0)
    .map((msg) => ({
      role: msg.userType === "bot" ? "assistant" : "user",
      content: msg.message
    }));
}

async function createMessage({
  conversationId,
  userType,
  message,
  audio = null,
  messageType = "chat",
  isTopic = false,
  status = "success"
}) {
  const created = await Message.create({
    conversationId,
    userType,
    message,
    audio,
    messageType,
    isTopic,
    status
  });

  return created.id;
}

async function processIncomingMessage({
  conversationId,
  text,
  type = "chat",
  audioBase64 = null,
  audioMimeType = null,
  isTopic = false
}) {
  const conversation = await ensureConversationExists(conversationId);
  const ensuredConversationId = conversation.id;
  const contextPrompts = await buildContextPrompts(conversation.clinicId);

  const dbMessages = await listMessages(ensuredConversationId);
  const aiMessages = toAiMessages(dbMessages);

  if (type === "voice") {
    try {
      const transcriptText = await transcribeAudioBase64({ audioBase64, audioMimeType });

      await createMessage({
        conversationId: ensuredConversationId,
        userType: "user",
        message: transcriptText,
        audio: audioBase64,
        messageType: "voice",
        isTopic,
        status: "success"
      });

      const twilioIntent = await detectTwilioIntent({
        text: transcriptText,
        clinicPrompt: contextPrompts.clinicPrompt,
        knowledgePrompt: contextPrompts.knowledgePrompt
      });

      if (twilioIntent) {
        const callNotice =
          process.env.TWILIO_CALL_NOTICE ||
          "Connecting you to the doctor now. Please stay on the line.";
        await createMessage({
          conversationId: ensuredConversationId,
          userType: "bot",
          message: callNotice,
          messageType: "voice",
          isTopic,
          status: "success"
        });
        return {
          conversationId: ensuredConversationId,
          status: "success",
          twilioIntent: true,
          assistantReply: callNotice,
          transcriptText,
          audioBase64: null,
          audioMimeType: null
        };
      }

      const assistantText = await generateAssistantReply(
        [...aiMessages, { role: "user", content: transcriptText }],
        {
          clinicPrompt: contextPrompts.clinicPrompt,
          knowledgePrompt: contextPrompts.knowledgePrompt
        }
      );
      const voiceAudio = await generateSpeechFromText({ text: assistantText });

      await createMessage({
        conversationId: ensuredConversationId,
        userType: "bot",
        message: assistantText,
        audio: voiceAudio.audioBase64,
        messageType: "voice",
        isTopic,
        status: "success"
      });

      return {
        conversationId: ensuredConversationId,
        status: "success",
        twilioIntent,
        assistantReply: assistantText,
        transcriptText,
        audioBase64: voiceAudio.audioBase64,
        audioMimeType: voiceAudio.audioMimeType
      };
    } catch (err) {
      const errorMessage = err.message || "OpenAI voice generation failed.";
      await createMessage({
        conversationId: ensuredConversationId,
        userType: "user",
        message: null,
        audio: audioBase64,
        messageType: "voice",
        isTopic,
        status: "error"
      });
      await createMessage({
        conversationId: ensuredConversationId,
        userType: "bot",
        message: errorMessage,
        audio: null,
        messageType: "voice",
        isTopic,
        status: "error"
      });

      return {
        conversationId: ensuredConversationId,
        status: "error",
        error: errorMessage
      };
    }
  }

  await createMessage({
    conversationId: ensuredConversationId,
    userType: "user",
    message: text,
    messageType: "chat",
    isTopic
  });

  const updatedDbMessages = await listMessages(ensuredConversationId);
  const updatedAiMessages = toAiMessages(updatedDbMessages);

  try {
    const twilioIntent = await detectTwilioIntent({
      text,
      clinicPrompt: contextPrompts.clinicPrompt,
      knowledgePrompt: contextPrompts.knowledgePrompt
    });

    if (twilioIntent) {
      const callNotice =
        process.env.TWILIO_CALL_NOTICE ||
        "Connecting you to the doctor now. Please stay on the line.";
      await createMessage({
        conversationId: ensuredConversationId,
        userType: "bot",
        message: callNotice,
        messageType: "chat",
        isTopic,
        status: "success"
      });
      return {
        conversationId: ensuredConversationId,
        status: "success",
        twilioIntent: true,
        assistantReply: callNotice
      };
    }

    const assistantReply = await generateAssistantReply(updatedAiMessages, {
      clinicPrompt: contextPrompts.clinicPrompt,
      knowledgePrompt: contextPrompts.knowledgePrompt
    });

    await createMessage({
      conversationId: ensuredConversationId,
      userType: "bot",
      message: assistantReply,
      messageType: "chat",
      isTopic,
      status: "success"
    });

    return {
      conversationId: ensuredConversationId,
      status: "success",
      twilioIntent,
      assistantReply
    };
  } catch (err) {
    const errorMessage = err.message || "OpenAI chat generation failed.";
    await createMessage({
      conversationId: ensuredConversationId,
      userType: "bot",
      message: errorMessage,
      messageType: "chat",
      isTopic,
      status: "error"
    });

    return {
      conversationId: ensuredConversationId,
      status: "error",
      error: errorMessage
    };
  }
}

async function getTwilioCallStatus(callSid) {
  return getCallStatus(callSid);
}

async function endTwilioCall(callSid) {
  return endCall(callSid);
}

module.exports = {
  createConversation,
  processIncomingMessage,
  listMessages,
  ensureConversationExists,
  resolveConversationOnConnect,
  getTwilioCallStatus,
  endTwilioCall
};
