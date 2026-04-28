const express = require("express");
const {
  listClinics,
  listConversationsByClinic,
  listConversationMessages,
  getStats
} = require("../controllers/adminDashboardController");

const router = express.Router();

router.get("/stats", getStats);
router.get("/clinics", listClinics);
router.get("/clinics/:clinicId/conversations", listConversationsByClinic);
router.get("/conversations/:conversationId/messages", listConversationMessages);

module.exports = router;
