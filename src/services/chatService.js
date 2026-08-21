/**
 * Chat service — orchestrates persistent text and voice turns over WebSocket.
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
  analyzeChatIntent,
  transcribeAudioBase64,
  extractAppointmentIntakeFromText
} = require("./openaiService");
const { getCallStatus, endCall } = require("./twilioService");
const { generateSpeechFromText } = require("./openaiService");
const { resolveOpenAiVoice } = require("./openaiRealtimeVoices");
const { buildClinicContextByBusinessClinicId } = require("./contextPromptService");
const { getClinicConnectFields } = require("./greetingService");
const { sendAppointmentRequestEmail, sendPatientMeetingNotificationEmail } = require("./emailService");
const { tryCreateGoogleMeetForAppointment } = require("./googleMeetService");
const { createAppointmentFromIntake } = require("./appointmentService");
const {
  mergePatientInfo,
  getMissingAppointmentFields,
  isAppointmentComplete,
  buildMissingFieldsQuestion,
  isAppointmentIntakeQuestion,
  isAppointmentCancelRequest,
  extractAppointmentIntakeHeuristic,
  conversationTextFromMessages,
  normalizePatientInfo,
  parseUserInfoBlob,
  firstSpokenEmail,
  coercePatientForm
} = require("./appointmentIntakeService");

function serializeUserInfo(userInfo) {
  if (userInfo == null || userInfo === "") return "";
  if (typeof userInfo === "string") return userInfo;
  try {
    return JSON.stringify(userInfo);
  } catch {
    return "";
  }
}

function isNewConversationRequest(conversationId) {
  if (conversationId == null || conversationId === "") return true;
  const n = Number(conversationId);
  return !Number.isFinite(n) || n <= 0;
}

function incomingFormPatientInfo(...parts) {
  return mergePatientInfo(
    ...parts.map((part) => {
      if (part == null || part === "") return {};
      return coercePatientForm(part);
    })
  );
}

async function persistFormPatientInfo(conversation, incoming) {
  const form = incomingFormPatientInfo(
    ...(Array.isArray(incoming) ? incoming : [incoming])
  );
  if (!form.name && !form.email && !form.phone && !form.dob && !form.type && !form.datetime) {
    return form;
  }

  const current = incomingFormPatientInfo(conversation?.userInfo);
  const merged = { ...current, ...form };
  const next = serializeUserInfo(merged);
  const prev = serializeUserInfo(current) || "{}";
  if (conversation && next && next !== prev) {
    await conversation.update({ userInfo: next });
    conversation.userInfo = next;
  }
  return form;
}

async function createConversation({ clinicId, userInfo }) {
  const form = incomingFormPatientInfo(userInfo);
  const created = await Conversation.create({
    clinicId,
    userInfo: serializeUserInfo(form) || "{}"
  });

  return created.id;
}

async function ensureConversationExists(conversationId, { clinicId = null, userInfo = "" } = {}) {
  if (isNewConversationRequest(conversationId)) {
    throw new Error("conversationId is required.");
  }

  const existing = await Conversation.findByPk(conversationId);
  if (!existing) {
    if (!clinicId) {
      throw new Error("Conversation not found. clinicId is required to create a new conversation.");
    }

    const createdConversationId = await createConversation({ clinicId, userInfo });
    return Conversation.findByPk(createdConversationId);
  }

  return existing;
}

async function getClinicConnectInfoByBusinessClinicId(businessClinicId) {
  const id = Number(businessClinicId);
  if (!Number.isFinite(id) || id <= 0) {
    return getClinicConnectFields(null);
  }

  const clinic = await Clinic.findOne({
    where: { clinicId: id },
    attributes: ["name", "acronym", "city", "chatGreeting", "themeColor", "avatar"]
  });

  return getClinicConnectFields(clinic);
}

async function getClinicDetailsForEmail(businessClinicId) {
  const id = Number(businessClinicId);
  if (!Number.isFinite(id) || id <= 0) return null;

  return Clinic.findOne({
    where: { clinicId: id },
    attributes: ["name", "acronym", "address1", "address2", "city", "state", "zip", "phone", "email", "web"]
  });
}

async function resolveConversationOnConnect({ conversationId, clinicId, userInfo, patientInfo = null }) {
  const formPayload = [userInfo, patientInfo];
  if (isNewConversationRequest(conversationId)) {
    if (!clinicId) {
      throw new Error("clinicId is required to start a new conversation.");
    }

    const createdId = await createConversation({
      clinicId,
      userInfo: incomingFormPatientInfo(...formPayload)
    });
    const form = incomingFormPatientInfo(...formPayload);
    // eslint-disable-next-line no-console
    console.log(
      `[Chat] new conversation created id=${createdId} clinicId=${clinicId} form name=${form.name ? "yes" : "no"} email=${form.email ? "yes" : "no"} phone=${form.phone ? "yes" : "no"} dob=${form.dob ? "yes" : "no"} type=${form.type || "-"}`
    );
    return createdId;
  }

  const existing = await ensureConversationExists(conversationId, {
    clinicId,
    userInfo: incomingFormPatientInfo(...formPayload)
  });
  await persistFormPatientInfo(existing, formPayload);
  return existing.id;
}

/**
 * Build clinic + knowledge prompts for chat mode.
 * Thin wrapper kept for backward compatibility; real logic lives in
 * `contextPromptService` so chat and inbound voice share one source of truth.
 */
