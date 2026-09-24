/**
 * Builds conversation-flow graphs from compact agent template specs.
 * Output is compatible with normalizeGraph in conversationFlowGraph.js.
 *
 * Design rules:
 * - Patient-facing prompts only on message/question nodes
 * - Intent routers fan into specialized capability paths (true divergence)
 * - Non-intent questions: options rejoin main path (except escalate / emergency)
 * - Speak → wait turn taking is enforced at runtime
 */

const {
  createDefaultFlowGraph,
  normalizeGraph
} = require("./conversationFlowGraph");
const { getFlowSubagentTool } = require("../constants/flowSubagentTools");

const LAYOUT_X = 280;
const LAYOUT_Y0 = 40;
const Y_SPACING = 110;
const SIDE_X_GAP = 320;

const ESCALATE_RE = /\b(transfer|speak to|staff|human|person|operator|nurse|doctor|representative)\b/i;
const EMERGENCY_RE = /\b(911|emergency|er\b|ambulance|severe distress|chest pain|trouble breathing)\b/i;
const DONE_RE = /\b(no[, ]|i'?m done|all set|nothing else|finish|goodbye)\b/i;

/**
 * @param {{
 *   greeting?: string,
 *   steps?: Array<object>,
 *   closing?: string,
 *   persona?: object,
 *   intentCatalog?: Array<object>
 * }} spec
 */
function buildAgentGraph(spec = {}) {
  const greeting = spec.greeting != null ? String(spec.greeting).trim() : "";
  const steps = Array.isArray(spec.steps) ? spec.steps : [];
  let closing = spec.closing != null ? String(spec.closing).trim() : "";
  if (closing.endsWith("?")) {
    closing = closing.replace(/\?+\s*$/, "").trim() + ".";
  }

  const nodes = [];
  const edges = [];
  let y = LAYOUT_Y0;
  let seq = 0;
  /** @type {Array<{ source: string, sourceHandle?: string, label?: string }>} */
  let pending = [];
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

  const connectPending = (targetId, pendingList = pending) => {
    for (const p of pendingList) {
      wire(p.source, targetId, p.label || "", p.sourceHandle);
    }
  };

  const enqueue = (source, sourceHandle, label) => {
    pending.push({ source, sourceHandle, label });
  };

  /**
   * Build a linear chain of message/question/tool steps from a local pending list.
   * Returns the new pending list (outgoing from the last node).
   */
  const buildLinearChain = (chainSteps, startPending, colIndex = 0) => {
    let localPending = [...startPending];
    let localY = y;
    const posX = LAYOUT_X + SIDE_X_GAP * colIndex;

    const pushLocal = (id, type, data) => {
      nodes.push({
        id,
        type,
        position: { x: posX, y: localY },
        data: { knowledgeIds: [], guideText: "", ...data }
      });
      localY += Y_SPACING;
      return id;
    };

    const connectLocal = (targetId) => {
      for (const p of localPending) {
        wire(p.source, targetId, p.label || "", p.sourceHandle);
      }
      localPending = [];
    };

    for (const raw of chainSteps || []) {
      if (!raw || typeof raw !== "object") continue;
      const t = String(raw.type || "").toLowerCase();

      if (t === "message") {
        const id = pushLocal(nextId("msg"), "message", {
          label: raw.label || "Message",
          prompt: String(raw.prompt || "").trim(),
          guideText: String(raw.guideText || "").trim()
        });
        connectLocal(id);
        localPending = [{ source: id }];
        continue;
      }

      if (t === "tool") {
        const toolId = String(raw.toolId || "").trim();
        const tool = getFlowSubagentTool(toolId);
        const id = pushLocal(nextId("tool"), "subagent", {
          label: raw.label || tool?.name || "Function",
          toolId,
          toolName: tool?.name || "",
          toolConfig: {}
        });
        connectLocal(id);
        localPending = [{ source: id }];
        continue;
      }

      if (t === "question") {
        const optionLabels = Array.isArray(raw.options) ? raw.options : [];
        const qId = nextId("q");
        const options = optionLabels.map((label, i) => ({
          id: `${qId}-opt-${i}`,
          label: String(label || "").trim() || `Option ${i + 1}`,
          target: ""
        }));
        pushLocal(qId, "question", {
          label: raw.label || "Question",
          prompt: String(raw.prompt || "").trim(),
          options,
          guideText: String(raw.guideText || "").trim()
        });
        connectLocal(qId);

        if (!options.length) {
          localPending = [{ source: qId }];
        } else {
          const nextLocal = [];
          let sideCol = 1;
          for (const opt of options) {
            if (EMERGENCY_RE.test(opt.label)) {
              const sideId = nextId("side");
              pushLocal(sideId, "message", {
                label: opt.label,
                prompt:
                  "This may be an emergency. Please hang up and dial 911 or go to the nearest emergency room right away."
              });
              // overwrite position to side
              const n = nodes.find((x) => x.id === sideId);
              if (n) n.position.x = posX + SIDE_X_GAP * sideCol;
              wire(qId, sideId, opt.label, opt.id);
              sideToEnd.push(sideId);
              sideCol += 1;
              continue;
            }
            if (ESCALATE_RE.test(opt.label)) {
              const tool = getFlowSubagentTool("transfer_to_human");
              const sideId = nextId("tool");
              pushLocal(sideId, "subagent", {
                label: "Transfer to staff",
                toolId: "transfer_to_human",
                toolName: tool?.name || "Transfer to human",
                toolConfig: {}
              });
              const n = nodes.find((x) => x.id === sideId);
              if (n) n.position.x = posX + SIDE_X_GAP * sideCol;
              wire(qId, sideId, opt.label, opt.id);
              sideToEnd.push(sideId);
              sideCol += 1;
              continue;
            }
            nextLocal.push({ source: qId, sourceHandle: opt.id, label: opt.label });
          }
          localPending = nextLocal.length ? nextLocal : [{ source: qId }];
        }
      }
    }

    // Advance main Y so later main-path nodes sit below the tallest side column
    if (localY > y) y = localY;
    return localPending;
  };

  // Start
  const startGuide = [];
  if (spec.persona?.systemRole) {
    startGuide.push(`SPECIALIST PERSONA:\n${spec.persona.systemRole}`);
  }
  if (Array.isArray(spec.intentCatalog) && spec.intentCatalog.length) {
    startGuide.push(
      "INTENT DETECTION (critical):",
      "After greeting, detect the patient's primary intent before taking action.",
      "Match free-text to the closest intent using labels and synonyms.",
      "If ambiguous between two intents, ask one short clarifying question, then choose.",
      "Never invent an intent outside the catalog.",
      ...spec.intentCatalog.map(
        (i) =>
          `- ${i.id}: "${i.label}"${
            i.synonyms?.length ? ` (also: ${i.synonyms.join(", ")})` : ""
          }`
      )
    );
  }

  pushNode("start", "start", {
    label: "Start",
    guideText: startGuide.filter(Boolean).join("\n")
  });
  enqueue("start");

  if (greeting) {
    const id = pushNode(nextId("msg"), "message", {
      label: "Greeting",
      prompt: greeting,
      guideText: spec.persona?.tone
        ? `Tone: ${spec.persona.tone}. Stay in persona.`
        : ""
    });
    connectPending(id);
    pending = [{ source: id }];
  }

  for (const raw of steps) {
    if (!raw || typeof raw !== "object") continue;
    const type = String(raw.type || "").toLowerCase();

    if (type === "intent_router") {
      const intents = Array.isArray(raw.intents) ? raw.intents : [];
      const escalate = raw.includeEscalate !== false;
      const optionLabels = [
        ...intents.map((i) => String(i.label || i.id || "Option").trim()),
        ...(escalate ? ["Speak to staff"] : [])
      ];
      const qId = nextId("q");
      const options = optionLabels.map((label, i) => ({
        id: `${qId}-opt-${i}`,
        label,
        target: ""
      }));

      const synonymGuide = [
        "INTENT ROUTER — detect patient intent accurately.",
        "Listen to free-text; map to the closest option using synonyms.",
        "If two options fit equally, ask: “Just to confirm — did you mean A or B?”",
        "Then follow ONLY that option's path (specialized capability).",
        ...intents.map((intent, idx) => {
          const syn = Array.isArray(intent.synonyms) ? intent.synonyms.join(", ") : "";
          return `Option ${idx + 1} [${intent.id || intent.label}]: "${intent.label}"${
            syn ? ` · synonyms: ${syn}` : ""
          }`;
        })
      ].join("\n");

      pushNode(qId, "question", {
        label: raw.label || "Detect intent",
        prompt:
          String(raw.prompt || "").trim() ||
          "To help you correctly — what do you need help with today?",
        options,
        guideText: String(raw.guideText || "").trim() || synonymGuide
      });
      connectPending(qId);

      const mergePending = [];
      let col = 0;
      for (let i = 0; i < intents.length; i += 1) {
        const intent = intents[i];
        const opt = options[i];
        if (!opt) continue;
        const chain = Array.isArray(intent.steps) ? intent.steps : [];
        const pathStart = [{ source: qId, sourceHandle: opt.id, label: opt.label }];
        if (!chain.length) {
          mergePending.push(...pathStart);
          continue;
        }
        const pathEnd = buildLinearChain(chain, pathStart, col);
        mergePending.push(...pathEnd);
        col += 1;
      }

      // Escalate option → transfer side
      if (escalate) {
        const opt = options[options.length - 1];
        if (opt && ESCALATE_RE.test(opt.label)) {
          const tool = getFlowSubagentTool("transfer_to_human");
          const sideId = nextId("tool");
          pushNode(
            sideId,
            "subagent",
            {
              label: "Transfer to staff",
              toolId: "transfer_to_human",
              toolName: tool?.name || "Transfer to human",
              toolConfig: {}
            },
            LAYOUT_X + SIDE_X_GAP * (col + 1),
            y
          );
          wire(qId, sideId, opt.label, opt.id);
          sideToEnd.push(sideId);
        }
      }

      pending = mergePending.length ? mergePending : [{ source: qId }];
      continue;
    }

    if (type === "message") {
      const id = pushNode(nextId("msg"), "message", {
        label: raw.label || "Message",
        prompt: String(raw.prompt || "").trim(),
        guideText: String(raw.guideText || "").trim()
      });
      connectPending(id);
      pending = [{ source: id }];
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
      pending = [{ source: id }];
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
        prompt: String(raw.prompt || "").trim(),
        options,
        guideText: String(raw.guideText || "").trim()
      });
      connectPending(qId);

      if (options.length === 0) {
        pending = [{ source: qId }];
      } else {
        const qNode = nodes.find((n) => n.id === qId);
        let sideCol = 1;
        const nextPending = [];
        for (const opt of options) {
          if (EMERGENCY_RE.test(opt.label)) {
            const sideId = nextId("side");
            const sideY = (qNode?.position?.y || y) + Y_SPACING;
            pushNode(
              sideId,
              "message",
              {
                label: opt.label,
                prompt:
                  "This may be an emergency. Please hang up and dial 911 or go to the nearest emergency room right away. If you can stay on the line, I can connect you to staff."
              },
              LAYOUT_X + SIDE_X_GAP * sideCol,
              sideY
            );
            wire(qId, sideId, opt.label, opt.id);
            sideToEnd.push(sideId);
            sideCol += 1;
            continue;
          }
          if (ESCALATE_RE.test(opt.label)) {
            const tool = getFlowSubagentTool("transfer_to_human");
            const sideId = nextId("tool");
            const sideY = (qNode?.position?.y || y) + Y_SPACING;
            pushNode(
              sideId,
              "subagent",
              {
                label: "Transfer to staff",
                toolId: "transfer_to_human",
                toolName: tool?.name || "Transfer to human",
                toolConfig: {}
              },
              LAYOUT_X + SIDE_X_GAP * sideCol,
              sideY
            );
            wire(qId, sideId, opt.label, opt.id);
            sideToEnd.push(sideId);
            sideCol += 1;
            continue;
          }
          nextPending.push({ source: qId, sourceHandle: opt.id, label: opt.label });
        }
        pending = nextPending.length ? nextPending : [{ source: qId }];
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
      pending = branches.length
        ? branches.map((br) => ({ source: bId, sourceHandle: br.id, label: br.label }))
        : [{ source: bId }];
    }
  }

  if (closing) {
    const id = pushNode(nextId("msg"), "message", {
      label: "Closing",
      prompt: closing
    });
    connectPending(id);
    pending = [{ source: id }];
  }

  const endId = pushNode("end", "end", {
    label: "End",
    description: "Call finishes after farewell"
  });
  connectPending(endId);
  for (const sideId of sideToEnd) {
    wire(sideId, endId);
  }

  const graph = { nodes, edges };
  if (spec.persona && typeof spec.persona === "object") {
    graph.persona = spec.persona;
  }
  if (Array.isArray(spec.intentCatalog)) {
    graph.intentCatalog = spec.intentCatalog;
  }
  return graph;
}

module.exports = {
  buildAgentGraph,
  createDefaultFlowGraph,
  normalizeGraph,
  ESCALATE_RE,
  EMERGENCY_RE,
  DONE_RE
};
