const express = require("express");
const {
  getVoiceToken,
  voiceTwiml,
  voiceDialResultTwiml,
  inboundVoiceWebhook,
  inboundVoiceGather,
  messageTwiml,
  voiceFallbackTwiml,
  messageFallbackTwiml,
  messageStatusCallback,
  startCallSession,
  callStatusWebhook,
  stopCall,
  muteCall
} = require("../controllers/twilioController");

const router = express.Router();

// Browser Voice SDK — token + TwiML App webhook
router.get("/voice/token", getVoiceToken);
router.post("/voice/token", getVoiceToken);
router.post("/voice/twiml", voiceTwiml);
router.post("/voice/dial-result", voiceDialResultTwiml);
router.post("/voice/inbound", inboundVoiceWebhook);
router.post("/voice/inbound-gather", inboundVoiceGather);
router.post("/voice/fallback", voiceFallbackTwiml);
router.post("/message/twiml", messageTwiml);
router.post("/message/fallback", messageFallbackTwiml);
router.post("/message-status", messageStatusCallback);

// Call lifecycle
router.post("/call-status", callStatusWebhook);
router.post("/call/start", startCallSession);
router.post("/call/stop", stopCall);
router.post("/call/mute", muteCall);

module.exports = router;
