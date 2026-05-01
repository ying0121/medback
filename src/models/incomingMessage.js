const { DataTypes, Sequelize } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const IncomingMessage = sequelize.define(
  "incoming_messages",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    callId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "call_id"
    },
    audio: {
      type: DataTypes.TEXT("long"),
      allowNull: true
    },
    transcription: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    userType: {
      type: DataTypes.ENUM("bot", "user"),
      allowNull: false,
      field: "user_type"
    },
    status: {
      type: DataTypes.STRING(64),
      allowNull: true
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
    tableName: "incoming_messages",
    updatedAt: false,
    createdAt: "created_at",
    underscored: true
  }
);

module.exports = IncomingMessage;
