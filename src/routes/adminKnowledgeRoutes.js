const express = require("express");
const multer = require("multer");
const {
  listKnowledge,
  createKnowledge,
  updateKnowledge,
  updateKnowledgeStatus,
  deleteKnowledge,
  analyzeKnowledgeDocument
} = require("../controllers/adminKnowledgeController");
const { MAX_FILE_BYTES } = require("../services/knowledgeDocumentService");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 1 }
});

router.get("/", listKnowledge);
router.post("/", createKnowledge);
router.post("/analyze", upload.single("file"), analyzeKnowledgeDocument);
router.put("/:id", updateKnowledge);
router.patch("/:id/status", updateKnowledgeStatus);
router.delete("/:id", deleteKnowledge);

module.exports = router;
