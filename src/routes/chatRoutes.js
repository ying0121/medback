const express = require("express");
const {
  startConversation,
  sendMessage,
  getConversationMessages,
  getCallStatus,
  endCall
} = require("../controllers/chatController");

const router = express.Router();

router.post("/conversation/start", startConversation);
router.post("/message", sendMessage);
router.get("/conversation/:conversationId/messages", getConversationMessages);
router.get("/call/:callSid/status", getCallStatus);
router.post("/end-call", endCall);

module.exports = router;
