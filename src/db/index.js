const { sequelize } = require("./sequelize");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const Call = require("../models/call");
const IncomingMessage = require("../models/incomingMessage");
const CallAnalysis = require("../models/callAnalysis");
const User = require("../models/user");
const Clinic = require("../models/clinic");
const Knowledge = require("../models/knowledge");
const Appointment = require("../models/appointment");

Conversation.hasMany(Message, {
  foreignKey: "conversationId",
  sourceKey: "id",
  onDelete: "CASCADE"
});

Message.belongsTo(Conversation, {
  foreignKey: "conversationId",
  targetKey: "id"
});

Call.hasMany(IncomingMessage, {
  foreignKey: "callId",
  sourceKey: "id",
  onDelete: "CASCADE"
});

IncomingMessage.belongsTo(Call, {
  foreignKey: "callId",
  targetKey: "id"
});

Call.hasOne(CallAnalysis, {
  foreignKey: "callId",
  sourceKey: "id",
  onDelete: "CASCADE"
});

CallAnalysis.belongsTo(Call, {
  foreignKey: "callId",
  targetKey: "id"
});

Clinic.hasMany(Appointment, {
  foreignKey: "clinicId",
  sourceKey: "id"
});

Appointment.belongsTo(Clinic, {
  foreignKey: "clinicId",
  targetKey: "id",
  as: "clinic"
});

async function connectDatabase() {
  await sequelize.authenticate();
}

async function ensureClinicElevenlabsColumn() {
  try {
    await sequelize.query("ALTER TABLE clinics ADD COLUMN elevenlabs_api_key TEXT NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

async function ensureClinicElevenlabsVoiceColumn() {
  try {
    await sequelize.query("ALTER TABLE clinics ADD COLUMN elevenlabs_voice_id VARCHAR(128) NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

async function ensureClinicOpenAiVoiceColumn() {
  try {
    await sequelize.query("ALTER TABLE clinics ADD COLUMN openai_voice VARCHAR(64) NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

async function ensureClinicInboundGreetingColumn() {
  try {
    await sequelize.query("ALTER TABLE clinics ADD COLUMN inbound_greeting TEXT NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

async function ensureClinicThemeColorColumn() {
  try {
    await sequelize.query(
      "ALTER TABLE clinics ADD COLUMN theme_color VARCHAR(32) NOT NULL DEFAULT 'azure'"
    );
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

async function ensureClinicTwilioColumns() {
  const statements = [
    "ALTER TABLE clinics ADD COLUMN twilio_phone_number VARCHAR(64) NULL",
    "ALTER TABLE clinics ADD COLUMN twilio_caller_id VARCHAR(64) NULL",
    "ALTER TABLE clinics ADD COLUMN twilio_account_sid VARCHAR(128) NULL",
    "ALTER TABLE clinics ADD COLUMN twilio_auth_token TEXT NULL",
    "ALTER TABLE clinics ADD COLUMN twilio_api_key_sid VARCHAR(128) NULL",
    "ALTER TABLE clinics ADD COLUMN twilio_api_key_secret TEXT NULL",
    "ALTER TABLE clinics ADD COLUMN twilio_twiml_app_sid VARCHAR(128) NULL"
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const msg = String(err?.parent?.sqlMessage || err?.message || "");
      if (!/duplicate column name/i.test(msg)) throw err;
    }
  }
}

async function ensureClinicGoogleColumns() {
  const statements = [
    "ALTER TABLE clinics ADD COLUMN google_client_id VARCHAR(255) NULL",
    "ALTER TABLE clinics ADD COLUMN google_client_secret TEXT NULL",
    "ALTER TABLE clinics ADD COLUMN google_refresh_token TEXT NULL",
    "ALTER TABLE clinics ADD COLUMN google_create_meet TINYINT(1) NOT NULL DEFAULT 0",
    "ALTER TABLE clinics ADD COLUMN meeting_provider VARCHAR(32) NOT NULL DEFAULT 'google'",
    "ALTER TABLE clinics ADD COLUMN ecw_api_endpoint TEXT NULL",
    "ALTER TABLE clinics ADD COLUMN azul_api_endpoint TEXT NULL"
  ];

  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const msg = String(err?.parent?.sqlMessage || err?.message || "");
      if (!/duplicate column name/i.test(msg)) throw err;
    }
  }
}

async function syncDatabase() {
  await sequelize.sync();
  await ensureClinicElevenlabsColumn();
  await ensureClinicElevenlabsVoiceColumn();
  await ensureClinicOpenAiVoiceColumn();
  await ensureClinicTwilioColumns();
  await ensureClinicInboundGreetingColumn();
  await ensureClinicThemeColorColumn();
  await ensureClinicAvatarColumn();
  await ensureClinicChatGreetingColumn();
  await ensureClinicGoogleColumns();
  await migrateThemeColorLegacyIds();
  await ensureKnowledgePromptKeyColumn();
  await ensureKnowledgeMediumText();
  const { migrateKnowledgeMultiClinic } = require("../services/knowledgeClinicService");
  await migrateKnowledgeMultiClinic();
  const { ensureKnowledgeUploadDir } = require("../services/knowledgeDocumentStorage");
  ensureKnowledgeUploadDir();
  const { seedDefaultKnowledgeForAllClinics } = require("../services/knowledgeSeedService");
  await seedDefaultKnowledgeForAllClinics();
}

async function ensureKnowledgePromptKeyColumn() {
  try {
    await sequelize.query("ALTER TABLE knowledges ADD COLUMN prompt_key VARCHAR(64) NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

async function ensureKnowledgeMediumText() {
  try {
    await sequelize.query("ALTER TABLE knowledges MODIFY COLUMN knowledge MEDIUMTEXT NOT NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/unknown column|doesn't exist/i.test(msg)) {
      if (!/duplicate|same/i.test(msg)) {
        // eslint-disable-next-line no-console
        console.warn(`[knowledge] MEDIUMTEXT migration: ${msg}`);
      }
    }
  }
}

async function ensureClinicChatGreetingColumn() {
  try {
    await sequelize.query("ALTER TABLE clinics ADD COLUMN chat_greeting TEXT NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

async function ensureClinicAvatarColumn() {
  try {
    await sequelize.query("ALTER TABLE clinics ADD COLUMN avatar LONGTEXT NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) throw err;
  }
}

async function migrateThemeColorLegacyIds() {
  try {
    await sequelize.query(
      "UPDATE clinics SET theme_color = 'azure' WHERE theme_color IN ('dark-blue', 'dark-mode')"
    );
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/unknown column/i.test(msg)) throw err;
  }
}

async function initializeDatabase() {
  await connectDatabase();
  await syncDatabase();
}

module.exports = {
  sequelize,
  Conversation,
  Message,
  Call,
  IncomingMessage,
  CallAnalysis,
  User,
  Clinic,
  Knowledge,
  Appointment,
  connectDatabase,
  syncDatabase,
  initializeDatabase
};
