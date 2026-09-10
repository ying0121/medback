const express = require("express");
const {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  listAgentModels,
  listAgentVoices,
  listAgentLinkOptions,
  previewAgentVoice,
  testAgent
} = require("../controllers/adminAgentController");

const router = express.Router();

router.get("/options/models", listAgentModels);
router.post("/options/models", listAgentModels);
router.get("/options/voices", listAgentVoices);
router.get("/options/links", listAgentLinkOptions);
router.post("/options/voice-preview", previewAgentVoice);
router.post("/test", testAgent);

router.get("/", listAgents);
router.get("/:id", getAgent);
router.post("/", createAgent);
router.put("/:id", updateAgent);
router.delete("/:id", deleteAgent);
router.post("/:id/voice-preview", previewAgentVoice);
router.post("/:id/test", testAgent);

module.exports = router;
