/**
 * System alerts from conversation / call / campaign history analysis.
 */

const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const SystemAlert = sequelize.define(
  "system_alerts",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    sourceType: {
      type: DataTypes.ENUM("conversation", "call", "campaign"),
      allowNull: false,
      field: "source_type"
    },
    sourceId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: "source_id"
    },
    clinicId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "clinic_id"
    },
    priority: {
      type: DataTypes.ENUM("critical", "high", "medium", "low"),
      allowNull: false,
      defaultValue: "medium"
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    analysisResult: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "analysis_result"
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    recommendation: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM("open", "acknowledged", "resolved"),
      allowNull: false,
      defaultValue: "open"
    },
    notifiedEmailAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "notified_email_at"
    },
    notifiedVoiceAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "notified_voice_at"
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: "system_alerts",
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at",
    indexes: [
      { fields: ["priority"] },
      { fields: ["status"] },
      { fields: ["source_type", "source_id"] },
      { fields: ["clinic_id"] },
      { fields: ["created_at"] }
    ]
  }
);

module.exports = SystemAlert;
