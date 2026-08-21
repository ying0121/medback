const { DataTypes, Sequelize } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const Appointment = sequelize.define(
  "appointments",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    clinicId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "clinic_id"
    },
    conversationId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "conversation_id"
    },
    callId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "call_id"
    },
    source: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "chat"
    },
    patientName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "patient_name"
    },
    patientEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "patient_email"
    },
    patientPhone: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "patient_phone"
    },
    patientDob: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: "patient_dob"
    },
    patientType: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: "patient_type"
    },
    startsAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "starts_at"
    },
    endsAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: "ends_at"
    },
    meetLink: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: "meet_link"
    },
    googleEventId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "google_event_id"
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "scheduled"
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
    tableName: "appointments",
    updatedAt: false,
    createdAt: "created_at",
    underscored: true
  }
);

module.exports = Appointment;
