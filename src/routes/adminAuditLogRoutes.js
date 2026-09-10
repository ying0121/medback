const express = require("express");
const { listAuditLogs, clearAuditLogs } = require("../controllers/adminAuditLogController");

const router = express.Router();

router.get("/", listAuditLogs);
router.delete("/", clearAuditLogs);

module.exports = router;
