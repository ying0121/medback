/**
 * Drop unused bot_daily_limit if it was added during an earlier schedule prototype.
 * Safe no-op when the column was never created.
 */
const { columnExists, tableExists } = require("../migrationHelpers");

module.exports = {
  name: "20260318_004_drop_bot_daily_limit",
  async up(_qi, sequelize) {
    for (const table of ["clinics", "doctors"]) {
      if (!(await tableExists(sequelize, table))) continue;
      if (!(await columnExists(sequelize, table, "bot_daily_limit"))) continue;
      await sequelize.query(`ALTER TABLE \`${table}\` DROP COLUMN \`bot_daily_limit\``);
      // eslint-disable-next-line no-console
      console.log(`[migrate] dropped ${table}.bot_daily_limit`);
    }
  }
};
