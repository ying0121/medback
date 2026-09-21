/**
 * Merge built-in system templates with custom Brain library templates (DB).
 */

const AgentBrainTemplate = require("../models/agentBrainTemplate");
const { getAgentType } = require("../constants/agentTypes");
const {
  listAgentTemplates,
  getAgentTemplate,
  resolveTemplateGraph
} = require("../constants/agentTemplates");
const { createDefaultFlowGraph, normalizeGraph } = require("./conversationFlowGraph");

function parseJsonArray(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function parseGraph(raw) {
  if (!raw) return createDefaultFlowGraph();
  if (typeof raw === "object" && Array.isArray(raw.nodes)) return normalizeGraph(raw);
  try {
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.nodes)) return normalizeGraph(parsed);
  } catch {
    /* ignore */
  }
  return createDefaultFlowGraph();
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function rowToTemplate(row, { includeGraph = false } = {}) {
  const tools = parseJsonArray(row.defaultTools);
  const tags = parseJsonArray(row.tags);
  const base = {
    id: String(row.id),
    typeId: String(row.typeId || ""),
    name: row.name || "",
    summary: row.summary || "",
    description: row.description || "",
    defaultTools: tools,
    suggestedVoice: row.suggestedVoice || "marin",
    tags,
    editable: true,
    source: row.source || "custom"
  };
  if (includeGraph) {
    return { ...base, graph: parseGraph(row.graph) };
  }
  return base;
}

function systemToSummary(t) {
  return {
    id: t.id,
    typeId: t.typeId,
    name: t.name,
    summary: t.summary,
    description: t.description,
    defaultTools: t.defaultTools || [],
    suggestedVoice: t.suggestedVoice || "marin",
    tags: t.tags || [],
    editable: false,
    source: "system"
  };
}

async function listCustomRows(typeId = null) {
  const where = typeId ? { typeId } : undefined;
  return AgentBrainTemplate.findAll({
    where,
    order: [["updated_at", "DESC"], ["name", "ASC"]]
  });
}

async function listMergedTemplates(typeId = null) {
  const system = listAgentTemplates(typeId ? { typeId } : undefined).map(systemToSummary);
  const customs = (await listCustomRows(typeId)).map((r) => rowToTemplate(r));
  // Custom ids override system if same id (unlikely); prefer customs first for visibility
  const byId = new Map();
  for (const t of system) byId.set(t.id, t);
  for (const t of customs) byId.set(t.id, t);
  return [...byId.values()];
}

async function resolveTemplateById(id) {
  const custom = await AgentBrainTemplate.findByPk(String(id || "").trim());
  if (custom) return rowToTemplate(custom, { includeGraph: true });

  const system = getAgentTemplate(id);
  if (!system) return null;
  return {
    ...systemToSummary(system),
    graph: resolveTemplateGraph(system),
    graphSpec: system.graphSpec
  };
}

async function createCustomTemplate(input = {}) {
  const name = String(input.name || "").trim();
  if (!name) return { error: "Name is required." };
  const typeId = String(input.typeId || "").trim();
  if (!getAgentType(typeId)) return { error: "Invalid agent type." };

  let id = String(input.id || "").trim() || `custom-${slugify(name)}-${Date.now().toString(36)}`;
  id = id.slice(0, 128);
  if (getAgentTemplate(id) || (await AgentBrainTemplate.findByPk(id))) {
    id = `${id}-${Date.now().toString(36)}`.slice(0, 128);
  }

  const graph = parseGraph(input.graph);
  const created = await AgentBrainTemplate.create({
    id,
    typeId,
    name,
    summary: String(input.summary || "").trim().slice(0, 512) || null,
    description: String(input.description || "").trim() || null,
    defaultTools: JSON.stringify(
      Array.isArray(input.defaultTools) ? input.defaultTools.map(String) : []
    ),
    suggestedVoice: String(input.suggestedVoice || "marin").trim() || "marin",
    tags: JSON.stringify(Array.isArray(input.tags) ? input.tags.map(String) : []),
    graph: JSON.stringify(graph),
    source: input.source === "fork" ? "fork" : "custom"
  });

  return { template: rowToTemplate(created, { includeGraph: true }) };
}

async function updateCustomTemplate(id, input = {}) {
  const row = await AgentBrainTemplate.findByPk(String(id || "").trim());
  if (!row) return { error: "Template not found.", status: 404 };

  if (input.name !== undefined) {
    const name = String(input.name || "").trim();
    if (!name) return { error: "Name is required." };
    row.name = name;
  }
  if (input.typeId !== undefined) {
    const typeId = String(input.typeId || "").trim();
    if (!getAgentType(typeId)) return { error: "Invalid agent type." };
    row.typeId = typeId;
  }
  if (input.summary !== undefined) {
    row.summary = String(input.summary || "").trim().slice(0, 512) || null;
  }
  if (input.description !== undefined) {
    row.description = String(input.description || "").trim() || null;
  }
  if (input.defaultTools !== undefined) {
    row.defaultTools = JSON.stringify(
      Array.isArray(input.defaultTools) ? input.defaultTools.map(String) : []
    );
  }
  if (input.suggestedVoice !== undefined) {
    row.suggestedVoice = String(input.suggestedVoice || "marin").trim() || "marin";
  }
  if (input.tags !== undefined) {
    row.tags = JSON.stringify(Array.isArray(input.tags) ? input.tags.map(String) : []);
  }
  if (input.graph !== undefined) {
    row.graph = JSON.stringify(parseGraph(input.graph));
  }

  await row.save();
  return { template: rowToTemplate(row, { includeGraph: true }) };
}

async function deleteCustomTemplate(id) {
  const deleted = await AgentBrainTemplate.destroy({ where: { id: String(id || "").trim() } });
  if (!deleted) return { error: "Template not found.", status: 404 };
  return { success: true };
}

module.exports = {
  listMergedTemplates,
  resolveTemplateById,
  createCustomTemplate,
  updateCustomTemplate,
  deleteCustomTemplate
};
