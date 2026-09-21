/**
 * Agent Studio: embed conversation graph on agents, agent types,
 * creation source/template, and agent_id on calls for working-time.
 */

const { addColumnIfMissing } = require("../migrationHelpers");

module.exports = {
  name: "20260322_001_agent_studio",
  async up(_qi, sequelize) {
    await addColumnIfMissing(sequelize, "agents", "agent_type", "VARCHAR(64) NULL");
    await addColumnIfMissing(sequelize, "agents", "creation_source", "VARCHAR(32) NULL");
    await addColumnIfMissing(sequelize, "agents", "template_id", "VARCHAR(128) NULL");
    await addColumnIfMissing(sequelize, "agents", "graph", "MEDIUMTEXT NULL");
    await addColumnIfMissing(sequelize, "agents", "source_brief", "TEXT NULL");
    await addColumnIfMissing(sequelize, "agents", "default_tools", "TEXT NULL");

    await addColumnIfMissing(sequelize, "calls", "agent_id", "INT UNSIGNED NULL");
    await addColumnIfMissing(sequelize, "calls", "clinic_id", "INT UNSIGNED NULL");

    try {
      await sequelize.query(`
        UPDATE agents a
        INNER JOIN conversation_flows f ON f.id = a.flow_id
        SET a.graph = f.graph
        WHERE (a.graph IS NULL OR a.graph = '' OR a.graph = 'null')
          AND f.graph IS NOT NULL
          AND f.graph != ''
      `);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(
        "[migrate] agent graph backfill skipped:",
        err?.parent?.sqlMessage || err?.message || err
      );
    }

    await sequelize.query(`
      UPDATE agents
      SET agent_type = 'concierge'
      WHERE agent_type IS NULL OR agent_type = ''
    `);
    await sequelize.query(`
      UPDATE agents
      SET creation_source = 'legacy'
      WHERE creation_source IS NULL OR creation_source = ''
    `);
  }
};
