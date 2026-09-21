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
    agentId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "agent_id"
    },
    openaiVoice: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "openai_voice"
    },
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
    twilioPhoneNumber: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "twilio_phone_number"
    },
    twilioCallerId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "twilio_caller_id"
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
    },
    inboundGreeting: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "inbound_greeting"
    },
    chatGreeting: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "chat_greeting"
    },
    themeColor: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "azure",
      field: "theme_color"
    },
    avatar: {
      type: DataTypes.TEXT("long"),
      allowNull: true
    },
    googleClientId: {
      type: DataTypes.STRING(255),
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
    meetingProvider: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "google",
      field: "meeting_provider"
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
    /** Bot Calendar: weekly hours JSON { mon: {enabled,start,end}, … } */
    weeklyHours: {
      type: DataTypes.JSON,
      allowNull: true,
      field: "weekly_hours"
    },
    slotDurationMinutes: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 30,
      field: "slot_duration_minutes"
    },
    /** Max appointments per day (enforced for Bot Calendar booking). */
    doctorDailyLimit: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "doctor_daily_limit"
    }
  },
  {
    engine: "MyISAM",
    tableName: "clinics",
    timestamps: false
  }
);

module.exports = Clinic;
