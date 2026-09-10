const { Op } = require("sequelize");
const axios = require("axios");
const { Campaign, CampaignContact, ConversationFlow, Clinic } = require("../db");
const {
  analyzePatientWorkbook,
  buildImportPreview,
  formatDob
} = require("../services/campaignPatientImport");

function toContactDto(row) {
  const first = row.patientFirstName || "";
  const last = row.patientLastName || "";
  const full =
    row.patientName ||
    [first, last].filter(Boolean).join(" ").trim() ||
    "";
  return {
    id: String(row.id),
    campaignId: String(row.campaignId),
    patientFirstName: first,
    patientLastName: last,
    patientName: full,
    patientPhone: row.patientPhone || "",
    patientEmail: row.patientEmail || null,
    patientDob: row.patientDob || null,
    patientLanguage: row.patientLanguage || null,
    patientMemberNumber: row.patientMemberNumber || null,
    extra: row.extra || {},
    status: row.status || "pending",
    attemptCount: Number(row.attemptCount) || 0,
    lastCallAt: toIsoOrNull(row.lastCallAt),
    lastAnalysisSummary: row.lastAnalysisSummary || null,
    lastError: row.lastError || null,
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt)
  };
}

function toIsoOrNull(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseScheduledAt(value) {
  if (value == null || value === "") return { value: null, error: null };
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return { value: null, error: "Invalid scheduled date/time." };
  return { value: d, error: null };
}

function parseRetryCount(value, fallback = 3) {
  if (value == null || value === "") return { value: fallback, error: null };
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 20 || !Number.isInteger(n)) {
    return { value: null, error: "Retry count must be an integer between 0 and 20." };
  }
  return { value: n, error: null };
}

function toCampaignDto(row, extras = {}) {
  return {
    id: String(row.id),
    clinicId: String(row.clinicId),
    flowId: String(row.flowId),
    name: row.name || "",
    description: row.description || "",
    status: row.status || "draft",
    scheduledAt: toIsoOrNull(row.scheduledAt),
    retryCount: Number(row.retryCount) || 0,
    externalSource: row.externalSource || null,
    createdAt: toIsoOrNull(row.createdAt),
    updatedAt: toIsoOrNull(row.updatedAt),
    ...extras
  };
}

async function contactCountsForCampaignIds(campaignIds) {
  if (!campaignIds.length) return {};
  const rows = await CampaignContact.findAll({
    attributes: [
      "campaignId",
      "status",
      [CampaignContact.sequelize.fn("COUNT", CampaignContact.sequelize.col("id")), "count"]
    ],
    where: { campaignId: { [Op.in]: campaignIds } },
    group: ["campaignId", "status"],
    raw: true
  });

  const map = {};
  for (const id of campaignIds) {
    map[id] = {
      total: 0,
      pending: 0,
      calling: 0,
      success: 0,
      reject: 0,
      interesting: 0,
      not_interesting: 0,
      // legacy aliases kept for older UI briefly
      completed: 0,
      failed: 0,
      queued: 0,
      skipped: 0
    };
  }
  for (const row of rows) {
    const id = Number(row.campaignId);
    const count = Number(row.count) || 0;
    if (!map[id]) continue;
    map[id].total += count;
    const status = String(row.status || "");
    if (map[id][status] != null) map[id][status] += count;
    if (status === "success") map[id].completed += count;
    if (status === "reject") map[id].failed += count;
  }
  return map;
}

async function listCampaigns(req, res, next) {
  try {
    const clinicId = req.query?.clinicId ? Number(req.query.clinicId) : null;
    const status = req.query?.status ? String(req.query.status) : null;
    const q = req.query?.q ? String(req.query.q).trim() : "";

    const where = {};
    if (clinicId && Number.isFinite(clinicId)) where.clinicId = clinicId;
    if (status && ["draft", "ready", "running", "paused", "completed"].includes(status)) {
      where.status = status;
    }
    if (q) {
      where[Op.or] = [
        { name: { [Op.like]: `%${q}%` } },
        { description: { [Op.like]: `%${q}%` } }
      ];
    }

    const rows = await Campaign.findAll({ where, order: [["id", "DESC"]] });
    const counts = await contactCountsForCampaignIds(rows.map((r) => r.id));

    return res.status(200).json({
      items: rows.map((row) =>
        toCampaignDto(row, {
          contactCounts: counts[row.id] || { total: 0, pending: 0, completed: 0, failed: 0 }
        })
      )
    });
  } catch (err) {
    return next(err);
  }
}

