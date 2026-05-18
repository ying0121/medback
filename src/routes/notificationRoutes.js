const express = require("express");
const { sendAlert } = require("../controllers/notificationController");

const router = express.Router();

router.post("/alert", sendAlert);

module.exports = router;
