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
const ConversationFlow = require("../models/conversationFlow");
const Campaign = require("../models/campaign");
const CampaignContact = require("../models/campaignContact");
const CampaignCallHistory = require("../models/campaignCallHistory");
const Doctor = require("../models/doctor");

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

Clinic.hasMany(Campaign, {
  foreignKey: "clinicId",
  sourceKey: "id",
  constraints: false
});

Campaign.belongsTo(Clinic, {
  foreignKey: "clinicId",
  targetKey: "id",
  constraints: false
});

ConversationFlow.hasMany(Campaign, {
  foreignKey: "flowId",
  sourceKey: "id",
  constraints: false
});

Campaign.belongsTo(ConversationFlow, {
  foreignKey: "flowId",
  targetKey: "id",
  as: "flow",
  constraints: false
});

Campaign.hasMany(CampaignContact, {
  foreignKey: "campaignId",
  sourceKey: "id",
  constraints: false
});

CampaignContact.belongsTo(Campaign, {
  foreignKey: "campaignId",
  targetKey: "id",
  constraints: false
});

CampaignContact.hasMany(CampaignCallHistory, {
  foreignKey: "campaignContactId",
  sourceKey: "id",
  constraints: false
});

CampaignCallHistory.belongsTo(CampaignContact, {
  foreignKey: "campaignContactId",
  targetKey: "id",
  constraints: false
});

Campaign.hasMany(CampaignCallHistory, {
  foreignKey: "campaignId",
  sourceKey: "id",
  constraints: false
});

CampaignCallHistory.belongsTo(Campaign, {
  foreignKey: "campaignId",
  targetKey: "id",
  constraints: false
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
  // Explicitly ensure campaign/flow tables exist (MyISAM, no FK — may be skipped in some sync paths).
  await ConversationFlow.sync();
  await Campaign.sync();
  await CampaignContact.sync();
  await CampaignCallHistory.sync();
  await Doctor.sync();
  await ensureConversationFlowClinicIds();
  await ensureCampaignContactPatientColumns();
  await ensureCampaignContactResultColumns();
  await ensureCampaignScheduleColumns();
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

async function ensureCampaignScheduleColumns() {
  const statements = [
    "ALTER TABLE campaigns ADD COLUMN scheduled_at DATETIME NULL",
    "ALTER TABLE campaigns ADD COLUMN retry_count INT UNSIGNED NOT NULL DEFAULT 3"
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const msg = String(err?.parent?.sqlMessage || err?.message || "");
      if (!/duplicate column name/i.test(msg)) {
        if (!/unknown table|doesn't exist/i.test(msg)) throw err;
      }
    }
  }
}

async function ensureCampaignContactResultColumns() {
  const statements = [
    "ALTER TABLE campaign_contacts MODIFY COLUMN status VARCHAR(32) NOT NULL DEFAULT 'pending'",
    "ALTER TABLE campaign_contacts ADD COLUMN attempt_count INT UNSIGNED NOT NULL DEFAULT 0",
    "ALTER TABLE campaign_contacts ADD COLUMN last_call_at DATETIME NULL",
    "ALTER TABLE campaign_contacts ADD COLUMN last_analysis_summary TEXT NULL"
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const msg = String(err?.parent?.sqlMessage || err?.message || "");
      if (!/duplicate column name/i.test(msg)) {
        if (!/unknown table|doesn't exist/i.test(msg)) {
          // MODIFY may fail on fresh VARCHAR already — ignore benign
          if (!/identical|same/i.test(msg)) {
            // eslint-disable-next-line no-console
            console.warn(`[campaigns] status/result columns: ${msg}`);
          }
        }
      }
    }
  }

  const remaps = [
    "UPDATE campaign_contacts SET status = 'pending' WHERE status IN ('queued', 'skipped', 'draft')",
    "UPDATE campaign_contacts SET status = 'success' WHERE status IN ('completed', 'done')",
    "UPDATE campaign_contacts SET status = 'reject' WHERE status IN ('failed', 'failure')",
    "UPDATE campaign_contacts SET status = 'not_interesting' WHERE status IN ('not interesting', 'notinteresting')"
  ];
  for (const sql of remaps) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const msg = String(err?.parent?.sqlMessage || err?.message || "");
      // eslint-disable-next-line no-console
      console.warn(`[campaigns] status remap: ${msg}`);
    }
  }
}

async function ensureCampaignContactPatientColumns() {
  const statements = [
    "ALTER TABLE campaign_contacts ADD COLUMN patient_first_name VARCHAR(128) NOT NULL DEFAULT ''",
    "ALTER TABLE campaign_contacts ADD COLUMN patient_last_name VARCHAR(128) NOT NULL DEFAULT ''",
    "ALTER TABLE campaign_contacts ADD COLUMN patient_language VARCHAR(64) NULL",
    "ALTER TABLE campaign_contacts ADD COLUMN patient_member_number VARCHAR(128) NULL"
  ];
  for (const sql of statements) {
    try {
      await sequelize.query(sql);
    } catch (err) {
      const msg = String(err?.parent?.sqlMessage || err?.message || "");
      if (!/duplicate column name/i.test(msg)) {
        if (!/unknown table|doesn't exist/i.test(msg)) throw err;
      }
    }
  }

  try {
    await sequelize.query(`
      UPDATE campaign_contacts
      SET
        patient_first_name = CASE
          WHEN patient_first_name IS NULL OR patient_first_name = '' THEN TRIM(SUBSTRING_INDEX(patient_name, ' ', 1))
          ELSE patient_first_name
        END,
        patient_last_name = CASE
          WHEN patient_last_name IS NULL OR patient_last_name = '' THEN TRIM(SUBSTRING(patient_name, LENGTH(SUBSTRING_INDEX(patient_name, ' ', 1)) + 2))
          ELSE patient_last_name
        END
      WHERE patient_name IS NOT NULL AND patient_name != ''
    `);
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    // eslint-disable-next-line no-console
    console.warn(`[campaigns] contact name backfill: ${msg}`);
  }
}

async function ensureConversationFlowClinicIds() {
  try {
    await sequelize.query("ALTER TABLE conversation_flows ADD COLUMN clinic_ids TEXT NULL");
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/duplicate column name/i.test(msg)) {
      if (!/unknown table|doesn't exist/i.test(msg)) throw err;
      return;
    }
  }

  try {
    await sequelize.query(`
      UPDATE conversation_flows
      SET clinic_ids = CONCAT('[', clinic_id, ']')
      WHERE (clinic_ids IS NULL OR clinic_ids = '' OR clinic_ids = '[]')
        AND clinic_id IS NOT NULL
        AND clinic_id > 0
    `);
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    // clinic_id may already be gone on fresh schemas
    if (!/unknown column/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.warn(`[flows] clinic_ids backfill: ${msg}`);
    }
  }

  try {
    await sequelize.query(`
      UPDATE conversation_flows
      SET clinic_ids = '[]'
      WHERE clinic_ids IS NULL
    `);
  } catch {
    // ignore
  }

  try {
    await sequelize.query(
      "ALTER TABLE conversation_flows MODIFY COLUMN clinic_id INT UNSIGNED NULL"
    );
  } catch (err) {
    const msg = String(err?.parent?.sqlMessage || err?.message || "");
    if (!/unknown column/i.test(msg)) {
      // eslint-disable-next-line no-console
      console.warn(`[flows] clinic_id nullable: ${msg}`);
    }
  }
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
  ConversationFlow,
  Campaign,
  CampaignContact,
  CampaignCallHistory,
  Doctor,
  connectDatabase,
  syncDatabase,
  initializeDatabase
};
