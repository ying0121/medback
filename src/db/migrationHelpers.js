/**
 * Idempotent MySQL helpers for schema migrations.
 */

async function tableExists(sequelize, tableName) {
  const [rows] = await sequelize.query(
    `SELECT 1 AS ok
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
     LIMIT 1`,
    { replacements: { tableName } }
  );
  return Boolean(rows && rows.length);
}

async function columnExists(sequelize, tableName, columnName) {
  const [rows] = await sequelize.query(
    `SELECT 1 AS ok
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
       AND COLUMN_NAME = :columnName
     LIMIT 1`,
    { replacements: { tableName, columnName } }
  );
  return Boolean(rows && rows.length);
}

/**
 * ADD COLUMN when missing. definition is raw SQL after column name,
 * e.g. "INT UNSIGNED NULL" or "VARCHAR(64) NULL".
 */
async function addColumnIfMissing(sequelize, tableName, columnName, definition) {
  if (!(await tableExists(sequelize, tableName))) {
    // eslint-disable-next-line no-console
    console.warn(`[migrate] skip ${tableName}.${columnName} — table missing`);
    return false;
  }
  if (await columnExists(sequelize, tableName, columnName)) return false;
  await sequelize.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${definition}`
  );
  // eslint-disable-next-line no-console
  console.log(`[migrate] added ${tableName}.${columnName}`);
  return true;
}

async function modifyColumn(sequelize, tableName, columnName, definition) {
  if (!(await tableExists(sequelize, tableName))) return false;
  if (!(await columnExists(sequelize, tableName, columnName))) return false;
  try {
    await sequelize.query(
      `ALTER TABLE \`${tableName}\` MODIFY COLUMN \`${columnName}\` ${definition}`
    );
    return true;
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (/identical|same/i.test(msg)) return false;
    throw err;
  }
}

async function convertToMyisamIfNeeded(sequelize, tableName) {
  if (!(await tableExists(sequelize, tableName))) return false;
  const [rows] = await sequelize.query(
    `SELECT ENGINE AS engine
     FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = :tableName
     LIMIT 1`,
    { replacements: { tableName } }
  );
  const engine = String(rows?.[0]?.engine || "").toUpperCase();
  if (engine === "MYISAM") return false;
  await sequelize.query(`ALTER TABLE \`${tableName}\` ENGINE=MyISAM`);
  // eslint-disable-next-line no-console
  console.log(`[migrate] ${tableName}: ${engine || "?"} → MyISAM`);
  return true;
}

async function runSqlIgnoreMissing(sequelize, sql) {
  try {
    await sequelize.query(sql);
    return true;
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (/unknown (table|column)|doesn't exist/i.test(msg)) return false;
    throw err;
  }
}

module.exports = {
  tableExists,
  columnExists,
  addColumnIfMissing,
  modifyColumn,
  convertToMyisamIfNeeded,
  runSqlIgnoreMissing
};
