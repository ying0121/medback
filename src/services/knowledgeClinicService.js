const { Op } = require("sequelize");
const { parseClinicIds, serializeClinicIds, rowMatchesClinic } = require("../utils/clinicIds");

/**
 * Resolve admin/UI clinic identifiers to business clinic ids (clinics.clinic_id).
 */
async function resolveBusinessClinicIds(rawIds = []) {
  const { Clinic } = require("../db");
  const nums = [...new Set(
    (Array.isArray(rawIds) ? rawIds : [rawIds])
      .map((value) => Number(value))
      .filter((n) => Number.isFinite(n) && n > 0)
  )];
  if (!nums.length) return [];

  const clinics = await Clinic.findAll({
    attributes: ["id", "clinicId"],
    where: {
      [Op.or]: [{ id: { [Op.in]: nums } }, { clinicId: { [Op.in]: nums } }]
    }
  });

  const businessIds = [];
  for (const clinic of clinics) {
    const businessId = Number(clinic.clinicId);
    if (Number.isFinite(businessId) && businessId > 0) {
      businessIds.push(businessId);
    }
  }
  return [...new Set(businessIds)];
}

/**
 * Backfill clinic_ids, drop legacy clinic_id / share_group, add document columns, dedupe.
 */
async function migrateKnowledgeMultiClinic() {
  const { Knowledge, Clinic, sequelize } = require("../db");

  async function columnExists(columnName) {
    const [rows] = await sequelize.query(
      `SHOW COLUMNS FROM knowledges LIKE :columnName`,
      { replacements: { columnName } }
    );
    return Array.isArray(rows) && rows.length > 0;
  }

  try {
    await sequelize.query("ALTER TABLE knowledges ADD COLUMN clinic_ids TEXT NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) throw err;
  }

  for (const sql of [
    "ALTER TABLE knowledges ADD COLUMN document_name VARCHAR(255) NULL",
    "ALTER TABLE knowledges ADD COLUMN document_path VARCHAR(512) NULL",
    "ALTER TABLE knowledges ADD COLUMN document_mime VARCHAR(128) NULL",
    "ALTER TABLE knowledges ADD COLUMN document_size INT UNSIGNED NULL"
  ]) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const msg = String(err?.parent?.sqlMessage || err?.message || "");
      if (!/duplicate column name/i.test(msg)) throw err;
    }
  }

  try {
    await sequelize.query("ALTER TABLE knowledges MODIFY COLUMN knowledge MEDIUMTEXT NOT NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/unknown column|doesn't exist/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.warn(`[knowledge] MEDIUMTEXT migration: ${msg}`);
    }
  }

  const clinics = await Clinic.findAll({ attributes: ["id", "clinicId"] });
  const byPk = new Map();
  const businessIds = new Set();
  for (const clinic of clinics) {
    const pk = Number(clinic.id);
    const businessId = Number(clinic.clinicId);
    if (Number.isFinite(businessId) && businessId > 0) businessIds.add(businessId);
    if (Number.isFinite(pk) && Number.isFinite(businessId) && businessId > 0) {
      byPk.set(pk, businessId);
    }
  }

  function toBusinessId(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (businessIds.has(n)) return n;
    return byPk.get(n) || null;
  }

  const hasLegacyClinicId = await columnExists("clinic_id");
  const selectSql = hasLegacyClinicId
    ? "SELECT id, clinic_id, clinic_ids, prompt_key, knowledge, status FROM knowledges ORDER BY id ASC"
    : "SELECT id, clinic_ids, prompt_key, knowledge, status FROM knowledges ORDER BY id ASC";

  const [rawRows] = await sequelize.query(selectSql);

  let backfilled = 0;
  for (const row of rawRows) {
    let ids = parseClinicIds(row.clinic_ids);
    if (!ids.length && hasLegacyClinicId && row.clinic_id != null) {
      const legacy = toBusinessId(row.clinic_id);
      if (legacy) ids = [legacy];
    } else {
      ids = ids.map(toBusinessId).filter(Boolean);
    }
    ids = [...new Set(ids)];
    if (!ids.length) continue;
    const nextJson = serializeClinicIds(ids);
    if (String(row.clinic_ids || "") !== nextJson) {
      await sequelize.query("UPDATE knowledges SET clinic_ids = :ids WHERE id = :id", {
        replacements: { ids: nextJson, id: row.id }
      });
      backfilled += 1;
    }
  }

  // Deduplicate identical knowledge content
  const fresh = await Knowledge.findAll({ order: [["id", "ASC"]] });
  const groups = new Map();
  for (const row of fresh) {
    const key = [
      String(row.promptKey || ""),
      String(row.status || "active"),
      String(row.knowledge || "").trim()
    ].join("\u0001");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  let merged = 0;
  let removed = 0;
  for (const [, members] of groups) {
    if (members.length < 2) continue;
    const keeper = members[0];
    const allIds = [];
    for (const member of members) {
      allIds.push(...parseClinicIds(member.getDataValue("clinicIds")));
    }
    const unique = [...new Set(allIds.filter(Boolean))];
    await keeper.update({ clinicIds: unique });
    merged += 1;
    for (const member of members.slice(1)) {
      await member.destroy();
      removed += 1;
    }
  }

  // Drop legacy columns / indexes that block multi-clinic design
  for (const sql of [
    "ALTER TABLE knowledges DROP INDEX uniq_knowledge_clinic_prompt",
    "ALTER TABLE knowledges DROP INDEX idx_knowledge_clinic_prompt",
    "ALTER TABLE knowledges DROP INDEX idx_knowledge_share_group",
    "ALTER TABLE knowledges DROP COLUMN share_group",
    "ALTER TABLE knowledges DROP COLUMN clinic_id"
  ]) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const msg = String(err?.parent?.sqlMessage || err?.message || "");
      if (!/check that.+exists|unknown column|doesn't exist|can't DROP|Duplicate|Key column/i.test(msg)) {
        // eslint-disable-next-line no-console
        console.warn(`[knowledge] legacy drop: ${msg}`);
      }
    }
  }

  try {
    await sequelize.query("ALTER TABLE knowledges MODIFY COLUMN clinic_ids TEXT NOT NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    // eslint-disable-next-line no-console
    console.warn(`[knowledge] clinic_ids NOT NULL: ${msg}`);
  }

  try {
    await sequelize.query("ALTER TABLE knowledges ADD INDEX idx_knowledge_prompt (prompt_key)");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate key name|duplicate index|already exists/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.warn(`[knowledge] prompt index: ${msg}`);
    }
  }

  if (backfilled || merged || removed) {
    // eslint-disable-next-line no-console
    console.log(
      `[knowledge] migrate: backfilled=${backfilled} mergedGroups=${merged} removedDupes=${removed}`
    );
  }
  return { backfilled, merged, removed };
}

module.exports = {
  parseClinicIds,
  serializeClinicIds,
  resolveBusinessClinicIds,
  migrateKnowledgeMultiClinic,
  rowMatchesClinic,
  normalizeKnowledgeClinicIds: migrateKnowledgeMultiClinic
};
