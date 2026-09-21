/**
 * Builds conversation-flow graphs from compact agent template specs.
 * Output is compatible with normalizeGraph in conversationFlowGraph.js.
 */

const {
  createDefaultFlowGraph,
  normalizeGraph
} = require("./conversationFlowGraph");
const { getFlowSubagentTool } = require("../constants/flowSubagentTools");

const LAYOUT_X = 280;
const LAYOUT_Y0 = 40;
const Y_SPACING = 120;
const SIDE_X_GAP = 280;

/**
 * @param {{
 *   greeting?: string,
 *   steps?: Array<
 *     | { type: "message", label?: string, prompt?: string }
 *     | { type: "question", label?: string, prompt?: string, options?: string[] }
 *     | { type: "tool", toolId: string, label?: string }
 *     | { type: "branch", label?: string, branches?: string[] }
 *   >,
 *   closing?: string
 * }} spec
 */
function buildAgentGraph(spec = {}) {
  const greeting = spec.greeting != null ? String(spec.greeting) : "";
  const steps = Array.isArray(spec.steps) ? spec.steps : [];
  const closing = spec.closing != null ? String(spec.closing) : "";

  const nodes = [];
  const edges = [];
  let y = LAYOUT_Y0;
  let seq = 0;
  /** @type {Array<{ source: string, sourceHandle?: string, label?: string }>} */
  let pending = [];
  /** Side-path nodes that should wire to end */
  const sideToEnd = [];

  const nextId = (prefix) => `${prefix}-${++seq}`;

  const pushNode = (id, type, data, posX = LAYOUT_X, posY = y) => {
    nodes.push({
      id,
      type,
      position: { x: posX, y: posY },
      data: {
        knowledgeIds: [],
        guideText: "",
        ...data
      }
    });
    if (posX === LAYOUT_X) {
      y = posY + Y_SPACING;
    }
    return id;
  };

  const wire = (source, target, label = "", sourceHandle) => {
    const edge = {
      id: `e-${source}-${target}-${edges.length}`,
      source,
      target,
      label: label || ""
    };
    if (sourceHandle) edge.sourceHandle = sourceHandle;
    edges.push(edge);

    if (sourceHandle) {
      const node = nodes.find((n) => n.id === source);
      if (node && node.type === "question" && Array.isArray(node.data.options)) {
        const opt = node.data.options.find((o) => o.id === sourceHandle);
        if (opt) opt.target = target;
      }
      if (node && node.type === "branch" && Array.isArray(node.data.branches)) {
        const br = node.data.branches.find((b) => b.id === sourceHandle);
        if (br) br.target = target;
      }
    }
  };

  const connectPending = (targetId) => {
    for (const p of pending) {
      wire(p.source, targetId, p.label || "", p.sourceHandle);
    }
    pending = [];
  };

  const enqueue = (source, sourceHandle, label) => {
    pending.push({ source, sourceHandle, label });
  };

  // Start
  pushNode("start", "start", { label: "Start" });
  enqueue("start");

  if (greeting) {
    const id = pushNode(nextId("msg"), "message", {
      label: "Greeting",
      prompt: greeting
    });
    connectPending(id);
    enqueue(id);
  }

  for (const raw of steps) {
    if (!raw || typeof raw !== "object") continue;
    const type = String(raw.type || "").toLowerCase();

    if (type === "message") {
      const id = pushNode(nextId("msg"), "message", {
        label: raw.label || "Message",
        prompt: raw.prompt || ""
      });
      connectPending(id);
      enqueue(id);
      continue;
    }

    if (type === "tool") {
      const toolId = String(raw.toolId || "").trim();
      const tool = getFlowSubagentTool(toolId);
      const id = pushNode(nextId("tool"), "subagent", {
        label: raw.label || tool?.name || "Function",
        toolId,
        toolName: tool?.name || "",
        toolConfig: {}
      });
      connectPending(id);
      enqueue(id);
      continue;
    }

    if (type === "question") {
      const optionLabels = Array.isArray(raw.options) ? raw.options : [];
      const qId = nextId("q");
      const options = optionLabels.map((label, i) => ({
        id: `${qId}-opt-${i}`,
        label: String(label || "").trim() || `Option ${i + 1}`,
        target: ""
      }));
      pushNode(qId, "question", {
        label: raw.label || "Question",
        prompt: raw.prompt || "",
        options
      });
      connectPending(qId);

      if (options.length === 0) {
        enqueue(qId);
      } else {
        enqueue(qId, options[0].id, options[0].label);
        for (let i = 1; i < options.length; i += 1) {
          const opt = options[i];
          const sideId = nextId("side");
          const qNode = nodes.find((n) => n.id === qId);
          const sideY = (qNode?.position?.y || y) + Y_SPACING;
          pushNode(
            sideId,
            "message",
            {
              label: opt.label,
              prompt: `Acknowledge that the caller selected "${opt.label}". Give a brief, helpful reply for that choice, offer further help if appropriate, and close politely.`
            },
            LAYOUT_X + SIDE_X_GAP * i,
            sideY
          );
          wire(qId, sideId, opt.label, opt.id);
          sideToEnd.push(sideId);
        }
      }
      continue;
    }

    if (type === "branch") {
      const branchLabels = Array.isArray(raw.branches) ? raw.branches : [];
      const bId = nextId("branch");
      const branches = branchLabels.map((label, i) => ({
        id: `${bId}-br-${i}`,
        label: String(label || "").trim() || `Path ${i + 1}`,
        target: ""
      }));
      pushNode(bId, "branch", {
        label: raw.label || "Branch",
        branches
      });
      connectPending(bId);

      if (branches.length === 0) {
        enqueue(bId);
      } else {
        enqueue(bId, branches[0].id, branches[0].label);
        for (let i = 1; i < branches.length; i += 1) {
          const br = branches[i];
          const sideId = nextId("side");
          const bNode = nodes.find((n) => n.id === bId);
          const sideY = (bNode?.position?.y || y) + Y_SPACING;
          pushNode(
            sideId,
            "message",
            {
              label: br.label,
              prompt: `Handle the "${br.label}" path briefly, then thank the caller and end the conversation.`
            },
            LAYOUT_X + SIDE_X_GAP * i,
            sideY
          );
          wire(bId, sideId, br.label, br.id);
          sideToEnd.push(sideId);
        }
      }
    }
  }

  if (closing) {
    const id = pushNode(nextId("msg"), "message", {
      label: "Closing",
      prompt: closing
    });
    connectPending(id);
    enqueue(id);
  }

  const endId = pushNode("end", "end", {
    label: "End",
    description: "Call finishes automatically"
  });
  connectPending(endId);
  for (const sideId of sideToEnd) {
    wire(sideId, endId);
  }

  return { nodes, edges };
}

module.exports = {
  buildAgentGraph,
  createDefaultFlowGraph,
  normalizeGraph
};
