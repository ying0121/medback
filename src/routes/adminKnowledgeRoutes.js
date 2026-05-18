const express = require("express");
const {
  listKnowledge,
  createKnowledge,
  updateKnowledge,
  updateKnowledgeStatus,
  deleteKnowledge
} = require("../controllers/adminKnowledgeController");

const router = express.Router();

router.get("/", listKnowledge);
router.post("/", createKnowledge);
router.put("/:id", updateKnowledge);
router.patch("/:id/status", updateKnowledgeStatus);
router.delete("/:id", deleteKnowledge);

module.exports = router;
