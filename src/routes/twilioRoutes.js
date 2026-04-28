const express = require("express");
const {
  getVoiceToken,
  voiceTwiml,
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

// Call lifecycle
router.post("/call-status", callStatusWebhook);
router.post("/call/start", startCallSession);
router.post("/call/stop", stopCall);
router.post("/call/mute", muteCall);

module.exports = router;
