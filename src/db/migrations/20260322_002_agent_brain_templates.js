/**
 * Create agent_brain_templates for custom Brain library templates.
 */

const { tableExists } = require("../migrationHelpers");

module.exports = {
  name: "20260322_002_agent_brain_templates",
  async up(_qi, sequelize) {
    if (await tableExists(sequelize, "agent_brain_templates")) return;
    await sequelize.query(`
      CREATE TABLE \`agent_brain_templates\` (
        \`id\` VARCHAR(128) NOT NULL,
        \`type_id\` VARCHAR(64) NOT NULL,
        \`name\` VARCHAR(255) NOT NULL,
        \`summary\` VARCHAR(512) NULL,
        \`description\` TEXT NULL,
        \`default_tools\` TEXT NULL,
        \`suggested_voice\` VARCHAR(64) NULL,
        \`tags\` TEXT NULL,
        \`graph\` MEDIUMTEXT NULL,
        \`source\` VARCHAR(32) NOT NULL DEFAULT 'custom',
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`)
      ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4
    `);
  }
};
