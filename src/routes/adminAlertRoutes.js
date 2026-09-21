const express = require("express");
const {
  listAlerts,
  getAlert,
  runAnalysis,
  deleteAlert,
  deleteAllAlerts,
  updateStatus,
  notifyEmail,
  notifyVoice
} = require("../controllers/adminAlertController");

const router = express.Router();

router.get("/", listAlerts);
router.post("/analyze", runAnalysis);
router.delete("/", deleteAllAlerts);
router.get("/:id", getAlert);
router.delete("/:id", deleteAlert);
router.patch("/:id/status", updateStatus);
router.post("/:id/notify-email", notifyEmail);
router.post("/:id/notify-voice", notifyVoice);

module.exports = router;
