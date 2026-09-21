const { addColumnIfMissing } = require("../migrationHelpers");

/** Bot Calendar schedule limits on clinics/doctors + optional appointment doctor. */
module.exports = {
  name: "20260318_002_bot_calendar_schedule",
  async up(_qi, sequelize) {
    await addColumnIfMissing(sequelize, "clinics", "weekly_hours", "JSON NULL");
    await addColumnIfMissing(
      sequelize,
      "clinics",
      "slot_duration_minutes",
      "INT UNSIGNED NOT NULL DEFAULT 30"
    );
    await addColumnIfMissing(sequelize, "clinics", "doctor_daily_limit", "INT UNSIGNED NULL");

    await addColumnIfMissing(sequelize, "doctors", "clinic_id", "INT UNSIGNED NULL");
    await addColumnIfMissing(sequelize, "doctors", "weekly_hours", "JSON NULL");
    await addColumnIfMissing(sequelize, "doctors", "slot_duration_minutes", "INT UNSIGNED NULL");
    await addColumnIfMissing(sequelize, "doctors", "doctor_daily_limit", "INT UNSIGNED NULL");

    await addColumnIfMissing(sequelize, "appointments", "doctor_id", "INT UNSIGNED NULL");
  }
};
