const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

/**
 * One outbound campaign call attempt (history row).
 * AI analyzes the transcript after the call and stores resultType + summary.
 */
const CampaignCallHistory = sequelize.define(
  "campaign_call_histories",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    campaignId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "campaign_id"
    },
    campaignContactId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      field: "campaign_contact_id"
    },
    /** Optional link to shared calls table when a Twilio call record exists */
    callId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "call_id"
    },
    callSid: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "call_sid"
    },
    flowId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "flow_id"
    },
    attemptNumber: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 1,
      field: "attempt_number"
    },
    /** Language used for this call (from patient record) */
    language: {
      type: DataTypes.STRING(64),
      allowNull: true
    },
    /**
     * AI / dialer result:
     * pending | calling | success | reject | interesting | not_interesting
     */
    resultType: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
      field: "result_type"
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    analysisNotes: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "analysis_notes"
    },
    rawAnalysis: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
      field: "raw_analysis"
    },
    transcriptSnapshot: {
      type: DataTypes.TEXT("long"),
      allowNull: true,
      field: "transcript_snapshot"
    },
    durationSeconds: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "duration_seconds"
    },
    startedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "started_at"
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "ended_at"
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "error_message"
    }
  },
  {
    engine: "MyISAM",
    tableName: "campaign_call_histories",
    underscored: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = CampaignCallHistory;
