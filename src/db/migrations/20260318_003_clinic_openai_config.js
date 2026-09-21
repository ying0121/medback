const { addColumnIfMissing } = require("../migrationHelpers");

/** Per-clinic OpenAI API key + model settings (moved from agent UI). */
module.exports = {
  name: "20260318_003_clinic_openai_config",
  async up(_qi, sequelize) {
    await addColumnIfMissing(sequelize, "clinics", "openai_api_key", "TEXT NULL");
    await addColumnIfMissing(sequelize, "clinics", "openai_model", "VARCHAR(128) NULL");
    await addColumnIfMissing(sequelize, "clinics", "openai_realtime_model", "VARCHAR(128) NULL");
    await addColumnIfMissing(
      sequelize,
      "clinics",
      "openai_transcription_model",
      "VARCHAR(128) NULL"
    );
    await addColumnIfMissing(sequelize, "clinics", "openai_tts_model", "VARCHAR(128) NULL");
    await addColumnIfMissing(sequelize, "clinics", "openai_inbound_model", "VARCHAR(128) NULL");
  }
};
