/**
 * Custom (user-created) agent brain templates for Brain library.
 * System templates remain in constants/agentTemplates.js.
 */

const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const AgentBrainTemplate = sequelize.define(
  "agent_brain_templates",
  {
    id: {
      type: DataTypes.STRING(128),
      allowNull: false,
      primaryKey: true
    },
    typeId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: "type_id"
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    summary: {
      type: DataTypes.STRING(512),
      allowNull: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    defaultTools: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "default_tools"
    },
    suggestedVoice: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "suggested_voice"
    },
    tags: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    graph: {
      type: DataTypes.TEXT("medium"),
      allowNull: true
    },
    /** custom | fork */
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "custom"
    }
  },
  {
    engine: "MyISAM",
    tableName: "agent_brain_templates",
    underscored: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = AgentBrainTemplate;
