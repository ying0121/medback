const express = require("express");
const {
  listClinics,
  createClinic,
  updateClinic,
  getClinicBotVoice,
  updateClinicBotVoice,
  getClinicTwilioConfig,
  updateClinicTwilioConfig,
  listClinicBotVoices,
  previewClinicBotVoice,
  listConversationsByClinic,
  listConversationMessages,
  getStats,
  syncClinicsFromExternalApi,
  listIncomingCalls,
  listIncomingCallMessages,
  deleteIncomingCall,
  deleteAllIncomingCalls,
  getClinicGreeting,
  updateClinicGreeting,
  previewClinicGreeting
} = require("../controllers/adminDashboardController");

const router = express.Router();

router.get("/stats", getStats);
router.get("/clinics", listClinics);
router.post("/clinics", createClinic);
router.patch("/clinics/:id", updateClinic);
router.get("/clinics/:id/bot-voice/voices", listClinicBotVoices);
router.get("/clinics/:id/bot-voice/preview", previewClinicBotVoice);
router.get("/clinics/:id/bot-voice", getClinicBotVoice);
router.patch("/clinics/:id/bot-voice", updateClinicBotVoice);
router.get("/clinics/:id/twilio", getClinicTwilioConfig);
router.patch("/clinics/:id/twilio", updateClinicTwilioConfig);
router.get("/clinics/:id/greeting", getClinicGreeting);
router.patch("/clinics/:id/greeting", updateClinicGreeting);
router.post("/clinics/:id/greeting/preview", previewClinicGreeting);
router.post("/clinics/sync-external", syncClinicsFromExternalApi);
router.get("/clinics/:clinicId/conversations", listConversationsByClinic);
router.get("/conversations/:conversationId/messages", listConversationMessages);
router.get("/calls", listIncomingCalls);
router.delete("/calls", deleteAllIncomingCalls);
router.get("/calls/:callId/messages", listIncomingCallMessages);
router.delete("/calls/:callId", deleteIncomingCall);

module.exports = router;
