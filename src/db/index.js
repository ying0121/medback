const { sequelize } = require("./sequelize");
const { runMigrations } = require("./migrator");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
const Call = require("../models/call");
const IncomingMessage = require("../models/incomingMessage");
const CallAnalysis = require("../models/callAnalysis");
const ConversationAnalysis = require("../models/conversationAnalysis");
const User = require("../models/user");
const Clinic = require("../models/clinic");
const Knowledge = require("../models/knowledge");
const Appointment = require("../models/appointment");
const ConversationFlow = require("../models/conversationFlow");
const Campaign = require("../models/campaign");
const CampaignContact = require("../models/campaignContact");
const CampaignCallHistory = require("../models/campaignCallHistory");
const Doctor = require("../models/doctor");
const Agent = require("../models/agent");
const AgentBrainTemplate = require("../models/agentBrainTemplate");
const AuditLog = require("../models/auditLog");
const SystemAlert = require("../models/systemAlert");

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

Conversation.hasOne(ConversationAnalysis, {
  foreignKey: "conversationId",
  sourceKey: "id",
  onDelete: "CASCADE"
});

ConversationAnalysis.belongsTo(Conversation, {
  foreignKey: "conversationId",
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

Clinic.hasMany(Doctor, {
  foreignKey: "clinicId",
  sourceKey: "id",
  constraints: false
});

Doctor.belongsTo(Clinic, {
  foreignKey: "clinicId",
  targetKey: "id",
  as: "clinic",
  constraints: false
});

Doctor.hasMany(Appointment, {
  foreignKey: "doctorId",
  sourceKey: "id",
  constraints: false
});

Appointment.belongsTo(Doctor, {
  foreignKey: "doctorId",
  targetKey: "id",
  as: "doctor",
  constraints: false
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

async function syncDatabase() {
  await sequelize.sync();
  // Explicitly ensure campaign/flow tables exist (MyISAM, no FK — may be skipped in some sync paths).
  await ConversationFlow.sync();
  await Campaign.sync();
  await CampaignContact.sync();
  await CampaignCallHistory.sync();
  await Doctor.sync();
  await Agent.sync();
  await AgentBrainTemplate.sync();
  await AuditLog.sync();
  await SystemAlert.sync();
  await ConversationAnalysis.sync();

  // Versioned schema migrations (src/db/migrations/*)
  await runMigrations();

  const { migrateKnowledgeMultiClinic } = require("../services/knowledgeClinicService");
  await migrateKnowledgeMultiClinic();
  const { ensureKnowledgeUploadDir } = require("../services/knowledgeDocumentStorage");
  ensureKnowledgeUploadDir();
  const { seedDefaultKnowledgeForAllClinics } = require("../services/knowledgeSeedService");
  await seedDefaultKnowledgeForAllClinics();
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
  ConversationAnalysis,
  User,
  Clinic,
  Knowledge,
  Appointment,
  ConversationFlow,
  Campaign,
  CampaignContact,
  CampaignCallHistory,
  Doctor,
  Agent,
  AgentBrainTemplate,
  AuditLog,
  SystemAlert,
  connectDatabase,
  syncDatabase,
  initializeDatabase
};
