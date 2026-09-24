/**
 * Create conversation_analyses table for finished webchat analysis.
 */

const { tableExists } = require("../migrationHelpers");

module.exports = {
  name: "20260323_001_conversation_analyses",
  async up(_qi, sequelize) {
    if (await tableExists(sequelize, "conversation_analyses")) return;
    await sequelize.query(`
      CREATE TABLE \`conversation_analyses\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`conversation_id\` INT UNSIGNED NOT NULL,
        \`clinic_id\` INT UNSIGNED NULL,
        \`patient_name\` VARCHAR(255) NULL,
        \`patient_phone_spoken\` VARCHAR(64) NULL,
        \`caller_phone\` VARCHAR(64) NULL,
        \`reason_for_call\` TEXT NULL,
        \`symptoms_conditions\` TEXT NULL,
        \`help_requested\` TEXT NULL,
        \`urgency\` VARCHAR(32) NULL,
        \`sentiment\` VARCHAR(32) NULL,
        \`outcome_next_step\` TEXT NULL,
        \`summary\` TEXT NULL,
        \`key_quotes\` TEXT NULL,
        \`notes\` TEXT NULL,
        \`raw_analysis\` LONGTEXT NULL,
        \`email_status\` VARCHAR(32) NOT NULL DEFAULT 'pending',
        \`email_message_id\` VARCHAR(255) NULL,
        \`email_error\` TEXT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`uq_conversation_analyses_conversation\` (\`conversation_id\`),
        KEY \`idx_conversation_analyses_clinic\` (\`clinic_id\`),
        KEY \`idx_conversation_analyses_created\` (\`created_at\`),
        KEY \`idx_conversation_analyses_urgency\` (\`urgency\`)
      ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4
    `);
  }
};