async function getCampaign(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id." });

    const row = await Campaign.findByPk(id);
    if (!row) return res.status(404).json({ error: "Campaign not found." });

    const contacts = await CampaignContact.findAll({
      where: { campaignId: id },
      order: [["id", "ASC"]]
    });
    const counts = await contactCountsForCampaignIds([id]);

    return res.status(200).json({
      item: toCampaignDto(row, { contactCounts: counts[id] }),
      contacts: contacts.map(toContactDto)
    });
  } catch (err) {
    return next(err);
  }
}

async function assertClinicAndFlow(clinicId, flowId) {
  const clinic = await Clinic.findByPk(clinicId);
  if (!clinic) return { error: "Clinic not found." };

  const flow = await ConversationFlow.findByPk(flowId);
  if (!flow) return { error: "Conversation flow not found." };

  const { parseClinicIds } = require("../utils/clinicIds");
  let flowClinicIds = parseClinicIds(
    Array.isArray(flow.clinicIds) ? flow.clinicIds : flow.getDataValue?.("clinicIds")
  );
  // Legacy single clinic_id fallback
  const legacyId = Number(flow.getDataValue?.("clinicId"));
  if (!flowClinicIds.length && Number.isFinite(legacyId) && legacyId > 0) {
    flowClinicIds = [legacyId];
  }
  if (!flowClinicIds.includes(Number(clinicId))) {
    return { error: "Conversation flow must belong to the same clinic." };
  }
  return { clinic, flow };
}

async function createCampaign(req, res, next) {
  try {
    const body = req.body || {};
    const name = String(body.name || "").trim();
    const clinicId = Number(body.clinicId);
    const flowId = Number(body.flowId);
    const description = body.description != null ? String(body.description).trim() : "";
    // Status is managed automatically (draft → ready on import → running/paused by dialer controls).
    const status = "draft";

    if (!name) return res.status(400).json({ error: "Name is required." });
    if (!Number.isFinite(clinicId) || clinicId <= 0) {
      return res.status(400).json({ error: "Valid clinicId is required." });
    }
    if (!Number.isFinite(flowId) || flowId <= 0) {
      return res.status(400).json({ error: "Valid flowId is required." });
    }

    const scheduled = parseScheduledAt(body.scheduledAt);
    if (scheduled.error) return res.status(400).json({ error: scheduled.error });
    if (!scheduled.value) {
      return res.status(400).json({ error: "Scheduled start date/time is required." });
    }

    const retry = parseRetryCount(body.retryCount, 3);
    if (retry.error) return res.status(400).json({ error: retry.error });

    const check = await assertClinicAndFlow(clinicId, flowId);
    if (check.error) return res.status(400).json({ error: check.error });

    const created = await Campaign.create({
      clinicId,
      flowId,
      name,
      description: description || null,
      status,
      scheduledAt: scheduled.value,
      retryCount: retry.value,
      externalSource: body.externalSource ? String(body.externalSource).trim() : null
    });

    return res.status(201).json({ item: toCampaignDto(created, { contactCounts: { total: 0 } }) });
  } catch (err) {
    return next(err);
  }
}

