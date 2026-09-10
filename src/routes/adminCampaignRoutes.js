const express = require("express");
const multer = require("multer");
const {
  listCampaigns,
  getCampaign,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  pauseCampaign,
  resumeCampaign,
  analyzeImportFile,
  previewImportMapping,
  confirmImportMapped,
  importContactsFromExcel,
  syncContactsFromExternalApi,
  deleteContact,
  getContactCallHistory,
  getContactCallHistoryItem,
  reanalyzeContactCallHistory
} = require("../controllers/adminCampaignController");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});

router.get("/", listCampaigns);
router.get("/:id", getCampaign);
router.post("/", createCampaign);
router.put("/:id", updateCampaign);
router.post("/:id/pause", pauseCampaign);
router.post("/:id/resume", resumeCampaign);
router.delete("/:id", deleteCampaign);
router.post("/:id/import/analyze", upload.single("file"), analyzeImportFile);
router.post("/:id/import/preview", previewImportMapping);
router.post("/:id/import/confirm", confirmImportMapped);
router.post("/:id/import", upload.single("file"), importContactsFromExcel);
router.post("/:id/sync-external", syncContactsFromExternalApi);
router.get("/:id/contacts/:contactId/history", getContactCallHistory);
router.get("/:id/contacts/:contactId/history/:historyId", getContactCallHistoryItem);
router.post("/:id/contacts/:contactId/history/:historyId/reanalyze", reanalyzeContactCallHistory);
router.delete("/:id/contacts/:contactId", deleteContact);

module.exports = router;
