/**
 * Create system_alerts table for history analysis alerts.
 */

const { tableExists } = require("../migrationHelpers");

module.exports = {
  name: "20260322_003_system_alerts",
  async up(_qi, sequelize) {
    if (await tableExists(sequelize, "system_alerts")) return;
    await sequelize.query(`
      CREATE TABLE \`system_alerts\` (
        \`id\` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`source_type\` ENUM('conversation','call','campaign') NOT NULL,
        \`source_id\` VARCHAR(64) NOT NULL,
        \`clinic_id\` VARCHAR(64) NULL,
        \`priority\` ENUM('critical','high','medium','low') NOT NULL DEFAULT 'medium',
        \`title\` VARCHAR(255) NOT NULL,
        \`analysis_result\` TEXT NOT NULL,
        \`reason\` TEXT NOT NULL,
        \`recommendation\` TEXT NOT NULL,
        \`status\` ENUM('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
        \`notified_email_at\` DATETIME NULL,
        \`notified_voice_at\` DATETIME NULL,
        \`metadata\` TEXT NULL,
        \`created_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updated_at\` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        KEY \`idx_alerts_priority\` (\`priority\`),
        KEY \`idx_alerts_status\` (\`status\`),
        KEY \`idx_alerts_source\` (\`source_type\`, \`source_id\`),
        KEY \`idx_alerts_clinic\` (\`clinic_id\`),
        KEY \`idx_alerts_created\` (\`created_at\`)
      ) ENGINE=MyISAM DEFAULT CHARSET=utf8mb4
    `);
  }
};