async function updateCampaign(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id." });

    const row = await Campaign.findByPk(id);
    if (!row) return res.status(404).json({ error: "Campaign not found." });

    const body = req.body || {};

    if (body.name != null) {
      const name = String(body.name).trim();
      if (!name) return res.status(400).json({ error: "Name is required." });
      row.name = name;
    }
    if (body.description != null) {
      row.description = String(body.description).trim() || null;
    }
    // Status is automatic — only pause/resume endpoints change running ↔ paused.

    if (body.scheduledAt !== undefined) {
      const scheduled = parseScheduledAt(body.scheduledAt);
      if (scheduled.error) return res.status(400).json({ error: scheduled.error });
      if (!scheduled.value) {
        return res.status(400).json({ error: "Scheduled start date/time is required." });
      }
      row.scheduledAt = scheduled.value;
    }

    if (body.retryCount !== undefined) {
      const retry = parseRetryCount(body.retryCount, row.retryCount ?? 3);
      if (retry.error) return res.status(400).json({ error: retry.error });
      row.retryCount = retry.value;
    }

    const nextClinicId = body.clinicId != null ? Number(body.clinicId) : row.clinicId;
    const nextFlowId = body.flowId != null ? Number(body.flowId) : row.flowId;

    if (body.clinicId != null || body.flowId != null) {
      if (!Number.isFinite(nextClinicId) || !Number.isFinite(nextFlowId)) {
        return res.status(400).json({ error: "Valid clinicId and flowId are required." });
      }
      const check = await assertClinicAndFlow(nextClinicId, nextFlowId);
      if (check.error) return res.status(400).json({ error: check.error });
      row.clinicId = nextClinicId;
      row.flowId = nextFlowId;
    }

    if (body.externalSource !== undefined) {
      row.externalSource = body.externalSource ? String(body.externalSource).trim() : null;
    }

    await row.save();
    const counts = await contactCountsForCampaignIds([id]);
    return res.status(200).json({ item: toCampaignDto(row, { contactCounts: counts[id] }) });
  } catch (err) {
    return next(err);
  }
}

async function pauseCampaign(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id." });

    const row = await Campaign.findByPk(id);
    if (!row) return res.status(404).json({ error: "Campaign not found." });

    if (row.status !== "running") {
      return res.status(400).json({ error: "Only a running campaign can be stopped." });
    }

    row.status = "paused";
    await row.save();
    const counts = await contactCountsForCampaignIds([id]);
    return res.status(200).json({ item: toCampaignDto(row, { contactCounts: counts[id] }) });
  } catch (err) {
    return next(err);
  }
}

async function resumeCampaign(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id." });

    const row = await Campaign.findByPk(id);
    if (!row) return res.status(404).json({ error: "Campaign not found." });

    if (row.status !== "paused") {
      return res.status(400).json({ error: "Only a paused campaign can be resumed." });
    }

    row.status = "running";
    await row.save();
    const counts = await contactCountsForCampaignIds([id]);
    return res.status(200).json({ item: toCampaignDto(row, { contactCounts: counts[id] }) });
  } catch (err) {
    return next(err);
  }
}

