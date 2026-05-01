const express = require("express");
const {
  listClinics,
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
router.post("/clinics/sync-external", syncClinicsFromExternalApi);
router.get("/clinics/:clinicId/conversations", listConversationsByClinic);
router.get("/conversations/:conversationId/messages", listConversationMessages);
router.get("/calls", listIncomingCalls);
router.get("/calls/:callId/messages", listIncomingCallMessages);

module.exports = router;