async function buildContextPrompts(clinicId) {
  return buildClinicContextByBusinessClinicId(clinicId);
}

async function getClinicOpenAiVoice(clinicId) {
  if (!clinicId) return resolveOpenAiVoice(null);
  const clinic = await Clinic.findOne({
    where: { clinicId },
    attributes: ["openaiVoice"]
  });
  return resolveOpenAiVoice(clinic?.openaiVoice);
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

function missingPreview(patientInfo) {
  return getMissingAppointmentFields(patientInfo).map((field) => field.key).join(",") || "-";
}

function lastBotMessageText(dbMessages = []) {
  for (let i = dbMessages.length - 1; i >= 0; i -= 1) {
    if (dbMessages[i]?.userType === "bot" && String(dbMessages[i].message || "").trim()) {
      return String(dbMessages[i].message);
    }
  }
  return "";
}

async function continueAppointmentIntake({
  conversationId,
  clinicId,
  chatIntent,
  dbMessages,
  currentText,
  replyType,
  isTopic,
  formPatientInfo = {}
}) {
  if (isAppointmentCancelRequest(currentText)) return null;

  const followUp = isAppointmentIntakeQuestion(lastBotMessageText(dbMessages));
  if (chatIntent !== "appointment" && !followUp) return null;

  const conversation = await Conversation.findByPk(conversationId, { attributes: ["id", "userInfo"] });
  const historyText = conversationTextFromMessages(dbMessages);
  const spokenEmail = firstSpokenEmail(
    [historyText, currentText].filter(Boolean).join("\n")
  );
  let draft = mergePatientInfo(
    incomingFormPatientInfo(conversation?.userInfo),
    formPatientInfo,
    extractAppointmentIntakeHeuristic(historyText),
    extractAppointmentIntakeHeuristic(currentText),
    spokenEmail ? { email: spokenEmail } : {}
  );

  if (!isAppointmentComplete(draft)) {
    // eslint-disable-next-line no-console
    console.log(
      `[Appointment] intake incomplete conversationId=${conversationId} missing=${missingPreview(draft)} form name=${draft.name ? "yes" : "no"} email=${draft.email ? "yes" : "no"} phone=${draft.phone ? "yes" : "no"} dob=${draft.dob ? "yes" : "no"} type=${draft.type || "-"} datetime=${draft.datetime ? "yes" : "no"}`
    );
    const extracted = await extractAppointmentIntakeFromText(
      `${historyText}\nCaller: ${String(currentText || "").trim()}`.trim()
    );
    draft = mergePatientInfo(draft, extracted);
  }

  if (isAppointmentComplete(draft)) {
    return processAppointmentRequest({
      conversationId,
      clinicId,
      patientInfo: draft,
      isTopic,
      replyType,
      persistUserRequest: false
    });
  }

  const missing = getMissingAppointmentFields(draft);
  const question = buildMissingFieldsQuestion(missing, { voice: replyType === "voice" });
  const normalizedReplyType = replyType === "voice" ? "voice" : "chat";
  const lastBot = lastBotMessageText(dbMessages);
  const skipDuplicateQuestion = lastBot === question || (
    isAppointmentIntakeQuestion(lastBot) &&
    missing[0] &&
    lastBot.includes(missing[0].label)
  );

  let audioBase64 = null;
  let audioMimeType = null;
  if (normalizedReplyType === "voice") {
    const voice = await getClinicOpenAiVoice(clinicId);
    const speech = await generateSpeechFromText({ text: question, voice });
    audioBase64 = speech.audioBase64;
    audioMimeType = speech.audioMimeType;
  }

  if (!skipDuplicateQuestion) {
    await createMessage({
      conversationId,
      userType: "bot",
      message: question,
      audio: audioBase64,
      messageType: normalizedReplyType,
      isTopic,
      status: "success"
    });
  }

  return {
    conversationId,
    status: "success",
    responseType: "appointment",
    twilioIntent: false,
    assistantReply: question,
    confirmationMessage: question,
    missingFields: missing.map((field) => field.key),
    audioBase64,
    audioMimeType,
    transcriptText: currentText || null
  };
}

async function processIncomingMessage({
  conversationId,
  text,
  type = "chat",
  audioBase64 = null,
  audioMimeType = null,
  isTopic = false,
  userInfo = null,
  patientInfo = null
}) {
  const conversation = await ensureConversationExists(conversationId);
  const ensuredConversationId = conversation.id;
  const formPatientInfo = await persistFormPatientInfo(conversation, [userInfo, patientInfo]);
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

      const chatIntent = await analyzeChatIntent({
        text: transcriptText,
        clinicPrompt: contextPrompts.clinicPrompt,
        knowledgePrompt: contextPrompts.knowledgePrompt
      });

      if (chatIntent === "twilio") {
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

      const voiceMessages = await listMessages(ensuredConversationId);
      const intake = await continueAppointmentIntake({
        conversationId: ensuredConversationId,
        clinicId: conversation.clinicId,
        chatIntent,
        dbMessages: voiceMessages,
        currentText: transcriptText,
        replyType: "voice",
        isTopic,
        formPatientInfo
      });
      if (intake) return intake;

      const assistantText = await generateAssistantReply(
        [...aiMessages, { role: "user", content: transcriptText }],
        {
          clinicPrompt: contextPrompts.clinicPrompt,
          knowledgePrompt: contextPrompts.knowledgePrompt
        }
      );
      const voice = await getClinicOpenAiVoice(conversation.clinicId);
      const { audioBase64: audioBase64Out, audioMimeType: audioMimeTypeOut } =
        await generateSpeechFromText({ text: assistantText, voice });

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
        responseType: "voice",
        twilioIntent: false,
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
    const chatIntent = await analyzeChatIntent({
      text,
      clinicPrompt: contextPrompts.clinicPrompt,
      knowledgePrompt: contextPrompts.knowledgePrompt
    });

    if (chatIntent === "twilio") {
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

    const intake = await continueAppointmentIntake({
      conversationId: ensuredConversationId,
      clinicId: conversation.clinicId,
      chatIntent,
      dbMessages: updatedDbMessages,
      currentText: text,
      replyType: "chat",
      isTopic,
      formPatientInfo
    });
    if (intake) return intake;

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
      responseType: "chat",
      twilioIntent: false,
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

function summarizePatientInfo(patientInfo = {}) {
  const normalized = normalizePatientInfo(patientInfo);
  const parts = [
    normalized.name,
    normalized.phone,
    normalized.email,
    normalized.dob,
    normalized.type,
    normalized.datetime
  ].filter(Boolean);
  return parts.join(" · ") || "Appointment request";
}

async function processAppointmentRequest({
  conversationId,
  clinicId = null,
  patientInfo,
  userInfo = null,
  isTopic = 0,
  replyType = "chat",
  persistUserRequest = true
}) {
  const conversation = await ensureConversationExists(conversationId);
  const businessClinicId = clinicId || conversation.clinicId;
  const [{ clinicName, clinicAcronym }, clinicDetails] = await Promise.all([
    getClinicConnectInfoByBusinessClinicId(businessClinicId),
    getClinicDetailsForEmail(businessClinicId)
  ]);
  const normalizedReplyType = replyType === "voice" ? "voice" : "chat";
  const normalizedPatient = mergePatientInfo(
    incomingFormPatientInfo(conversation.userInfo, userInfo, patientInfo),
    patientInfo
  );
  const missing = getMissingAppointmentFields(normalizedPatient);

  if (missing.length) {
    const question = buildMissingFieldsQuestion(missing, { voice: normalizedReplyType === "voice" });
    const recent = await listMessages(conversationId);
    const lastBot = lastBotMessageText(recent);
    const skipDuplicateQuestion = lastBot === question || (
      isAppointmentIntakeQuestion(lastBot) &&
      missing[0] &&
      lastBot.includes(missing[0].label)
    );

    let audioBase64 = null;
    let audioMimeType = null;
    if (normalizedReplyType === "voice") {
      const voice = await getClinicOpenAiVoice(businessClinicId);
      const speech = await generateSpeechFromText({ text: question, voice });
      audioBase64 = speech.audioBase64;
      audioMimeType = speech.audioMimeType;
    }

    if (!skipDuplicateQuestion) {
      await createMessage({
        conversationId,
        userType: "bot",
        message: question,
        audio: audioBase64,
        messageType: normalizedReplyType,
        isTopic,
        status: "success"
      });
    }

    return {
      conversationId,
      status: "incomplete",
      replyType: normalizedReplyType,
      responseType: "appointment",
      confirmationMessage: question,
      missingFields: missing.map((field) => field.key),
      audioBase64,
      audioMimeType
    };
  }

  const patientSummary = summarizePatientInfo(normalizedPatient);

  if (persistUserRequest) {
    await createMessage({
      conversationId,
      userType: "user",
      message: `[Appointment request] ${patientSummary}`,
      messageType: normalizedReplyType,
      isTopic,
      status: "success"
    });
  }

  const meetResult = await tryCreateGoogleMeetForAppointment({
    clinicId: businessClinicId,
    patientInfo: normalizedPatient,
    clinicName,
    description: [
      `Appointment request via ${normalizedReplyType === "voice" ? "phone / voice assistant" : "web chat"}.`,
      `Case: ${conversationId}`,
      patientSummary
    ].join("\n")
  });

  if (!meetResult?.created) {
    // eslint-disable-next-line no-console
    console.error(
      `[GoogleMeet] not created clinicId=${businessClinicId}: ${meetResult?.reason || "unknown"}`
    );
  }

  const appointment = await createAppointmentFromIntake({
    clinicId: businessClinicId,
    conversationId,
    source: normalizedReplyType === "voice" ? "voice" : "chat",
    patientInfo: normalizedPatient,
    meetResult
  });
  if (!appointment) {
    // eslint-disable-next-line no-console
    console.error(`[Appointment] persist returned null clinicId=${businessClinicId} conversationId=${conversationId}`);
  }

  const emailResult = await sendAppointmentRequestEmail({
    clinicName,
    clinicAcronym,
    clinic: clinicDetails,
    conversationId,
    patientInfo: normalizedPatient,
    replyType: normalizedReplyType,
    googleMeet: meetResult
  });

  if (!emailResult.sent) {
    // eslint-disable-next-line no-console
    console.error(`[Appointment] staff email failed: ${emailResult.reason || "unknown"}`);
  }

  const patientEmailResult = await sendPatientMeetingNotificationEmail({
    clinicName,
    clinic: clinicDetails,
    patientInfo: normalizedPatient,
    googleMeet: meetResult || {},
    source: normalizedReplyType === "voice" ? "voice" : "chat"
  });
  if (!patientEmailResult.sent) {
    // eslint-disable-next-line no-console
    console.error(
      `[Appointment] patient meeting email failed: ${patientEmailResult.reason || "unknown"} conversationId=${conversationId}`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `[Appointment] patient meeting email sent to ${patientEmailResult.to} conversationId=${conversationId}`
    );
  }

  let confirmationMessage =
    process.env.APPOINTMENT_CONFIRMATION_MESSAGE ||
    "Your request has been sent to the clinic. They will respond as soon as possible.";
  if (meetResult?.created && meetResult.meetLink) {
    confirmationMessage = `${confirmationMessage} Your Google Meet link is ${meetResult.meetLink}`;
  }

  let audioBase64 = null;
  let audioMimeType = null;

  if (normalizedReplyType === "voice") {
    const voice = await getClinicOpenAiVoice(businessClinicId);
    const speech = await generateSpeechFromText({ text: confirmationMessage, voice });
    audioBase64 = speech.audioBase64;
    audioMimeType = speech.audioMimeType;
  }

  await createMessage({
    conversationId,
    userType: "bot",
    message: confirmationMessage,
    audio: audioBase64,
    messageType: normalizedReplyType,
    isTopic,
    status: "success"
  });

  return {
    conversationId,
    status: "success",
    replyType: normalizedReplyType,
    confirmationMessage,
    audioBase64,
    audioMimeType
  };
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
  processAppointmentRequest,
  listMessages,
  ensureConversationExists,
  resolveConversationOnConnect,
  getClinicConnectInfoByBusinessClinicId,
  getTwilioCallStatus,
  endTwilioCall
};
