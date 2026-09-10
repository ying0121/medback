/**
 * Default conversation-flow graph with fixed Start and End nodes.
 * Node types: start, end, message, question, subagent, branch.
 */
const { getFlowSubagentTool } = require("../constants/flowSubagentTools");

function createDefaultFlowGraph() {
  return {
    nodes: [
      {
        id: "start",
        type: "start",
        position: { x: 280, y: 40 },
        data: { label: "Start", knowledgeIds: [], guideText: "" }
      },
      {
        id: "end",
        type: "end",
        position: { x: 280, y: 360 },
        data: {
          label: "End",
          description: "Call finishes automatically",
          knowledgeIds: [],
          guideText: ""
        }
      }
    ],
    edges: [
      {
        id: "e-start-end",
        source: "start",
        target: "end",
        label: ""
      }
    ]
  };
}

const FIXED_NODE_TYPES = new Set(["start", "end"]);
const EDITABLE_NODE_TYPES = new Set(["message", "question", "subagent", "branch"]);

function normalizeKnowledgeIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((v) => String(v).trim()).filter(Boolean))];
}

function normalizeBranches(list, prefix) {
  if (!Array.isArray(list)) return [];
  return list.map((o, i) => ({
    id: String(o.id || `${prefix}-${i}`),
    label: String(o.label || "").trim() || `Path ${i + 1}`,
    target: o.target ? String(o.target) : ""
  }));
}

function defaultLabel(type, data = {}) {
  if (data.label) return String(data.label);
  if (type === "subagent") {
    const tool = getFlowSubagentTool(data.toolId);
    return tool?.name || "Function";
  }
  if (type === "branch") return "Branch";
  if (type === "question") return "Question";
  if (type === "message") return "Message";
  if (type === "end") return "End";
  return "Start";
}

function normalizeNodeData(type, data = {}) {
  const base = {
    label: defaultLabel(type, data),
    knowledgeIds: normalizeKnowledgeIds(data.knowledgeIds),
    guideText: data.guideText != null ? String(data.guideText) : ""
  };

  if (type === "end") {
    return {
      ...base,
      description: data.description || "Call finishes automatically"
    };
  }

  if (type === "message") {
    return {
      ...base,
      prompt: data.prompt || ""
    };
  }

  if (type === "question") {
    return {
      ...base,
      prompt: data.prompt || "",
      options: normalizeBranches(data.options, "opt")
    };
  }

  if (type === "branch") {
    return {
      ...base,
      branches: normalizeBranches(data.branches || data.options, "branch")
    };
  }

  if (type === "subagent") {
    const tool = getFlowSubagentTool(data.toolId);
    return {
      ...base,
      knowledgeIds: [],
      toolId: tool?.id || String(data.toolId || "").trim(),
      toolName: tool?.name || data.toolName || "",
      toolConfig:
        data.toolConfig && typeof data.toolConfig === "object" ? data.toolConfig : {}
    };
  }

  // start
  return base;
}

function normalizeGraph(input) {
  const base = createDefaultFlowGraph();
  if (!input || typeof input !== "object") return base;

  const nodesIn = Array.isArray(input.nodes) ? input.nodes : [];
  const edgesIn = Array.isArray(input.edges) ? input.edges : [];

  const startNode = nodesIn.find((n) => n && n.type === "start") || base.nodes[0];
  const endNode = nodesIn.find((n) => n && n.type === "end") || base.nodes[1];

  const middle = nodesIn.filter(
    (n) => n && typeof n.id === "string" && EDITABLE_NODE_TYPES.has(n.type)
  );

  const nodes = [
    {
      id: "start",
      type: "start",
      position: startNode.position || { x: 280, y: 40 },
      data: normalizeNodeData("start", startNode.data || {})
    },
    ...middle.map((n) => ({
      id: String(n.id),
      type: n.type,
      position: n.position || { x: 280, y: 160 },
      data: normalizeNodeData(n.type, n.data || {})
    })),
    {
      id: "end",
      type: "end",
      position: endNode.position || { x: 280, y: 360 },
      data: normalizeNodeData("end", endNode.data || {})
    }
  ];

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges = edgesIn
    .filter(
      (e) =>
        e &&
        typeof e.source === "string" &&
        typeof e.target === "string" &&
        nodeIds.has(e.source) &&
        nodeIds.has(e.target)
    )
    .map((e, i) => ({
      id: String(e.id || `e-${e.source}-${e.target}-${i}`),
      source: String(e.source),
      target: String(e.target),
      label: e.label ? String(e.label) : "",
      sourceHandle: e.sourceHandle ? String(e.sourceHandle) : undefined
    }));

  if (!edges.some((e) => e.source === "start")) {
    edges.push({
      id: "e-start-end",
      source: "start",
      target: nodeIds.has("end") ? "end" : nodes[nodes.length - 1].id,
      label: ""
    });
  }

  return { nodes, edges };
}

function isFixedNodeId(id) {
  return id === "start" || id === "end";
}

module.exports = {
  createDefaultFlowGraph,
  normalizeGraph,
  FIXED_NODE_TYPES,
  EDITABLE_NODE_TYPES,
  isFixedNodeId
};
