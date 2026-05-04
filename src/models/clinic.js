const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const Clinic = sequelize.define(
  "clinics",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    clinicId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: "clinic_id"
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    address1: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    address2: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    zip: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    phone: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    web: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    portal: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    acronym: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    elevenlabsApiKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "elevenlabs_api_key"
    },
    elevenlabsVoiceId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "elevenlabs_voice_id"
    }
  },
  {
    engine: "MyISAM",
    tableName: "clinics",
    timestamps: false
  }
);

module.exports = Clinic;
