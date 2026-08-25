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
const {
  saveKnowledgeDocumentFile,
  resolveKnowledgeDocumentAbsolute,
  deleteKnowledgeDocumentFile
} = require("../services/knowledgeDocumentStorage");
const { labelForPromptKey } = require("../constants/defaultKnowledgePrompts");
const { parseClinicIds, rowMatchesClinic } = require("../utils/clinicIds");
const { resolveBusinessClinicIds } = require("../services/knowledgeClinicService");

function toKnowledgeDto(row) {
  const promptKey = row.promptKey || null;
  const clinicIds = parseClinicIds(
    Array.isArray(row.clinicIds) ? row.clinicIds : row.getDataValue?.("clinicIds")
  );
  return {
    id: String(row.id),
    clinicId: clinicIds[0] ? String(clinicIds[0]) : "",
    clinicIds: clinicIds.map(String),
    knowledge: row.knowledge || "",
    status: row.status || "active",
    promptKey,
    promptLabel: labelForPromptKey(promptKey),
    documentName: row.documentName || null,
    documentPath: row.documentPath || null,
    documentMime: row.documentMime || null,
    documentSize: row.documentSize != null ? Number(row.documentSize) : null
  };
}

function documentFieldsFromBody(value = {}) {
  const documentPath = value.documentPath ? String(value.documentPath).trim() : "";
  if (!documentPath) return null;
  if (!resolveKnowledgeDocumentAbsolute(documentPath)) {
    return { error: "Uploaded document file was not found. Please analyze the document again." };
  }
  return {
    documentPath,
    documentName: value.documentName ? String(value.documentName).trim().slice(0, 255) : null,
    documentMime: value.documentMime ? String(value.documentMime).trim().slice(0, 128) : null,
    documentSize:
      value.documentSize != null && Number.isFinite(Number(value.documentSize))
        ? Number(value.documentSize)
        : null
  };
}

async function listKnowledge(req, res, next) {
  try {
    const clinicIdRaw = req.query?.clinicId ? Number(req.query.clinicId) : null;
    const status = req.query?.status ? String(req.query.status) : null;
    const q = req.query?.q ? String(req.query.q).trim() : "";

    const where = {};
    if (status === "active" || status === "inactive") where.status = status;
    if (q) where.knowledge = { [Op.like]: `%${q}%` };

    let rows = await Knowledge.findAll({
      where,
      order: [["id", "DESC"]]
    });

    if (clinicIdRaw) {
      const businessIds = await resolveBusinessClinicIds([clinicIdRaw]);
      const target = businessIds[0] || clinicIdRaw;
      rows = rows.filter((row) => rowMatchesClinic(row, target));
    }

    return res.status(200).json({ items: rows.map(toKnowledgeDto) });
  } catch (err) {
    return next(err);
  }
}

async function createKnowledge(req, res, next) {
  try {
    const { value, error } = createKnowledgeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const businessIds = await resolveBusinessClinicIds(value.clinicIds);
    if (!businessIds.length) {
      return res.status(400).json({ error: "At least one valid clinic is required." });
    }

    const doc = documentFieldsFromBody(value);
    if (doc?.error) return res.status(400).json({ error: doc.error });

    const created = await Knowledge.create({
      clinicIds: businessIds,
      knowledge: value.knowledge.trim(),
      status: value.status,
      promptKey: null,
      ...(doc
        ? {
            documentName: doc.documentName,
            documentPath: doc.documentPath,
            documentMime: doc.documentMime,
            documentSize: doc.documentSize
          }
        : {})
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

    const rawClinicIds = Array.isArray(value.clinicIds)
      ? value.clinicIds
      : value.clinicId
        ? [value.clinicId]
        : null;

    const patch = {};
    if (value.knowledge !== undefined) patch.knowledge = value.knowledge.trim();
    if (value.status !== undefined) patch.status = value.status;

    if (rawClinicIds) {
      const businessIds = await resolveBusinessClinicIds(rawClinicIds);
      if (!businessIds.length) {
        return res.status(400).json({ error: "At least one valid clinic is required." });
      }
      patch.clinicIds = businessIds;
    }

    if (value.documentPath !== undefined) {
      if (!value.documentPath) {
        if (row.documentPath) deleteKnowledgeDocumentFile(row.documentPath);
        patch.documentName = null;
        patch.documentPath = null;
        patch.documentMime = null;
        patch.documentSize = null;
      } else {
        const doc = documentFieldsFromBody(value);
        if (doc?.error) return res.status(400).json({ error: doc.error });
        if (row.documentPath && row.documentPath !== doc.documentPath) {
          deleteKnowledgeDocumentFile(row.documentPath);
        }
        Object.assign(patch, doc);
      }
    }

    await row.update(patch);
    await row.reload();
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
    await row.reload();
    return res.status(200).json({ item: toKnowledgeDto(row) });
  } catch (err) {
    return next(err);
  }
}

async function deleteKnowledge(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid knowledge id." });
    const row = await Knowledge.findByPk(id);
    if (!row) return res.status(404).json({ error: "Knowledge not found." });
    if (row.documentPath) deleteKnowledgeDocumentFile(row.documentPath);
    await row.destroy();
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
      const businessIds = await resolveBusinessClinicIds([clinicId]);
      const clinic = await Clinic.findOne({
        where: businessIds.length
          ? { [Op.or]: [{ id: clinicId }, { clinicId: { [Op.in]: businessIds } }] }
          : { id: clinicId },
        attributes: ["name"]
      });
      clinicName = clinic?.name ? String(clinic.name) : "";
    }

    const saved = saveKnowledgeDocumentFile({
      buffer: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype
    });

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
      characterCount: result.characterCount,
      documentName: saved.documentName,
      documentPath: saved.documentPath,
      documentMime: saved.documentMime,
      documentSize: saved.documentSize
    });
  } catch (err) {
    const message = err?.message || "Failed to analyze document.";
    if (/unsupported|too large|empty|could not extract|legacy \.doc|missing openai/i.test(message)) {
      return res.status(400).json({ error: message });
    }
    return next(err);
  }
}

async function downloadKnowledgeDocument(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid knowledge id." });
    const row = await Knowledge.findByPk(id);
    if (!row || !row.documentPath) {
      return res.status(404).json({ error: "Document not found." });
    }
    const absolute = resolveKnowledgeDocumentAbsolute(row.documentPath);
    if (!absolute) return res.status(404).json({ error: "Document file missing on server." });

    return res.download(absolute, row.documentName || "knowledge-document");
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listKnowledge,
  createKnowledge,
  updateKnowledge,
  updateKnowledgeStatus,
  deleteKnowledge,
  analyzeKnowledgeDocument,
  downloadKnowledgeDocument
};
