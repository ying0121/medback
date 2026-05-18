const { DataTypes, Sequelize } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const Call = sequelize.define(
  "calls",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    callSid: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "call_sid"
    },
    phone: {
      type: DataTypes.STRING(64),
      allowNull: false
    },
    seconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0
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
    tableName: "calls",
    updatedAt: false,
    createdAt: "created_at",
    underscored: true
  }
);

module.exports = Call;
