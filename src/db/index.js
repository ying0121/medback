const { sequelize } = require("./sequelize");
const Conversation = require("../models/conversation");
const Message = require("../models/message");
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
  User,
  Clinic,
  Knowledge,
  connectDatabase,
  syncDatabase,
  initializeDatabase
};
