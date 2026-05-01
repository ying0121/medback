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

async function syncDatabase() {
  await sequelize.sync();
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
