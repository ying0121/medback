const {
  processIncomingMessage,
  listMessages,
  createConversation,
  getTwilioCallStatus,
  endTwilioCall
} = require("../services/chatService");
const { sendMessageSchema, createConversationSchema } = require("../utils/validators");

async function sendMessage(req, res, next) {
  try {
    const { value, error } = sendMessageSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const result = await processIncomingMessage({
      conversationId: value.conversationId,
      text: value.text,
      type: value.messageType || "chat",
      isTopic: value.isTopic === true
    });

    return res.status(200).json({
      conversationId: result.conversationId,
      status: result.status,
      twilioIntent: result.twilioIntent === true,
      assistantReply: result.assistantReply || null,
      error: result.error || null
    });
  } catch (err) {
    return next(err);
  }
}

async function startConversation(req, res, next) {
  try {
    const { value, error } = createConversationSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const conversationId = await createConversation({
      clinicId: value.clinicId,
      userInfo: value.userInfo
    });

    return res.status(201).json({ conversationId });
  } catch (err) {
    return next(err);
  }
}

async function getConversationMessages(req, res, next) {
  try {
    const conversationId = Number(req.params.conversationId);
    if (!conversationId) {
      return res.status(400).json({ error: "Invalid conversation id." });
    }

    const messages = await listMessages(conversationId);
    return res.status(200).json({ conversationId, messages });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  startConversation,
  sendMessage,
  getConversationMessages,
  async getCallStatus(req, res, next) {
    try {
      const callSid = String(req.params.callSid || "").trim();
      const clinicId = Number(req.query?.clinicId || req.body?.clinicId || 0);
      if (!callSid) return res.status(400).json({ error: "callSid is required." });
      if (!Number.isFinite(clinicId) || clinicId <= 0) return res.status(400).json({ error: "clinicId is required." });
      const call = await getTwilioCallStatus(callSid, clinicId);
      return res.status(200).json(call);
    } catch (err) {
      return next(err);
    }
  },
  async endCall(req, res, next) {
    try {
      const callSid = String(req.body?.callSid || "").trim();
      const clinicId = Number(req.body?.clinicId || 0);
      if (!callSid) return res.status(400).json({ error: "callSid is required." });
      if (!Number.isFinite(clinicId) || clinicId <= 0) return res.status(400).json({ error: "clinicId is required." });
      const ended = await endTwilioCall(callSid, clinicId);
      return res.status(200).json(ended);
    } catch (err) {
      return next(err);
    }
  }
};
