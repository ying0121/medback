const express = require("express");
const {
  listClinics,
  listConversationsByClinic,
  listConversationMessages,
  getStats,
  syncClinicsFromExternalApi
} = require("../controllers/adminDashboardController");

const router = express.Router();

router.get("/stats", getStats);
router.get("/clinics", listClinics);
router.post("/clinics/sync-external", syncClinicsFromExternalApi);
router.get("/clinics/:clinicId/conversations", listConversationsByClinic);
router.get("/conversations/:conversationId/messages", listConversationMessages);

module.exports = router;
