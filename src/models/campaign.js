const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const Campaign = sequelize.define(
  "campaigns",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    clinicId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "clinic_id"
    },
    flowId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "flow_id"
    },
    /** Assigned agent — owns flow + knowledge for outbound calls */
    agentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "agent_id"
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM("draft", "ready", "running", "paused", "completed"),
      allowNull: false,
      defaultValue: "draft"
    },
    /** When the bot should begin outbound calling automatically */
    scheduledAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "scheduled_at"
    },
    /** How many times to retry if the patient does not accept the call */
    retryCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 3,
      field: "retry_count"
    },
    /** Optional external sync source label / URL snapshot */
    externalSource: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: "external_source"
    }
  },
  {
    engine: "MyISAM",
    tableName: "campaigns",
    underscored: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = Campaign;
