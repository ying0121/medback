const {
  addColumnIfMissing,
  modifyColumn,
  runSqlIgnoreMissing
} = require("../migrationHelpers");

/** Baseline schema alters previously done via ensure* helpers on startup. */
module.exports = {
  name: "20260318_001_baseline_schema_columns",
  async up(_qi, sequelize) {
    // audit_logs
    await addColumnIfMissing(sequelize, "audit_logs", "country_code", "VARCHAR(8) NULL");
    await addColumnIfMissing(sequelize, "audit_logs", "country_name", "VARCHAR(128) NULL");

    // conversation_flows
    await addColumnIfMissing(sequelize, "conversation_flows", "clinic_ids", "TEXT NULL");
    await runSqlIgnoreMissing(
      sequelize,
      `UPDATE conversation_flows
       SET clinic_ids = CONCAT('[', clinic_id, ']')
       WHERE (clinic_ids IS NULL OR clinic_ids = '' OR clinic_ids = '[]')
         AND clinic_id IS NOT NULL
         AND clinic_id > 0`
    );
    await runSqlIgnoreMissing(
      sequelize,
      `UPDATE conversation_flows SET clinic_ids = '[]' WHERE clinic_ids IS NULL`
    );
    await modifyColumn(sequelize, "conversation_flows", "clinic_id", "INT UNSIGNED NULL");

    // campaigns
    await addColumnIfMissing(sequelize, "campaigns", "scheduled_at", "DATETIME NULL");
    await addColumnIfMissing(
      sequelize,
      "campaigns",
      "retry_count",
      "INT UNSIGNED NOT NULL DEFAULT 3"
    );
    await addColumnIfMissing(sequelize, "campaigns", "agent_id", "INT UNSIGNED NULL");
    await modifyColumn(sequelize, "campaigns", "flow_id", "INT UNSIGNED NULL");

    // campaign_contacts
    await modifyColumn(
      sequelize,
      "campaign_contacts",
      "status",
      "VARCHAR(32) NOT NULL DEFAULT 'pending'"
    );
    await addColumnIfMissing(
      sequelize,
      "campaign_contacts",
      "attempt_count",
      "INT UNSIGNED NOT NULL DEFAULT 0"
    );
    await addColumnIfMissing(sequelize, "campaign_contacts", "last_call_at", "DATETIME NULL");
    await addColumnIfMissing(
      sequelize,
      "campaign_contacts",
      "last_analysis_summary",
      "TEXT NULL"
    );
    await addColumnIfMissing(
      sequelize,
      "campaign_contacts",
      "patient_first_name",
      "VARCHAR(128) NOT NULL DEFAULT ''"
    );
    await addColumnIfMissing(
      sequelize,
      "campaign_contacts",
      "patient_last_name",
      "VARCHAR(128) NOT NULL DEFAULT ''"
    );
    await addColumnIfMissing(
      sequelize,
      "campaign_contacts",
      "patient_language",
      "VARCHAR(64) NULL"
    );
    await addColumnIfMissing(
      sequelize,
      "campaign_contacts",
      "patient_member_number",
      "VARCHAR(128) NULL"
    );
    await runSqlIgnoreMissing(
      sequelize,
      `UPDATE campaign_contacts
       SET
         patient_first_name = CASE
           WHEN patient_first_name IS NULL OR patient_first_name = '' THEN TRIM(SUBSTRING_INDEX(patient_name, ' ', 1))
           ELSE patient_first_name
         END,
         patient_last_name = CASE
           WHEN patient_last_name IS NULL OR patient_last_name = '' THEN TRIM(SUBSTRING(patient_name, LENGTH(SUBSTRING_INDEX(patient_name, ' ', 1)) + 2))
           ELSE patient_last_name
         END
       WHERE patient_name IS NOT NULL AND patient_name != ''`
    );
    for (const sql of [
      "UPDATE campaign_contacts SET status = 'pending' WHERE status IN ('queued', 'skipped', 'draft')",
      "UPDATE campaign_contacts SET status = 'success' WHERE status IN ('completed', 'done')",
      "UPDATE campaign_contacts SET status = 'reject' WHERE status IN ('failed', 'failure')",
      "UPDATE campaign_contacts SET status = 'not_interesting' WHERE status IN ('not interesting', 'notinteresting')"
    ]) {
      await runSqlIgnoreMissing(sequelize, sql);
    }

    // clinics — historical integration columns
    await addColumnIfMissing(sequelize, "clinics", "elevenlabs_api_key", "TEXT NULL");
    await addColumnIfMissing(sequelize, "clinics", "elevenlabs_voice_id", "VARCHAR(128) NULL");
    await addColumnIfMissing(sequelize, "clinics", "openai_voice", "VARCHAR(64) NULL");
    await addColumnIfMissing(sequelize, "clinics", "agent_id", "INT UNSIGNED NULL");
    await addColumnIfMissing(sequelize, "clinics", "inbound_greeting", "TEXT NULL");
    await addColumnIfMissing(sequelize, "clinics", "chat_greeting", "TEXT NULL");
    await addColumnIfMissing(
      sequelize,
      "clinics",
      "theme_color",
      "VARCHAR(32) NOT NULL DEFAULT 'azure'"
    );
    await addColumnIfMissing(sequelize, "clinics", "avatar", "LONGTEXT NULL");
    await addColumnIfMissing(sequelize, "clinics", "twilio_phone_number", "VARCHAR(64) NULL");
    await addColumnIfMissing(sequelize, "clinics", "twilio_caller_id", "VARCHAR(64) NULL");
    await addColumnIfMissing(sequelize, "clinics", "twilio_account_sid", "VARCHAR(128) NULL");
    await addColumnIfMissing(sequelize, "clinics", "twilio_auth_token", "TEXT NULL");
    await addColumnIfMissing(sequelize, "clinics", "twilio_api_key_sid", "VARCHAR(128) NULL");
    await addColumnIfMissing(sequelize, "clinics", "twilio_api_key_secret", "TEXT NULL");
    await addColumnIfMissing(sequelize, "clinics", "twilio_twiml_app_sid", "VARCHAR(128) NULL");
    await addColumnIfMissing(sequelize, "clinics", "google_client_id", "VARCHAR(255) NULL");
    await addColumnIfMissing(sequelize, "clinics", "google_client_secret", "TEXT NULL");
    await addColumnIfMissing(sequelize, "clinics", "google_refresh_token", "TEXT NULL");
    await addColumnIfMissing(
      sequelize,
      "clinics",
      "google_create_meet",
      "TINYINT(1) NOT NULL DEFAULT 0"
    );
    await addColumnIfMissing(
      sequelize,
      "clinics",
      "meeting_provider",
      "VARCHAR(32) NOT NULL DEFAULT 'google'"
    );
    await addColumnIfMissing(sequelize, "clinics", "ecw_api_endpoint", "TEXT NULL");
    await addColumnIfMissing(sequelize, "clinics", "azul_api_endpoint", "TEXT NULL");

    // knowledge
    await addColumnIfMissing(sequelize, "knowledges", "prompt_key", "VARCHAR(64) NULL");
    await modifyColumn(sequelize, "knowledges", "knowledge", "MEDIUMTEXT NOT NULL");

    // theme legacy remap
    await runSqlIgnoreMissing(
      sequelize,
      "UPDATE clinics SET theme_color = 'azure' WHERE theme_color IN ('dark-blue', 'dark-mode')"
    );
  }
};
