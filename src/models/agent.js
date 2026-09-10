const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

/**
 * Agent = full bot behavior profile (models, voice, Twilio, meetings, flow, campaigns, knowledge).
 */
const Agent = sequelize.define(
  "agents",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active"
    },

    /** OpenAI */
    openaiApiKey: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "openai_api_key"
    },
    openaiModel: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "openai_model"
    },
    openaiRealtimeModel: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "openai_realtime_model"
    },
    openaiTranscriptionModel: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "openai_transcription_model"
    },
    openaiTtsModel: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "openai_tts_model"
    },
    openaiInboundModel: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "openai_inbound_model"
    },
    openaiVoice: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "openai_voice"
    },

    /** Twilio */
    twilioPhoneNumber: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: "twilio_phone_number"
    },
    twilioCallerId: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: "twilio_caller_id"
    },
    twilioAccountSid: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "twilio_account_sid"
    },
    twilioAuthToken: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "twilio_auth_token"
    },
    twilioApiKeySid: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "twilio_api_key_sid"
    },
    twilioApiKeySecret: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "twilio_api_key_secret"
    },
    twilioTwimlAppSid: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "twilio_twiml_app_sid"
    },

    /** Meeting provider */
    meetingProvider: {
      type: DataTypes.ENUM("google", "ecw", "azul"),
      allowNull: false,
      defaultValue: "google",
      field: "meeting_provider"
    },
    googleClientId: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "google_client_id"
    },
    googleClientSecret: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "google_client_secret"
    },
    googleRefreshToken: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "google_refresh_token"
    },
    googleCreateMeet: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "google_create_meet"
    },
    ecwApiEndpoint: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "ecw_api_endpoint"
    },
    azulApiEndpoint: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "azul_api_endpoint"
    },

    /** Behavior links */
    flowId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "flow_id"
    },
    /** JSON array of knowledge ids */
    knowledgeIds: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "knowledge_ids"
    }
  },
  {
    tableName: "agents",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = Agent;
