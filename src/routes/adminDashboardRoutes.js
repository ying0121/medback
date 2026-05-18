const express = require("express");
const {
  listClinics,
  getClinicElevenLabsConfig,
  updateClinicElevenLabsApiKey,
  getClinicTwilioConfig,
  updateClinicTwilioConfig,
  listClinicElevenLabsVoices,
  previewClinicElevenLabsVoice,
  streamElevenLabsPreviewSource,
  listConversationsByClinic,
  listConversationMessages,
  getStats,
  syncClinicsFromExternalApi,
  listIncomingCalls,
  listIncomingCallMessages
} = require("../controllers/adminDashboardController");

const router = express.Router();

router.get("/stats", getStats);
router.get("/clinics", listClinics);
router.get("/clinics/:id/elevenlabs/voices", listClinicElevenLabsVoices);
router.get("/clinics/:id/elevenlabs/preview", previewClinicElevenLabsVoice);
router.get("/clinics/:id/elevenlabs/preview-source", streamElevenLabsPreviewSource);
router.get("/clinics/:id/elevenlabs", getClinicElevenLabsConfig);
router.patch("/clinics/:id/elevenlabs", updateClinicElevenLabsApiKey);
router.get("/clinics/:id/twilio", getClinicTwilioConfig);
router.patch("/clinics/:id/twilio", updateClinicTwilioConfig);
router.post("/clinics/sync-external", syncClinicsFromExternalApi);
router.get("/clinics/:clinicId/conversations", listConversationsByClinic);
router.get("/conversations/:conversationId/messages", listConversationMessages);
router.get("/calls", listIncomingCalls);
router.get("/calls/:callId/messages", listIncomingCallMessages);

module.exports = router;
