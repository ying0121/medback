/**
 * Chat service — orchestrates persistent text and voice turns over Socket.IO.
 *
 * Responsibilities:
 *   - Conversation lifecycle (create / resolve on connect)
 *   - Reading and writing Message rows
 *   - Building the LLM context (prompts + history) for each turn
 *   - Voice turns: STT → reply → TTS, returning audio for the client
 *
 * Prompt building lives in `contextPromptService` so chat and inbound voice
 * share one source of truth and cannot drift in their answers.
 */

const { Conversation, Message, Clinic } = require("../db");
const {
  generateAssistantReply,
  detectTwilioIntent,
  transcribeAudioBase64
} = require("./openaiService");
const { getCallStatus, endCall } = require("./twilioService");
const { textToSpeechMp3 } = require("./elevenlabsService");
const { buildClinicContextByBusinessClinicId } = require("./contextPromptService");

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

/**
 * Build clinic + knowledge prompts for chat mode.
 * Thin wrapper kept for backward compatibility; real logic lives in
 * `contextPromptService` so chat and inbound voice share one source of truth.
 */
async function buildContextPrompts(clinicId) {
  return buildClinicContextByBusinessClinicId(clinicId);
}

async function getClinicElevenLabsConfig(clinicId) {
  if (!clinicId) return null;
  const clinic = await Clinic.findOne({
    where: { clinicId },
    attributes: ["id", "elevenlabsApiKey", "elevenlabsVoiceId"]
  });
  if (!clinic) return null;
  const apiKey = String(clinic.elevenlabsApiKey || "").trim();
  const voiceId = String(clinic.elevenlabsVoiceId || "").trim();
  if (!apiKey || !voiceId) return null;
  return { apiKey, voiceId };
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
      const elevenlabs = await getClinicElevenLabsConfig(conversation.clinicId);
      if (!elevenlabs) {
        throw new Error("ElevenLabs is not configured for this clinic.");
      }
      const mp3 = await textToSpeechMp3(elevenlabs.apiKey, elevenlabs.voiceId, assistantText);
      const audioBase64Out = mp3.toString("base64");
      const audioMimeTypeOut = "audio/mpeg";

      await createMessage({
        conversationId: ensuredConversationId,
        userType: "bot",
        message: assistantText,
        audio: audioBase64Out,
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
        audioBase64: audioBase64Out,
        audioMimeType: audioMimeTypeOut
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

async function getTwilioCallStatus(callSid, clinicId) {
  return getCallStatus(callSid, { clinicId });
}

async function endTwilioCall(callSid, clinicId) {
  return endCall(callSid, { clinicId });
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
