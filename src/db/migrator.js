/**
 * Versioned database migrations.
 *
 * Files: src/db/migrations/<timestamp>_<name>.js
 * Each exports: { name?, up(queryInterface, sequelize), down?(...) }
 *
 * Applied names are stored in `schema_migrations`.
 */

const fs = require("fs");
const path = require("path");
const { sequelize } = require("./sequelize");

const MIGRATIONS_DIR = path.join(__dirname, "migrations");
const META_TABLE = "schema_migrations";

async function ensureMetaTable() {
  const createSql = `
    CREATE TABLE IF NOT EXISTS \`${META_TABLE}\` (
      name VARCHAR(191) NOT NULL PRIMARY KEY,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4
  `;

  try {
    await sequelize.query(createSql);
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    // Corrupt leftover .frm / missing InnoDB tablespace
    if (!/doesn't exist in engine|corrupt|error 1932|error 1017/i.test(msg)) throw err;
    // eslint-disable-next-line no-console
    console.warn(`[migrate] repairing corrupted ${META_TABLE}: ${msg}`);
    await sequelize.query(`DROP TABLE IF EXISTS \`${META_TABLE}\``);
    await sequelize.query(createSql.replace("IF NOT EXISTS ", ""));
  }

  try {
    await sequelize.query(`ALTER TABLE \`${META_TABLE}\` ENGINE=MyISAM`);
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (/doesn't exist in engine|corrupt|error 1932|error 1017/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.warn(`[migrate] recreating ${META_TABLE} after engine convert failure`);
      await sequelize.query(`DROP TABLE IF EXISTS \`${META_TABLE}\``);
      await sequelize.query(createSql.replace("IF NOT EXISTS ", ""));
      return;
    }
    // ignore if already MyISAM / missing during race
  }
}

async function listApplied() {
  await ensureMetaTable();
  const [rows] = await sequelize.query(
    `SELECT name FROM \`${META_TABLE}\` ORDER BY name ASC`
  );
  return new Set((rows || []).map((r) => String(r.name)));
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{8}_\d{3}_.+\.js$/.test(f))
    .sort();
}

function loadMigration(fileName) {
  // eslint-disable-next-line import/no-dynamic-require, global-require
  const mod = require(path.join(MIGRATIONS_DIR, fileName));
  const name = mod.name || fileName.replace(/\.js$/, "");
  if (typeof mod.up !== "function") {
    throw new Error(`Migration ${fileName} must export an async up(queryInterface, sequelize)`);
  }
  return { name, fileName, up: mod.up, down: mod.down };
}

/**
 * Run pending migrations in order.
 * @returns {{ applied: string[], skipped: number }}
 */
async function runMigrations({ direction = "up" } = {}) {
  if (direction !== "up") {
    throw new Error("Only up migrations are supported via runMigrations().");
  }

  await sequelize.authenticate();
  const applied = await listApplied();
  const files = listMigrationFiles();
  const pending = [];

  for (const file of files) {
    const mig = loadMigration(file);
    if (!applied.has(mig.name)) pending.push(mig);
  }

  if (!pending.length) {
    // eslint-disable-next-line no-console
    console.log("[migrate] No pending migrations.");
    return { applied: [], skipped: files.length };
  }

  const queryInterface = sequelize.getQueryInterface();
  const done = [];

  for (const mig of pending) {
    // eslint-disable-next-line no-console
    console.log(`[migrate] applying ${mig.name}…`);
    await mig.up(queryInterface, sequelize);
    await sequelize.query(`INSERT INTO \`${META_TABLE}\` (name) VALUES (:name)`, {
      replacements: { name: mig.name }
    });
    done.push(mig.name);
    // eslint-disable-next-line no-console
    console.log(`[migrate] applied ${mig.name}`);
  }

  return { applied: done, skipped: files.length - done.length };
}

async function migrationStatus() {
  await sequelize.authenticate();
  const applied = await listApplied();
  const files = listMigrationFiles().map((f) => loadMigration(f));
  return files.map((m) => ({
    name: m.name,
    fileName: m.fileName,
    applied: applied.has(m.name)
  }));
}

module.exports = {
  MIGRATIONS_DIR,
  META_TABLE,
  runMigrations,
  migrationStatus,
  listMigrationFiles,
  ensureMetaTable
};
