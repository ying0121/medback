/**
 * Extra medical agent templates (pharmacy, lab, chronic_care, pediatrics).
 * Source of truth is agentTemplateCatalog.js — re-exported here for compatibility.
 */

const { EXTRA_TOPICS, toTemplateRecord } = require("./agentTemplateCatalog");

const EXTRA_AGENT_TEMPLATES = EXTRA_TOPICS.map(toTemplateRecord);

module.exports = {
  EXTRA_AGENT_TEMPLATES
};
