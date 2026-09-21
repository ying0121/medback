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
  listAgentStudioCatalog,
  getAgentStudioTemplate,
  createAgentStudioTemplate,
  updateAgentStudioTemplate,
  deleteAgentStudioTemplate,
  generateAgentDraft,
  getAgentWorkingTimeHandler,
  previewAgentVoice,
  testAgent,
  testAgentOptions
} = require("../controllers/adminAgentController");

const router = express.Router();

router.get("/options/models", listAgentModels);
router.post("/options/models", listAgentModels);
router.get("/options/voices", listAgentVoices);
router.get("/options/links", listAgentLinkOptions);
router.get("/options/studio", listAgentStudioCatalog);
router.get("/options/templates/:templateId", getAgentStudioTemplate);
router.post("/options/templates", createAgentStudioTemplate);
router.put("/options/templates/:templateId", updateAgentStudioTemplate);
router.delete("/options/templates/:templateId", deleteAgentStudioTemplate);
router.post("/options/generate", generateAgentDraft);
router.post("/options/voice-preview", previewAgentVoice);
router.get("/options/test", testAgentOptions);
router.post("/test", testAgent);

router.get("/", listAgents);
router.get("/:id", getAgent);
router.get("/:id/working-time", getAgentWorkingTimeHandler);
router.post("/", createAgent);
router.put("/:id", updateAgent);
router.delete("/:id", deleteAgent);
router.post("/:id/voice-preview", previewAgentVoice);
router.get("/:id/test/options", testAgentOptions);
router.post("/:id/test", testAgent);

module.exports = router;
