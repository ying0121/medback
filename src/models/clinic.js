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
    },
    twilioPhoneNumber: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "twilio_phone_number"
    },
    twilioAccountSid: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "twilio_account_sid"
    },
    twilioAuthToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "twilio_auth_token"
    },
    twilioApiKeySid: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "twilio_api_key_sid"
    },
    twilioApiKeySecret: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "twilio_api_key_secret"
    },
    twilioTwimlAppSid: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "twilio_twiml_app_sid"
    }
  },
  {
    engine: "MyISAM",
    tableName: "clinics",
    timestamps: false
  }
);

module.exports = Clinic;
