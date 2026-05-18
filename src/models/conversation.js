const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const Conversation = sequelize.define(
  "conversations",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    clinicId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "clinic_id"
    },
    userInfo: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "user_info"
    }
  },
  {
    engine: "MyISAM",
    timestamps: true,
    underscored: true
  }
);

module.exports = Conversation;
