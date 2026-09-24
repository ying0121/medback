/**
 * Medical agent template catalog (126 distinct topics).
 *
 * Each topic is a full specialty desk (not a micro-action slice).
 * Graphs resolve via resolveDetailedTemplateGraph → specialist persona +
 * full-feature intent router with divergent capability paths.
 */

const { normalizeGraph } = require("../services/agentGraphBuilder");
const { resolveDetailedTemplateGraph } = require("../services/detailedTemplateGraph");
const {
  AGENT_TEMPLATE_RECORDS,
  CORE_TOPICS,
  EXTRA_TOPICS
} = require("./agentTemplateCatalog");

/** Core 90 topics (types excluding pharmacy/lab/chronic/peds extras split). */
const AGENT_TEMPLATES = AGENT_TEMPLATE_RECORDS.filter((t) =>
  CORE_TOPICS.some((c) => c.id === t.id)
);

/** Extra 36 topics (pharmacy, lab, chronic_care, pediatrics). */
const EXTRA_AGENT_TEMPLATES = AGENT_TEMPLATE_RECORDS.filter((t) =>
  EXTRA_TOPICS.some((c) => c.id === t.id)
);

const AGENT_TEMPLATES_ALL = [...AGENT_TEMPLATES, ...EXTRA_AGENT_TEMPLATES];

function medicalizeTemplate(t) {
  if (!t || typeof t !== "object") return t;
  const description = String(t.description || "");
  const needsPatientCue =
    !/patient|clinic|medical|caregiver|clinician|nurse|physician|prescription|lab|visit/i.test(
      `${t.name} ${t.summary} ${description}`
    );
  return {
    ...t,
    summary: needsPatientCue ? `Patient care: ${t.summary || t.name}` : t.summary,
    description: needsPatientCue ? `Patient/medicine focus — ${description}` : description
  };
}

function listAgentTemplates(filter = {}) {
  const typeId =
    filter && filter.typeId != null ? String(filter.typeId).trim().toLowerCase() : "";
  const list = typeId
    ? AGENT_TEMPLATES_ALL.filter((t) => t.typeId === typeId)
    : AGENT_TEMPLATES_ALL;
  return list.map((t) => {
    const m = medicalizeTemplate(t);
    return {
      ...m,
      defaultTools: [...(m.defaultTools || [])],
      tags: [...(m.tags || [])],
      graphSpec: m.graphSpec
        ? {
            greeting: m.graphSpec.greeting,
            closing: m.graphSpec.closing,
            steps: Array.isArray(m.graphSpec.steps)
              ? m.graphSpec.steps.map((s) => ({ ...s }))
              : []
          }
        : m.graphSpec
    };
  });
}

function getAgentTemplate(id) {
  const key = String(id || "").trim();
  if (!key) return null;
  const row = AGENT_TEMPLATES_ALL.find((t) => t.id === key);
  return row ? medicalizeTemplate({ ...row, defaultTools: [...row.defaultTools], tags: [...row.tags] }) : null;
}

function resolveTemplateGraph(template) {
  if (!template) return normalizeGraph(null);
  try {
    return resolveDetailedTemplateGraph(template);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[agentTemplates] resolveTemplateGraph failed for ${template.id}: ${err.message}`
    );
    return normalizeGraph(null);
  }
}

module.exports = {
  AGENT_TEMPLATES,
  EXTRA_AGENT_TEMPLATES,
  AGENT_TEMPLATES_ALL,
  listAgentTemplates,
  getAgentTemplate,
  resolveTemplateGraph
};
