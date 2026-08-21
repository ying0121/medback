const { Op } = require("sequelize");
const { Knowledge, Clinic } = require("../db");
const {
  createKnowledgeSchema,
  updateKnowledgeSchema,
  updateKnowledgeStatusSchema
} = require("../utils/validators");
const {
  analyzeTrainingDocument,
  MAX_FILE_BYTES
} = require("../services/knowledgeDocumentService");

function toKnowledgeDto(row) {
  return {
    id: String(row.id),
    clinicId: String(row.clinicId),
    knowledge: row.knowledge || "",
    status: row.status || "active"
  };
}

async function listKnowledge(req, res, next) {
  try {
    const clinicId = req.query?.clinicId ? Number(req.query.clinicId) : null;
    const status = req.query?.status ? String(req.query.status) : null;
    const q = req.query?.q ? String(req.query.q).trim() : "";

    const where = {};
    if (clinicId) where.clinicId = clinicId;
    if (status === "active" || status === "inactive") where.status = status;
    if (q) where.knowledge = { [Op.like]: `%${q}%` };

    const rows = await Knowledge.findAll({
      where,
      order: [["id", "DESC"]]
    });
    return res.status(200).json({ items: rows.map(toKnowledgeDto) });
  } catch (err) {
    return next(err);
  }
}

async function createKnowledge(req, res, next) {
  try {
    const { value, error } = createKnowledgeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const created = await Knowledge.create({
      clinicId: value.clinicId,
      knowledge: value.knowledge.trim(),
      status: value.status
    });
    return res.status(201).json({ item: toKnowledgeDto(created) });
  } catch (err) {
    return next(err);
  }
}

async function updateKnowledge(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid knowledge id." });
    const { value, error } = updateKnowledgeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const row = await Knowledge.findByPk(id);
    if (!row) return res.status(404).json({ error: "Knowledge not found." });

    const patch = {
      ...(value.clinicId !== undefined ? { clinicId: value.clinicId } : {}),
      ...(value.knowledge !== undefined ? { knowledge: value.knowledge.trim() } : {}),
      ...(value.status !== undefined ? { status: value.status } : {})
    };

    await row.update(patch);
    return res.status(200).json({ item: toKnowledgeDto(row) });
  } catch (err) {
    return next(err);
  }
}

async function updateKnowledgeStatus(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid knowledge id." });
    const { value, error } = updateKnowledgeStatusSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const row = await Knowledge.findByPk(id);
    if (!row) return res.status(404).json({ error: "Knowledge not found." });
    await row.update({ status: value.status });
    return res.status(200).json({ item: toKnowledgeDto(row) });
  } catch (err) {
    return next(err);
  }
}

async function deleteKnowledge(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid knowledge id." });
    const deleted = await Knowledge.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: "Knowledge not found." });
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

async function analyzeKnowledgeDocument(req, res, next) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "A document file is required." });
    }
    if (file.size > MAX_FILE_BYTES) {
      return res.status(400).json({ error: "File is too large. Maximum size is 8 MB." });
    }

    const clinicId = Number(req.body?.clinicId || req.query?.clinicId || 0);
    let clinicName = String(req.body?.clinicName || "").trim();
    if (!clinicName && clinicId) {
      const clinic = await Clinic.findByPk(clinicId, { attributes: ["name"] });
      clinicName = clinic?.name ? String(clinic.name) : "";
    }

    const result = await analyzeTrainingDocument({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
      clinicName
    });

    return res.status(200).json({
      knowledge: result.knowledge,
      filename: result.filename,
      truncated: result.truncated,
      characterCount: result.characterCount
    });
  } catch (err) {
    const message = err?.message || "Failed to analyze document.";
    if (/unsupported|too large|empty|could not extract|legacy \.doc|missing openai/i.test(message)) {
      return res.status(400).json({ error: message });
    }
    return next(err);
  }
}

module.exports = {
  listKnowledge,
  createKnowledge,
  updateKnowledge,
  updateKnowledgeStatus,
  deleteKnowledge,
  analyzeKnowledgeDocument
};
