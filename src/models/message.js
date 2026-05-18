const { DataTypes, Sequelize } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const Message = sequelize.define(
  "messages",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    conversationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "conversation_id"
    },
    isTopic: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "is_topic"
    },
    userType: {
      type: DataTypes.ENUM("user", "bot"),
      allowNull: false,
      field: "user_type"
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    audio: {
      type: DataTypes.TEXT("long"),
      allowNull: true
    },
    messageType: {
      type: DataTypes.ENUM("chat", "voice"),
      allowNull: false,
      defaultValue: "chat",
      field: "message_type"
    },
    status: {
      type: DataTypes.ENUM("success", "error"),
      allowNull: false,
      defaultValue: "success"
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: Sequelize.fn("NOW"),
      field: "created_at"
    }
  },
  {
    engine: "MyISAM",
    tableName: "messages",
    updatedAt: false,
    createdAt: "created_at",
    underscored: true
  }
);

module.exports = Message;
