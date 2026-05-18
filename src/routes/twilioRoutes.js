const express = require("express");
const {
  getVoiceToken,
  voiceTwiml,
  voiceDialResultTwiml,
  inboundVoiceWebhook,
  inboundVoiceStreamStatus,
  inboundVoiceFallbackTwiml,
  ttsPlaybackAudio,
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
router.get("/voice/tts/:token", ttsPlaybackAudio);
router.post("/voice/twiml", voiceTwiml);
router.post("/voice/dial-result", voiceDialResultTwiml);

// Inbound PSTN voice bot (live-streaming via Twilio Media Streams + Deepgram)
router.post("/voice/inbound", inboundVoiceWebhook);
router.post("/voice/stream-status", inboundVoiceStreamStatus);
router.post("/voice/inbound/fallback", inboundVoiceFallbackTwiml);
router.post("/voice/fallback", voiceFallbackTwiml);

// Messaging
router.post("/message/twiml", messageTwiml);
router.post("/message/fallback", messageFallbackTwiml);
router.post("/message-status", messageStatusCallback);

// Call lifecycle
router.post("/call-status", callStatusWebhook);
router.post("/call/start", startCallSession);
router.post("/call/stop", stopCall);
router.post("/call/mute", muteCall);

module.exports = router;
