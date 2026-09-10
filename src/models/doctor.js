const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

/**
 * Clinic doctor / provider profile for admin management.
 */
const Doctor = sequelize.define(
  "doctors",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    firstName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "first_name"
    },
    lastName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: "last_name"
    },
    gender: {
      type: DataTypes.ENUM("Male", "Female", "Other"),
      allowNull: false,
      defaultValue: "Other"
    },
    phone: {
      type: DataTypes.STRING(30),
      allowNull: true
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    language: {
      type: DataTypes.STRING(64),
      allowNull: true,
      defaultValue: "English"
    },
    address1: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "address1"
    },
    address2: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "address2"
    },
    /** Base64 / data-URL photo; max display size enforced client-side at 360×360 */
    photo: {
      type: DataTypes.TEXT("long"),
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active"
    }
  },
  {
    tableName: "doctors",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = Doctor;
