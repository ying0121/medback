const { DataTypes } = require("sequelize");
const { sequelize } = require("../db/sequelize");

/**
 * Append-only HIPAA-oriented audit trail.
 * Records who accessed or changed what, when, from where.
 * Do not store passwords, full PHI payloads, or secrets in metadata.
 */
const AuditLog = sequelize.define(
  "audit_logs",
  {
    id: {
      type: DataTypes.BIGINT.UNSIGNED,
      autoIncrement: true,
      allowNull: false,
      primaryKey: true
    },
    actorUserId: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "actor_user_id"
    },
    actorEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "actor_email"
    },
    actorName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: "actor_name"
    },
    actorRole: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "actor_role"
    },
    action: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "ACCESS"
    },
    resourceType: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "system",
      field: "resource_type"
    },
    resourceId: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "resource_id"
    },
    clinicId: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "clinic_id"
    },
    outcome: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "success"
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "ip_address"
    },
    edgeIpAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: "edge_ip_address"
    },
    ipIsProxy: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "ip_is_proxy"
    },
    ipIsHosting: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: "ip_is_hosting"
    },
    countryCode: {
      type: DataTypes.STRING(8),
      allowNull: true,
      field: "country_code"
    },
    countryName: {
      type: DataTypes.STRING(128),
      allowNull: true,
      field: "country_name"
    },
    userAgent: {
      type: DataTypes.STRING(512),
      allowNull: true,
      field: "user_agent"
    },
    method: {
      type: DataTypes.STRING(16),
      allowNull: true
    },
    path: {
      type: DataTypes.STRING(512),
      allowNull: true
    },
    statusCode: {
      type: DataTypes.INTEGER.UNSIGNED,
      allowNull: true,
      field: "status_code"
    },
    summary: {
      type: DataTypes.STRING(512),
      allowNull: true
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  },
  {
    tableName: "audit_logs",
    timestamps: true,
    underscored: true,
    createdAt: "created_at",
    updatedAt: false,
    indexes: [
      { fields: ["created_at"] },
      { fields: ["actor_user_id"] },
      { fields: ["actor_email"] },
      { fields: ["action"] },
      { fields: ["resource_type"] },
      { fields: ["clinic_id"] },
      { fields: ["outcome"] }
    ]
  }
);

module.exports = AuditLog;
