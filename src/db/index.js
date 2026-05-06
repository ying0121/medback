const { sequelize } = require("./sequelize");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const Call = require("../models/call");
const IncomingMessage = require("../models/incomingMessage");
const User = require("../models/user");
const Clinic = require("../models/clinic");
const Knowledge = require("../models/knowledge");

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

async function ensureClinicTwilioColumns() {
  const statements = [
    "ALTER TABLE clinics ADD COLUMN twilio_phone_number VARCHAR(64) NULL",
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

async function syncDatabase() {
  await sequelize.sync();
  await ensureClinicElevenlabsColumn();
  await ensureClinicElevenlabsVoiceColumn();
  await ensureClinicTwilioColumns();
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
  User,
  Clinic,
  Knowledge,
  connectDatabase,
  syncDatabase,
  initializeDatabase
};
