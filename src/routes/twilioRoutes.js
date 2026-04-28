const express = require("express");
const {
  createVoiceToken,
  voiceConferenceTwiml,
  startCallSession,
  callStatusWebhook,
  stopCall,
  muteCall,
  voiceTwiml
} = require("../controllers/twilioController");

const router = express.Router();

router.post("/voice/token", createVoiceToken);
router.post("/voice/twiml", voiceConferenceTwiml);
router.get("/voice/twiml", voiceConferenceTwiml);
router.post("/call-status", callStatusWebhook);
router.post("/call/start", startCallSession);
router.post("/call/stop", stopCall);
router.post("/call/mute", muteCall);

// Backward-compatible plural aliases.
router.post("/calls/start", startCallSession);
router.post("/calls/stop", stopCall);
router.post("/calls/mute", muteCall);

// Alias endpoints to match standard Twilio sample flow.
router.post("/token", createVoiceToken);
router.post("/twiml/voice", voiceTwiml);
router.get("/twiml/voice", voiceTwiml);

module.exports = router;
