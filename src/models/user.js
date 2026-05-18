const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const User = sequelize.define(
  "users",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    fname: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    lname: {
      type: DataTypes.STRING(100),
      allowNull: false
    },
    photo: {
      type: DataTypes.TEXT("long"),
      allowNull: true
    },
    dob: {
      type: DataTypes.DATEONLY,
      allowNull: false,
      defaultValue: "1970-01-01"
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    city: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    state: {
      type: DataTypes.STRING(100),
      allowNull: true
    },
    zip: {
      type: DataTypes.STRING(20),
      allowNull: true
    },
    role: {
      type: DataTypes.ENUM("Admin", "Clinic Staff"),
      allowNull: false,
      defaultValue: "Clinic Staff"
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active"
    },
    clinics: {
      type: DataTypes.TEXT("long"),
      allowNull: true
    }
  },
  {
    engine: "MyISAM",
    tableName: "users",
    timestamps: false
  }
);

module.exports = User;
