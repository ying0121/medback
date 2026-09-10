const express = require("express");
const {
  listFlows,
  getFlow,
  createFlow,
  updateFlow,
  deleteFlow
} = require("../controllers/adminConversationFlowController");
const { listFlowSubagentTools } = require("../constants/flowSubagentTools");

const router = express.Router();

router.get("/tools", (req, res) => {
  res.status(200).json({ tools: listFlowSubagentTools() });
});

router.get("/", listFlows);
router.get("/:id", getFlow);
router.post("/", createFlow);
router.put("/:id", updateFlow);
router.delete("/:id", deleteFlow);

module.exports = router;
