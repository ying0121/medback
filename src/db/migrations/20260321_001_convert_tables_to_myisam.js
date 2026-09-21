/**
 * Convert tables that were created without engine: MyISAM (or with InnoDB)
 * to MyISAM so they match the rest of the schema.
 */
const { convertToMyisamIfNeeded } = require("../migrationHelpers");

const TABLES = ["agents", "audit_logs", "doctors", "knowledges", "schema_migrations"];

module.exports = {
  name: "20260321_001_convert_tables_to_myisam",
  async up(_qi, sequelize) {
    for (const table of TABLES) {
      await convertToMyisamIfNeeded(sequelize, table);
    }
  }
};