async function deleteCampaign(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id." });

    const row = await Campaign.findByPk(id);
    if (!row) return res.status(404).json({ error: "Campaign not found." });

    await CampaignContact.destroy({ where: { campaignId: id } });
    await row.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

async function analyzeImportFile(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id." });

    const campaign = await Campaign.findByPk(id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    if (!req.file?.buffer) {
      return res.status(400).json({ error: "Excel file is required (.xlsx, .xls, or .csv)." });
    }

    const analyzed = analyzePatientWorkbook(req.file.buffer);
    if (analyzed.error) {
      return res.status(400).json({ error: analyzed.error });
    }

    const existing = await CampaignContact.findAll({
      where: { campaignId: id },
      attributes: ["patientPhone"]
    });
    const existingPhones = existing.map((c) => c.patientPhone);

    const preview = buildImportPreview(
      analyzed.rows,
      analyzed.suggestedMapping,
      existingPhones
    );

    return res.status(200).json({
      columns: analyzed.columns,
      fields: analyzed.fields,
      suggestedMapping: analyzed.suggestedMapping,
      previewRows: analyzed.previewRows,
      rows: analyzed.rows,
      totalRows: analyzed.totalRows,
      existingContactCount: existing.length,
      analysis: {
        valid: preview.valid,
        invalid: preview.invalid,
        duplicatesInFile: preview.duplicatesInFileCount,
        duplicatesExisting: preview.duplicatesExistingCount,
        willImport: preview.willImport,
        errors: preview.errors,
        uniqueSample: preview.uniqueSample,
        duplicateInFileSample: preview.duplicateInFileSample,
        duplicateExistingSample: preview.duplicateExistingSample
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function previewImportMapping(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id." });

    const campaign = await Campaign.findByPk(id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    const mapping = req.body?.mapping || {};
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: "No rows to preview." });

    const existing = await CampaignContact.findAll({
      where: { campaignId: id },
      attributes: ["patientPhone"]
    });
    const preview = buildImportPreview(
      rows,
      mapping,
      existing.map((c) => c.patientPhone)
    );

    return res.status(200).json({
      analysis: {
        valid: preview.valid,
        invalid: preview.invalid,
        duplicatesInFile: preview.duplicatesInFileCount,
        duplicatesExisting: preview.duplicatesExistingCount,
        willImport: preview.willImport,
        errors: preview.errors,
        uniqueSample: preview.uniqueSample,
        duplicateInFileSample: preview.duplicateInFileSample,
        duplicateExistingSample: preview.duplicateExistingSample
      }
    });
  } catch (err) {
    return next(err);
  }
}

async function confirmImportMapped(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id." });

    const campaign = await Campaign.findByPk(id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    const mapping = req.body?.mapping || {};
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    const replace = Boolean(req.body?.replace);
    const skipFileDuplicates = req.body?.skipFileDuplicates !== false;
    const skipExistingDuplicates = req.body?.skipExistingDuplicates !== false;

    if (!rows.length) return res.status(400).json({ error: "No rows to import." });

    const existing = await CampaignContact.findAll({
      where: { campaignId: id },
      attributes: ["patientPhone"]
    });
    const preview = buildImportPreview(
      rows,
      mapping,
      existing.map((c) => c.patientPhone)
    );

    let toCreate = [...preview.unique];
    if (!skipFileDuplicates) toCreate = toCreate.concat(preview.duplicatesInFile);
    if (!skipExistingDuplicates) toCreate = toCreate.concat(preview.duplicatesExisting);

    if (!toCreate.length) {
      return res.status(400).json({
        error: "No patients to import after mapping and duplicate checks.",
        analysis: {
          valid: preview.valid,
          invalid: preview.invalid,
          duplicatesInFile: preview.duplicatesInFileCount,
          duplicatesExisting: preview.duplicatesExistingCount,
          willImport: 0,
          errors: preview.errors
        }
      });
    }

    if (replace) {
      await CampaignContact.destroy({ where: { campaignId: id } });
    }

    const created = await CampaignContact.bulkCreate(
      toCreate.map((c) => ({
        campaignId: id,
        patientFirstName: c.patientFirstName,
        patientLastName: c.patientLastName,
        patientName: c.patientName,
        patientPhone: c.patientPhone,
        patientDob: c.patientDob,
        patientLanguage: c.patientLanguage,
        patientMemberNumber: c.patientMemberNumber,
        patientEmail: c.patientEmail,
        extra: c.extra,
        status: "pending"
      }))
    );

    if (campaign.status === "draft") {
      campaign.status = "ready";
      await campaign.save();
    }

    const counts = await contactCountsForCampaignIds([id]);
    const allContacts = await CampaignContact.findAll({
      where: { campaignId: id },
      order: [["id", "ASC"]]
    });

    return res.status(200).json({
      item: toCampaignDto(campaign, { contactCounts: counts[id] }),
      imported: created.length,
      skippedInvalid: preview.invalid,
      skippedFileDuplicates: skipFileDuplicates ? preview.duplicatesInFileCount : 0,
      skippedExistingDuplicates: skipExistingDuplicates ? preview.duplicatesExistingCount : 0,
      analysis: {
        valid: preview.valid,
        invalid: preview.invalid,
        duplicatesInFile: preview.duplicatesInFileCount,
        duplicatesExisting: preview.duplicatesExistingCount,
        willImport: created.length,
        errors: preview.errors
      },
      contacts: allContacts.map(toContactDto)
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * Legacy one-shot import kept for compatibility — prefers analyze + confirm flow.
 */
async function importContactsFromExcel(req, res, next) {
  try {
    req.body = req.body || {};
    // Fall back to analyze → auto-confirm with suggested mapping
    if (!req.file?.buffer) {
      return res.status(400).json({ error: "Excel file is required (.xlsx, .xls, or .csv)." });
    }
    const id = Number(req.params.id);
    const analyzed = analyzePatientWorkbook(req.file.buffer);
    if (analyzed.error) return res.status(400).json({ error: analyzed.error });

    req.body.mapping = analyzed.suggestedMapping;
    req.body.rows = analyzed.rows;
    req.body.replace = String(req.query.replace || req.body?.replace || "") === "1";
    return confirmImportMapped(req, res, next);
  } catch (err) {
    return next(err);
  }
}

/**
 * Pull patients from an external URL (GET or POST).
 * Body may include:
 *  - url, method ("GET"|"POST"), token, body (POST JSON), listPath, mapping, replace
 * Mapping values are response field / nested path names (e.g. "first_name", "patient.phone").
 */
async function syncContactsFromExternalApi(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid campaign id." });

    const campaign = await Campaign.findByPk(id);
    if (!campaign) return res.status(404).json({ error: "Campaign not found." });

    const url = String(req.body?.url || process.env.CAMPAIGN_PATIENT_API_URL || "").trim();
    if (!url) {
      return res.status(400).json({
        error:
          "External patient API URL is not configured. Pass body.url or set CAMPAIGN_PATIENT_API_URL."
      });
    }

    const methodRaw = String(req.body?.method || "GET").trim().toUpperCase();
    const method = methodRaw === "POST" ? "POST" : "GET";
    const replace = Boolean(req.body?.replace);
    const listPath = String(req.body?.listPath || "").trim();
    const mappingIn = req.body?.mapping && typeof req.body.mapping === "object" ? req.body.mapping : {};

    const mapping = {
      firstName: String(mappingIn.firstName || "firstName").trim() || "firstName",
      lastName: String(mappingIn.lastName || "lastName").trim() || "lastName",
      dob: String(mappingIn.dob || "dob").trim() || "dob",
      phone: String(mappingIn.phone || "phone").trim() || "phone",
      language: String(mappingIn.language || "language").trim() || "language",
      memberNumber: String(mappingIn.memberNumber || "memberNumber").trim() || "memberNumber"
    };

    const headers = {
      Accept: "application/json",
      ...(req.body?.token ? { Authorization: `Bearer ${String(req.body.token)}` } : {}),
      ...(method === "POST" ? { "Content-Type": "application/json" } : {})
    };

    const axiosConfig = {
      timeout: 30000,
      headers,
      validateStatus: () => true
    };

    const response =
      method === "POST"
        ? await axios.post(url, req.body?.body != null ? req.body.body : {}, axiosConfig)
        : await axios.get(url, axiosConfig);

    if (response.status < 200 || response.status >= 300) {
      return res.status(502).json({
        error: `External API failed with status ${response.status}.`
      });
    }

    const payload = response.data;
    let list = [];
    if (Array.isArray(payload)) {
      list = payload;
    } else if (listPath) {
      const atPath = getByPath(payload, listPath);
      if (Array.isArray(atPath)) list = atPath;
    }
    if (!list.length && Array.isArray(payload?.patients)) list = payload.patients;
    if (!list.length && Array.isArray(payload?.data)) list = payload.data;

    if (!list.length) {
      return res.status(400).json({
        error:
          "External API returned no patients. Check list path / response shape (array, patients, or data)."
      });
    }

    const mapped = [];
    const errors = [];
    list.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        errors.push(`Item ${index + 1}: expected an object.`);
        return;
      }

      const patientFirstName = String(getByPath(item, mapping.firstName) ?? "").trim();
      const patientLastName = String(getByPath(item, mapping.lastName) ?? "").trim();
      const patientName = [patientFirstName, patientLastName].filter(Boolean).join(" ").trim();
      const patientPhone = String(getByPath(item, mapping.phone) ?? "")
        .trim()
        .replace(/[^\d+]/g, "");
      const patientDob = formatDob(getByPath(item, mapping.dob) ?? "");
      const patientLanguage = String(getByPath(item, mapping.language) ?? "").trim();
      const patientMemberNumber = String(getByPath(item, mapping.memberNumber) ?? "").trim();

      if (!patientName || !patientPhone || !patientDob || !patientLanguage || !patientMemberNumber) {
        errors.push(
          `Item ${index + 1}: missing required mapped fields (first/last name, phone, dob, language, member number).`
        );
        return;
      }

      mapped.push({
        campaignId: id,
        patientFirstName: patientFirstName || patientName,
        patientLastName: patientLastName || "",
        patientName,
        patientPhone,
        patientDob,
        patientLanguage,
        patientMemberNumber,
        patientEmail: item.email || item.patientEmail || null,
        extra: {},
        status: "pending"
      });
    });

    if (!mapped.length) {
      return res.status(400).json({ error: "No valid patients from external API.", errors });
    }

    if (replace) {
      await CampaignContact.destroy({ where: { campaignId: id } });
    }

    const created = await CampaignContact.bulkCreate(mapped);
    campaign.externalSource = url;
    if (campaign.status === "draft") campaign.status = "ready";
    await campaign.save();

    const allContacts = await CampaignContact.findAll({
      where: { campaignId: id },
      order: [["id", "ASC"]]
    });
    const counts = await contactCountsForCampaignIds([id]);
    return res.status(200).json({
      item: toCampaignDto(campaign, { contactCounts: counts[id] }),
      imported: created.length,
      skipped: errors.length,
      errors: errors.slice(0, 20),
      contacts: allContacts.map(toContactDto)
    });
  } catch (err) {
    if (err.response) {
      return res.status(502).json({
        error: `External API failed with status ${err.response.status}.`
      });
    }
    return next(err);
  }
}

function getByPath(obj, path) {
  if (obj == null || path == null || path === "") return undefined;
  const parts = String(path)
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .map((p) => p.trim())
    .filter(Boolean);
  let cur = obj;
  for (const part of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

async function deleteContact(req, res, next) {
  try {
    const campaignId = Number(req.params.id);
    const contactId = Number(req.params.contactId);
    if (!Number.isFinite(campaignId) || !Number.isFinite(contactId)) {
      return res.status(400).json({ error: "Invalid ids." });
    }

    const contact = await CampaignContact.findOne({
      where: { id: contactId, campaignId }
    });
    if (!contact) return res.status(404).json({ error: "Contact not found." });

    const { CampaignCallHistory } = require("../db");
    await CampaignCallHistory.destroy({ where: { campaignContactId: contactId } });
    await contact.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

async function getContactCallHistory(req, res, next) {
  try {
    const campaignId = Number(req.params.id);
    const contactId = Number(req.params.contactId);
    if (!Number.isFinite(campaignId) || !Number.isFinite(contactId)) {
      return res.status(400).json({ error: "Invalid ids." });
    }

    const contact = await CampaignContact.findOne({
      where: { id: contactId, campaignId }
    });
    if (!contact) return res.status(404).json({ error: "Contact not found." });

    const {
      listContactCallHistory,
      getCampaignCallBotContext
    } = require("../services/campaignCallAnalysisService");

    const history = await listContactCallHistory(campaignId, contactId);
    let botContext = null;
    try {
      const ctx = await getCampaignCallBotContext(campaignId, contactId);
      botContext = {
        language: ctx.language,
        flowId: String(ctx.flow.id),
        flowName: ctx.flow.name || "",
        instructionsPreview: String(ctx.instructions || "").slice(0, 1200)
      };
    } catch {
      botContext = null;
    }

    return res.status(200).json({
      contact: toContactDto(contact),
      history,
      botContext
    });
  } catch (err) {
    return next(err);
  }
}

async function getContactCallHistoryItem(req, res, next) {
  try {
    const campaignId = Number(req.params.id);
    const historyId = Number(req.params.historyId);
    if (!Number.isFinite(campaignId) || !Number.isFinite(historyId)) {
      return res.status(400).json({ error: "Invalid ids." });
    }

    const { getCallHistoryById } = require("../services/campaignCallAnalysisService");
    const item = await getCallHistoryById(campaignId, historyId);
    if (!item) return res.status(404).json({ error: "Call history not found." });
    return res.status(200).json({ item });
  } catch (err) {
    return next(err);
  }
}

async function reanalyzeContactCallHistory(req, res, next) {
  try {
    const campaignId = Number(req.params.id);
    const historyId = Number(req.params.historyId);
    if (!Number.isFinite(campaignId) || !Number.isFinite(historyId)) {
      return res.status(400).json({ error: "Invalid ids." });
    }

    const { reanalyzeCallHistory } = require("../services/campaignCallAnalysisService");
    const result = await reanalyzeCallHistory(campaignId, historyId);
    return res.status(200).json({
      item: result.history,
      contact: result.contact ? toContactDto(result.contact) : null
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
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
};
