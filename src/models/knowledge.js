const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");
const { parseClinicIds, serializeClinicIds } = require("../utils/clinicIds");

const Knowledge = sequelize.define(
  "knowledges",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    /** JSON array of business clinic ids, e.g. "[1,2,5]" */
    clinicIds: {
      type: DataTypes.TEXT,
      allowNull: false,
      field: "clinic_ids",
      get() {
        return parseClinicIds(this.getDataValue("clinicIds"));
      },
      set(value) {
        const ids = parseClinicIds(value);
        this.setDataValue("clinicIds", serializeClinicIds(ids));
      }
    },
    promptKey: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "prompt_key"
    },
    /** Analyzed / edited bot knowledge text (used for bot handling). */
    knowledge: {
      type: DataTypes.TEXT("medium"),
      allowNull: false
    },
    /** Original uploaded document filename (display). */
    documentName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "document_name"
    },
    /** Relative path under uploads/knowledge/ */
    documentPath: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: "document_path"
    },
    documentMime: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "document_mime"
    },
    documentSize: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "document_size"
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active"
    }
  },
  {
    engine: "InnoDB",
    tableName: "knowledges",
    timestamps: false
  }
);

module.exports = Knowledge;
