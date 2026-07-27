const { DataTypes, Sequelize } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const CallAnalysis = sequelize.define(
  "call_analyses",
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
      unique: true,
      field: "call_id"
    },
    callSid: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "call_sid"
    },
    clinicId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "clinic_id"
    },
    patientName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "patient_name"
    },
    patientPhoneSpoken: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "patient_phone_spoken"
    },
    callerPhone: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "caller_phone"
    },
    reasonForCall: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "reason_for_call"
    },
    symptomsConditions: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "symptoms_conditions"
    },
    helpRequested: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "help_requested"
    },
    urgency: {
      type: DataTypes.STRING(32),
      allowNull: true
    },
    sentiment: {
      type: DataTypes.STRING(32),
      allowNull: true
    },
    outcomeNextStep: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "outcome_next_step"
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    keyQuotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "key_quotes"
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    rawAnalysis: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
      field: "raw_analysis"
    },
    emailStatus: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
      field: "email_status"
    },
    emailMessageId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "email_message_id"
    },
    emailError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "email_error"
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
    tableName: "call_analyses",
    updatedAt: false,
    createdAt: "created_at",
    underscored: true
  }
);

module.exports = CallAnalysis;
