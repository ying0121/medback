const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const Knowledge = sequelize.define(
  "knowledges",
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
    knowledge: {
      type: DataTypes.TEXT,
      allowNull: false
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active"
    }
  },
  {
    engine: "MyISAM",
    tableName: "knowledges",
    timestamps: false
  }
);

module.exports = Knowledge;
