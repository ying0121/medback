const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

const CampaignContact = sequelize.define(
  "campaign_contacts",
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
    patientFirstName: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: "",
      field: "patient_first_name"
    },
    patientLastName: {
      type: DataTypes.STRING(128),
      allowNull: false,
      defaultValue: "",
      field: "patient_last_name"
    },
    /** Display / legacy full name */
    patientName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: "patient_name"
    },
    patientPhone: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: "patient_phone"
    },
    patientEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "patient_email"
    },
    patientDob: {
      type: DataTypes.STRING(32),
      allowNull: true,
      field: "patient_dob"
    },
    patientLanguage: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "patient_language"
    },
    patientMemberNumber: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "patient_member_number"
    },
    /** Extra columns from Excel / API as JSON */
    extra: {
      type: DataTypes.TEXT,
      allowNull: true,
      get() {
        const raw = this.getDataValue("extra");
        if (!raw) return {};
        try {
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          return {};
        }
      },
      set(value) {
        if (!value || (typeof value === "object" && !Object.keys(value).length)) {
          this.setDataValue("extra", null);
          return;
        }
        this.setDataValue("extra", JSON.stringify(value));
      }
    },
    /**
     * Call / AI outcome for this patient:
     * pending | calling | success | reject | interesting | not_interesting
     */
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending"
    },
    attemptCount: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: false,
      defaultValue: 0,
      field: "attempt_count"
    },
    lastCallAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: "last_call_at"
    },
    lastAnalysisSummary: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "last_analysis_summary"
    },
    lastError: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: "last_error"
    }
  },
  {
    engine: "MyISAM",
    tableName: "campaign_contacts",
    underscored: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = CampaignContact;
