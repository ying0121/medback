const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");
const { parseClinicIds, serializeClinicIds } = require("../utils/clinicIds");

const ConversationFlow = sequelize.define(
  "conversation_flows",
  {
    id: {
      type: DataTypes.INTEGER.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    /** JSON array of clinic ids, e.g. "[1,2,5]" */
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
    name: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    /** JSON graph: { nodes: [...], edges: [...] } */
    graph: {
      type: DataTypes.TEXT("medium"),
      allowNull: false,
      get() {
        const raw = this.getDataValue("graph");
        if (!raw) return { nodes: [], edges: [] };
        try {
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          return { nodes: [], edges: [] };
        }
      },
      set(value) {
        const payload = value && typeof value === "object" ? value : { nodes: [], edges: [] };
        this.setDataValue("graph", JSON.stringify(payload));
      }
    },
    status: {
      type: DataTypes.ENUM("active", "inactive"),
      allowNull: false,
      defaultValue: "active"
    }
  },
  {
    engine: "MyISAM",
    tableName: "conversation_flows",
    underscored: true,
    timestamps: true,
    createdAt: "created_at",
    updatedAt: "updated_at"
  }
);

module.exports = ConversationFlow;
