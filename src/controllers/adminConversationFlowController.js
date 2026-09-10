const { Op } = require("sequelize");
const { ConversationFlow, Clinic } = require("../db");
const { createDefaultFlowGraph, normalizeGraph } = require("../services/conversationFlowGraph");
const { parseClinicIds, rowMatchesClinic } = require("../utils/clinicIds");
const { resolveBusinessClinicIds } = require("../services/knowledgeClinicService");

function toIsoOrNull(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function toFlowDto(row) {
  const clinicIds = parseClinicIds(
    Array.isArray(row.clinicIds) ? row.clinicIds : row.getDataValue?.("clinicIds")
  );
  return {
    id: String(row.id),
    clinicId: clinicIds[0] ? String(clinicIds[0]) : "",
    clinicIds: clinicIds.map(String),
    name: row.name || "",
    description: row.description || "",
    graph: row.graph || createDefaultFlowGraph(),
    status: row.status || "active",
    createdAt: toIsoOrNull(row.createdAt ?? row.getDataValue?.("createdAt")),
    updatedAt: toIsoOrNull(row.updatedAt ?? row.getDataValue?.("updatedAt"))
  };
}

async function resolveClinicIdsFromBody(body) {
  const raw =
    body.clinicIds != null
      ? body.clinicIds
      : body.clinicId != null
        ? [body.clinicId]
        : [];
  const businessIds = await resolveBusinessClinicIds(raw);
  return businessIds;
}

async function listFlows(req, res, next) {
  try {
    const clinicIdRaw = req.query?.clinicId ? Number(req.query.clinicId) : null;
    const status = req.query?.status ? String(req.query.status) : null;
    const q = req.query?.q ? String(req.query.q).trim() : "";

    const where = {};
    if (status === "active" || status === "inactive") where.status = status;
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } }
      ];
    }

    let rows = await ConversationFlow.findAll({
      where,
      order: [["id", "DESC"]]
    });

    if (clinicIdRaw && Number.isFinite(clinicIdRaw)) {
      const businessIds = await resolveBusinessClinicIds([clinicIdRaw]);
      const target = businessIds[0] || clinicIdRaw;
      rows = rows.filter((row) => rowMatchesClinic(row, target));
    }

    return res.status(200).json({ items: rows.map(toFlowDto) });
  } catch (err) {
    return next(err);
  }
}

async function getFlow(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid flow id." });

    const row = await ConversationFlow.findByPk(id);
    if (!row) return res.status(404).json({ error: "Conversation flow not found." });

    return res.status(200).json({ item: toFlowDto(row) });
  } catch (err) {
    return next(err);
  }
}

async function createFlow(req, res, next) {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const description = body.description != null ? String(body.description).trim() : "";
    const status = body.status === "inactive" ? "inactive" : "active";

    if (!name) return res.status(400).json({ error: "Name is required." });

    const businessIds = await resolveClinicIdsFromBody(body);
    if (!businessIds.length) {
      return res.status(400).json({ error: "Select at least one clinic." });
    }

    const clinics = await Clinic.findAll({ where: { id: { [Op.in]: businessIds } } });
    if (!clinics.length) return res.status(400).json({ error: "No valid clinics found." });

    const graph = normalizeGraph(body.graph || createDefaultFlowGraph());

    const created = await ConversationFlow.create({
      clinicIds: businessIds,
      name,
      description: description || null,
      graph,
      status
    });

    return res.status(201).json({ item: toFlowDto(created) });
  } catch (err) {
    return next(err);
  }
}

async function updateFlow(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid flow id." });

    const row = await ConversationFlow.findByPk(id);
    if (!row) return res.status(404).json({ error: "Conversation flow not found." });

    const body = req.body || {};

    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name) return res.status(400).json({ error: "Name is required." });
      row.name = name;
    }
    if (body.description != null) {
      row.description = String(body.description).trim() || null;
    }
    if (body.clinicIds != null || body.clinicId != null) {
      const businessIds = await resolveClinicIdsFromBody(body);
      if (!businessIds.length) {
        return res.status(400).json({ error: "Select at least one clinic." });
      }
      const clinics = await Clinic.findAll({ where: { id: { [Op.in]: businessIds } } });
      if (!clinics.length) return res.status(400).json({ error: "No valid clinics found." });
      row.clinicIds = businessIds;
    }
    if (body.status === "active" || body.status === "inactive") {
      row.status = body.status;
    }
    if (body.graph != null) {
      row.graph = normalizeGraph(body.graph);
    }

    await row.save();
    return res.status(200).json({ item: toFlowDto(row) });
  } catch (err) {
    return next(err);
  }
}

async function deleteFlow(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid flow id." });

    const row = await ConversationFlow.findByPk(id);
    if (!row) return res.status(404).json({ error: "Conversation flow not found." });

    await row.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listFlows,
  getFlow,
  createFlow,
  updateFlow,
  deleteFlow
};
