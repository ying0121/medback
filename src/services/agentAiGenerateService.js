/**
 * Generate an agent draft (type, tools, graph, copy) from a natural-language brief.
 * Supports combining multiple catalog / Brain-library templates into one brain.
 */

const OpenAI = require("openai");
const { listAgentTypes, getAgentType } = require("../constants/agentTypes");
const { listAgentTemplates, resolveTemplateGraph, getAgentTemplate } = require("../constants/agentTemplates");
const { resolveTemplateById, listMergedTemplates } = require("./agentBrainTemplateService");
const { buildAgentGraph, normalizeGraph } = require("./agentGraphBuilder");
const { FLOW_SUBAGENT_TOOLS } = require("../constants/flowSubagentTools");

const envKey = () => String(process.env.OPENAI_API_KEY || "").trim();
const envModel = () => String(process.env.OPENAI_MODEL || "gpt-4.1-mini").trim();

const MAX_COMBINE = 8;
const MAX_STEPS_PER_SOURCE = 6;

function parseJsonObject(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function cleanTitle(value) {
  const s = String(value || "").trim();
  return s ? s.slice(0, 120) : "";
}

function uniqStrings(list) {
  const out = [];
  const seen = new Set();
  for (const raw of list || []) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Capability domains → keywords used to decide when a brief needs template combining */
const CAPABILITY_HINTS = [
  {
    typeId: "pharmacy",
    words: ["pharmacy", "refill", "prescription", "medication", "rx", "dose", "drug"]
  },
  {
    typeId: "lab",
    words: ["lab", "blood draw", "fasting", "imaging", "results ready", "diagnostic", "specimen"]
  },
  {
    typeId: "chronic_care",
    words: ["diabetes", "hypertension", "asthma", "copd", "chronic", "home monitor", "care plan"]
  },
  {
    typeId: "pediatrics",
    words: ["pediatric", "child", "well-child", "newborn", "school form", "sports physical", "infant"]
  },
  {
    typeId: "billing",
    words: ["bill", "payment", "copay", "coinsurance", "insurance denial", "balance", "statement", "estimate"]
  },
  {
    typeId: "scheduler",
    words: [
      "book",
      "schedule",
      "scheduling",
      "appoint",
      "appointment",
      "reschedule",
      "cancel visit",
      "availability",
      "slot"
    ]
  },
  {
    typeId: "triage",
    words: ["symptom", "triage", "nurse", "urgent", "chest pain", "fever", "sick", "red flag"]
  },
  {
    typeId: "intake",
    words: ["intake", "new patient", "demograph", "consent", "hipaa", "insurance card", "registration"]
  },
  {
    typeId: "followup",
    words: ["follow-up", "follow up", "adherence", "post-op", "post op", "recovery check", "care check-in"]
  },
  {
    typeId: "referral",
    words: ["referral", "specialist", "records transfer", "second opinion", "prior auth"]
  },
  {
    typeId: "campaign",
    words: ["campaign", "outbound", "reminder blast", "recall", "outreach", "care gap"]
  },
  {
    typeId: "afterhours",
    words: ["after hours", "after-hours", "on-call", "weekend", "holiday", "closed", "night"]
  },
  {
    typeId: "concierge",
    words: ["concierge", "navigator", "full service", "orchestrat", "vip", "coordinate"]
  },
  {
    typeId: "receptionist",
    words: ["hours", "direction", "front desk", "parking", "greeting", "faq", "location"]
  }
];

const EXPLICIT_COMBINE_RE =
  /\b(combin(e|ed|ing)|merge[sd]?|multi[- ]?(template|agent|skill|capabilit)|all[- ]in[- ]one|plus\b|as well as|in addition to|and also|together with|bundle|hybrid)\b/i;

function detectMatchedCapabilities(brief) {
  const text = String(brief || "").toLowerCase();
  const matched = [];
  for (const cap of CAPABILITY_HINTS) {
    const hits = cap.words.filter((w) => text.includes(w));
    if (hits.length) matched.push({ typeId: cap.typeId, hits, score: hits.length });
  }
  matched.sort((a, b) => b.score - a.score);
  return matched;
}

function briefRequestsCombine(brief) {
  const text = String(brief || "");
  if (EXPLICIT_COMBINE_RE.test(text)) return true;
  // Multiple distinct capability domains in one brief → combine is required
  return detectMatchedCapabilities(text).length >= 2;
}

function scoreTemplateAgainstBrief(template, briefLower, preferredTypeId) {
  const hay = [template.name, template.summary, template.description, ...(template.tags || [])]
    .join(" ")
    .toLowerCase();
  let score = 0;
  const words = briefLower
    .split(/[^a-z0-9+]+/i)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4);
  const uniqueWords = [...new Set(words)].slice(0, 40);
  for (const w of uniqueWords) {
    if (hay.includes(w)) score += 2;
  }
  for (const tag of template.tags || []) {
    if (briefLower.includes(String(tag).toLowerCase())) score += 3;
  }
  if (preferredTypeId && template.typeId === preferredTypeId) score += 1;
  // Prefer templates whose type matched capability hints
  const caps = detectMatchedCapabilities(briefLower);
  const cap = caps.find((c) => c.typeId === template.typeId);
  if (cap) score += 4 + cap.score;
  return score;
}

/**
 * Infer which catalog templates should be combined for this brief.
 * Returns ranked template ids (may be empty).
 */
function inferCombineTemplateIds(brief, { preferredTypeId = null, limit = 5 } = {}) {
  const text = String(brief || "").trim();
  if (!text) return { ids: [], required: false, matchedCapabilities: [] };

  const matchedCapabilities = detectMatchedCapabilities(text);
  const required = briefRequestsCombine(text);
  const all = listAgentTemplates();

  // Score every template; keep best per matched capability type, then fill
  const scored = all
    .map((t) => ({
      id: t.id,
      typeId: t.typeId,
      score: scoreTemplateAgainstBrief(t, text.toLowerCase(), preferredTypeId)
    }))
    .filter((t) => t.score > 0)
    .sort((a, b) => b.score - a.score);

  const ids = [];
  const usedTypes = new Set();

  // First: one strong template per matched capability domain
  for (const cap of matchedCapabilities) {
    const best = scored.find((t) => t.typeId === cap.typeId && !ids.includes(t.id));
    if (best) {
      ids.push(best.id);
      usedTypes.add(best.typeId);
    }
    if (ids.length >= limit) break;
  }

  // If user asked to combine but we still have <2, pull next highest scores across types
  if (required || matchedCapabilities.length >= 2) {
    for (const t of scored) {
      if (ids.includes(t.id)) continue;
      // Prefer a different type so combine spans capabilities
      if (usedTypes.has(t.typeId)) continue;
      ids.push(t.id);
      usedTypes.add(t.typeId);
      if (ids.length >= Math.min(limit, Math.max(2, matchedCapabilities.length + 1))) break;
    }
  }

  // Explicit combine language with only one domain still → add a complementary different-type template
  if ((EXPLICIT_COMBINE_RE.test(text) || required) && ids.length < 2) {
    for (const t of scored) {
      if (ids.includes(t.id)) continue;
      if (usedTypes.has(t.typeId)) continue;
      ids.push(t.id);
      usedTypes.add(t.typeId);
      if (ids.length >= 2) break;
    }
  }

  // Last resort: allow same-type second pick if nothing else scored
  if ((EXPLICIT_COMBINE_RE.test(text) || required) && ids.length < 2) {
    for (const t of scored) {
      if (!ids.includes(t.id)) {
        ids.push(t.id);
        if (ids.length >= 2) break;
      }
    }
  }

  return {
    ids: uniqStrings(ids).slice(0, limit),
    required: required || ids.length >= 2,
    matchedCapabilities: matchedCapabilities.map((c) => c.typeId)
  };
}

function extractStepsFromGraphSpec(template) {
  const spec = template?.graphSpec && typeof template.graphSpec === "object" ? template.graphSpec : null;
  if (!spec || !Array.isArray(spec.steps)) return [];
  return spec.steps
    .filter((s) => s && typeof s === "object")
    .slice(0, MAX_STEPS_PER_SOURCE)
    .map((s) => ({
      type: String(s.type || "message").toLowerCase(),
      label: String(s.label || "").trim(),
      prompt: String(s.prompt || "").trim(),
      toolId: s.toolId ? String(s.toolId) : undefined,
      options: Array.isArray(s.options) ? s.options.map(String) : undefined,
      branches: Array.isArray(s.branches) ? s.branches.map(String) : undefined,
      fromTemplate: template.id
    }));
}

function extractStepsFromGraph(template) {
  const nodes = Array.isArray(template?.graph?.nodes) ? template.graph.nodes : [];
  const steps = [];
  for (const node of nodes) {
    if (!node || ["start", "end"].includes(node.type)) continue;
    if (steps.length >= MAX_STEPS_PER_SOURCE) break;
    const data = node.data || {};
    if (node.type === "message") {
      steps.push({
        type: "message",
        label: String(data.label || "Message").trim(),
        prompt: String(data.prompt || data.guideText || "").trim(),
        fromTemplate: template.id
      });
    } else if (node.type === "question") {
      steps.push({
        type: "question",
        label: String(data.label || "Question").trim(),
        prompt: String(data.prompt || "").trim(),
        options: Array.isArray(data.options)
          ? data.options.map((o) => String(o.label || o.id || "").trim()).filter(Boolean)
          : undefined,
        fromTemplate: template.id
      });
    } else if (node.type === "subagent" || node.type === "tool") {
      steps.push({
        type: "tool",
        label: String(data.label || data.toolName || "Tool").trim(),
        toolId: String(data.toolId || "").trim() || undefined,
        fromTemplate: template.id
      });
    } else if (node.type === "branch") {
      steps.push({
        type: "branch",
        label: String(data.label || "Branch").trim(),
        branches: Array.isArray(data.branches)
          ? data.branches.map((b) => String(b.label || b.id || "").trim()).filter(Boolean)
          : undefined,
        fromTemplate: template.id
      });
    }
  }
  return steps;
}

function compactTemplateForAi(template) {
  const steps = extractStepsFromGraphSpec(template);
  const fromGraph = steps.length ? steps : extractStepsFromGraph(template);
  return {
    id: template.id,
    typeId: template.typeId,
    name: template.name,
    summary: template.summary || "",
    description: String(template.description || "").slice(0, 600),
    defaultTools: [...(template.defaultTools || [])],
    suggestedVoice: template.suggestedVoice || "marin",
    tags: [...(template.tags || [])],
    keySteps: fromGraph.map((s) => ({
      type: s.type,
      label: s.label,
      prompt: String(s.prompt || "").slice(0, 220),
      toolId: s.toolId,
      options: s.options,
      branches: s.branches
    }))
  };
}

async function resolveCombineTemplates(ids = []) {
  const unique = uniqStrings(ids).slice(0, MAX_COMBINE);
  const resolved = [];
  for (const id of unique) {
    try {
      const t = await resolveTemplateById(id);
      if (t) resolved.push(t);
    } catch {
      /* skip */
    }
  }
  return resolved;
}

/**
 * Deterministic merge when OpenAI is unavailable or returns weak steps.
 * Builds a routing question across capabilities, then stitches key steps from each source.
 */
function mergeTemplatesIntoGraph(templates, brief, options = {}) {
  const list = Array.isArray(templates) ? templates.filter(Boolean) : [];
  if (!list.length) return null;

  const names = list.map((t) => t.name);
  const greeting =
    String(list[0]?.graphSpec?.greeting || "").trim() ||
    `Thank you for contacting the medical clinic. I'm a combined care assistant covering: ${names.join(", ")}. How can I help the patient today?`;

  const closing =
    String(list[list.length - 1]?.graphSpec?.closing || "").trim() ||
    "Thank you for trusting our clinic with your care. If this is an emergency, call emergency services. Goodbye.";

  const capabilityOptions = list.map((t) => t.name).slice(0, 6);
  if (capabilityOptions.length < 6) {
    capabilityOptions.push("Something else", "Speak to clinical staff");
  }

  const steps = [
    {
      type: "message",
      label: "Combined mission",
      prompt: `You are a single outpatient medical agent that combines capabilities from: ${names.join(
        "; "
      )}. Patient brief: ${String(brief || "")
        .trim()
        .slice(0, 400)}. Stay medicine- and patient-focused. Do not diagnose or prescribe. Emergencies → emergency services / warm transfer.`
    },
    {
      type: "question",
      label: "Capability needed",
      prompt: "What does the patient need help with today?",
      options: capabilityOptions
    }
  ];

  for (const tpl of list) {
    steps.push({
      type: "message",
      label: `Mode: ${tpl.name}`,
      prompt: `Switch into “${tpl.name}” (${tpl.typeId}) mode. Purpose: ${
        tpl.summary || tpl.description || tpl.name
      }. Follow that template’s clinical boundaries.`
    });
    const keySteps = extractStepsFromGraphSpec(tpl);
    const fromGraph = keySteps.length ? keySteps : extractStepsFromGraph(tpl);
    for (const s of fromGraph.slice(0, 4)) {
      if (s.type === "tool" && !s.toolId) continue;
      steps.push({
        type: s.type,
        label: s.label || tpl.name,
        prompt: s.prompt,
        toolId: s.toolId,
        options: s.options,
        branches: s.branches
      });
    }
  }

  steps.push({
    type: "message",
    label: "Cross-check & next step",
    prompt:
      "Summarize what you will do for the patient across the capabilities used. Offer booking, messaging, or transfer if still needed."
  });
  steps.push({
    type: "tool",
    toolId: "transfer_to_human",
    label: "Transfer to clinical staff"
  });

  const tools = uniqStrings([
    ...(options.mustHaveTools || []),
    ...list.flatMap((t) => t.defaultTools || []),
    "transfer_to_human"
  ]);

  const primaryType =
    getAgentType(options.preferredTypeId) ||
    getAgentType(list[0].typeId) ||
    listAgentTypes()[0];

  return {
    title:
      cleanTitle(options.titleHint) ||
      `Combined ${primaryType?.name || "care"} assistant`,
    description:
      String(brief || "").trim().slice(0, 2000) ||
      `Patient agent combining: ${names.join(", ")}.`,
    agentType: primaryType.id,
    defaultTools: tools.filter((id) => FLOW_SUBAGENT_TOOLS.some((t) => t.id === id)),
    openaiVoice: list[0]?.suggestedVoice || "marin",
    templateId: list[0]?.id || null,
    combinedTemplateIds: list.map((t) => t.id),
    graph: normalizeGraph(buildAgentGraph({ greeting, steps, closing })),
    rationale: `Combined ${list.length} templates (${names.join(
      ", "
    )}) into one patient-facing agent so the bot can use features from each source brain.`,
    source: "fallback-combine"
  };
}

function fallbackFromBrief(brief, options = {}, combineTemplates = []) {
  let list = Array.isArray(combineTemplates) ? combineTemplates.filter(Boolean) : [];

  // Auto-infer combine set when none (or only one) supplied but brief needs multi-capability
  if (list.length < 2) {
    const inferred = inferCombineTemplateIds(brief, {
      preferredTypeId: options.preferredTypeId,
      limit: 5
    });
    if (inferred.required && inferred.ids.length >= 2) {
      const extra = inferred.ids
        .map((id) => getAgentTemplate(id))
        .filter(Boolean)
        .map((t) => ({ ...t, graph: resolveTemplateGraph(t) }));
      const byId = new Map(list.map((t) => [t.id, t]));
      for (const t of extra) if (!byId.has(t.id)) byId.set(t.id, t);
      list = [...byId.values()].slice(0, MAX_COMBINE);
    }
  }

  if (list.length >= 2) {
    const merged = mergeTemplatesIntoGraph(list, brief, options);
    if (merged) return merged;
  }
  if (list.length === 1) {
    const template = list[0];
    const type = getAgentType(options.preferredTypeId) || getAgentType(template.typeId) || listAgentTypes()[0];
    return {
      title: cleanTitle(options.titleHint) || template.name || `${type.name} assistant`,
      description:
        String(brief || "").trim().slice(0, 2000) ||
        template.description ||
        type.longDescription,
      agentType: type.id,
      defaultTools: uniqStrings([
        ...(options.mustHaveTools || []),
        ...(template.defaultTools || type.defaultTools || [])
      ]),
      openaiVoice: template.suggestedVoice || "marin",
      templateId: template.id,
      combinedTemplateIds: [template.id],
      graph: template.graph || resolveTemplateGraph(getAgentTemplate(template.id) || template),
      rationale: `Started from template “${template.name}” based on your brief. Refine the brain canvas before publishing.`,
      source: "fallback"
    };
  }

  const text = String(brief || "").toLowerCase();
  const types = listAgentTypes();
  let typeId = options.preferredTypeId || "receptionist";
  for (const cap of CAPABILITY_HINTS) {
    if (cap.words.some((w) => text.includes(w))) {
      typeId = cap.typeId;
      break;
    }
  }
  const type = getAgentType(typeId) || types[0];
  const templates = listAgentTemplates({ typeId: type.id });
  const template = templates[0] || listAgentTemplates()[0];
  const graph = template
    ? resolveTemplateGraph(template)
    : normalizeGraph(
        buildAgentGraph({
          greeting: "Hello, thank you for contacting the clinic. How can I help you today?",
          steps: [{ type: "tool", toolId: "transfer_to_human", label: "Transfer" }],
          closing: "Thank you for calling. Goodbye."
        })
      );

  return {
    title: cleanTitle(options.titleHint) || `${type.name} assistant`,
    description:
      String(brief || "").trim().slice(0, 2000) ||
      type.longDescription ||
      type.shortDescription,
    agentType: type.id,
    defaultTools: uniqStrings([...(options.mustHaveTools || []), ...(type.defaultTools || [])]),
    openaiVoice: template?.suggestedVoice || "marin",
    templateId: template?.id || null,
    combinedTemplateIds: template?.id ? [template.id] : [],
    graph,
    rationale: `Matched type “${type.name}” from your description and started from template “${
      template?.name || "default"
    }”.`,
    source: "fallback"
  };
}

async function generateAgentFromBrief({
  brief,
  preferredTypeId = null,
  titleHint = "",
  channels = [],
  mustHaveTools = [],
  tone = "",
  languages = [],
  combineTemplateIds = [],
  apiKey = null
} = {}) {
  const description = String(brief || "").trim();
  if (!description) {
    return { error: "Description is required to generate an agent." };
  }

  const inference = inferCombineTemplateIds(description, {
    preferredTypeId,
    limit: MAX_COMBINE
  });
  const userPickedIds = uniqStrings(combineTemplateIds);
  // User picks win; fill remaining slots with inferred ids when combine is needed or user asked
  const mustCombine =
    inference.required ||
    userPickedIds.length >= 2 ||
    EXPLICIT_COMBINE_RE.test(description);

  let resolvedIds = [...userPickedIds];
  if (mustCombine || inference.ids.length >= 2) {
    for (const id of inference.ids) {
      if (!resolvedIds.includes(id)) resolvedIds.push(id);
      if (resolvedIds.length >= MAX_COMBINE) break;
    }
  }
  // If combine is required but we still only have 0–1, force inferred set
  if (mustCombine && resolvedIds.length < 2 && inference.ids.length >= 2) {
    resolvedIds = inference.ids.slice(0, MAX_COMBINE);
  }

  let combineTemplates = await resolveCombineTemplates(resolvedIds);
  const key = String(apiKey || envKey() || "").trim();
  if (!key) {
    return {
      draft: fallbackFromBrief(
        description,
        { preferredTypeId, titleHint, mustHaveTools },
        combineTemplates
      )
    };
  }

  const typeCatalog = listAgentTypes().map((t) => ({
    id: t.id,
    name: t.name,
    complexity: t.complexity,
    shortDescription: t.shortDescription,
    defaultTools: t.defaultTools
  }));
  const toolIds = FLOW_SUBAGENT_TOOLS.map((t) => t.id);

  let catalogHints = [];
  try {
    catalogHints = (await listMergedTemplates())
      .slice(0, 100)
      .map((t) => ({
        id: t.id,
        typeId: t.typeId,
        name: t.name,
        summary: t.summary,
        tags: t.tags || []
      }));
  } catch {
    catalogHints = listAgentTemplates()
      .slice(0, 100)
      .map((t) => ({
        id: t.id,
        typeId: t.typeId,
        name: t.name,
        summary: t.summary,
        tags: t.tags || []
      }));
  }

  const selectedForAi = combineTemplates.map(compactTemplateForAi);
  const combining = mustCombine || selectedForAi.length >= 2;

  const system = [
    "You design medical clinic voice/chat agents for MedBot.",
    "Return ONLY valid JSON with this shape:",
    JSON.stringify({
      title: "string",
      description: "string",
      agentType: "primary type id from catalog",
      defaultTools: ["tool ids"],
      openaiVoice: "marin|cedar|alloy|verse|ballad|...",
      nearestTemplateId: "primary template id or null",
      combinedTemplateIds: ["ids of templates whose features you merged"],
      greeting: "opening spoken line",
      steps: [
        {
          type: "message|question|tool|branch",
          label: "",
          prompt: "",
          toolId: "",
          options: [],
          branches: []
        }
      ],
      closing: "goodbye line",
      rationale: "explain which template capabilities were combined and why"
    }),
    "Every agent must be medicine- and patient-focused (outpatient clinic / caregiver).",
    combining
      ? [
          "CRITICAL — COMBINE MODE IS REQUIRED.",
          "The brief asks to combine templates OR spans multiple patient-care capabilities.",
          "You MUST merge features from MULTIPLE templates into ONE conversation brain.",
          "Use selectedTemplatesToCombine when provided; otherwise pick 2–5 from templateHints / suggestedCombineTemplateIds.",
          "Early in the flow include a routing question covering each capability area.",
          "Then add concrete steps (messages, questions, tools) for EACH capability.",
          "Union tools from all combined templates plus must-have tools.",
          "Set combinedTemplateIds to every template id you merged (2+ required).",
          "Aim for 10–18 steps — not a shallow single-template clone."
        ].join(" ")
      : [
          "Prefer a single best template when the brief is one narrow job.",
          "BUT if the brief mentions multiple distinct clinic jobs (e.g. triage AND booking AND refills),",
          "you MUST switch to combine mode: put 2–5 template ids in combinedTemplateIds and design a merged brain (10–18 steps).",
          "When the user says combine/merge/multi-capability, always combine."
        ].join(" "),
    "Use only allowed tool ids. Red-flag symptoms must transfer_to_human. Never invent non-medical business bot types."
  ].join("\n");

  const user = JSON.stringify({
    brief: description,
    preferredTypeId,
    titleHint,
    channels,
    mustHaveTools,
    tone,
    languages,
    typeCatalog,
    allowedTools: toolIds,
    templateHints: catalogHints,
    selectedTemplatesToCombine: selectedForAi,
    suggestedCombineTemplateIds: inference.ids,
    matchedCapabilities: inference.matchedCapabilities,
    combineMode: combining,
    combineRequired: mustCombine,
    userExplicitlyPickedTemplates: userPickedIds.length > 0
  });

  try {
    const client = new OpenAI({ apiKey: key });
    const completion = await client.chat.completions.create({
      model: envModel(),
      temperature: combining ? 0.35 : 0.4,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ]
    });
    const parsed = parseJsonObject(completion.choices?.[0]?.message?.content);
    if (!parsed) {
      return {
        draft: fallbackFromBrief(
          description,
          { preferredTypeId, titleHint, mustHaveTools },
          combineTemplates
        )
      };
    }

    const type =
      getAgentType(parsed.agentType) ||
      getAgentType(preferredTypeId) ||
      (combineTemplates[0] ? getAgentType(combineTemplates[0].typeId) : null) ||
      listAgentTypes()[0];

    let tools = Array.isArray(parsed.defaultTools)
      ? parsed.defaultTools.map(String).filter((id) => toolIds.includes(id))
      : [...(type.defaultTools || [])];
    for (const id of mustHaveTools || []) {
      if (toolIds.includes(String(id)) && !tools.includes(String(id))) tools.push(String(id));
    }

    let aiCombinedIds = uniqStrings([
      ...(Array.isArray(parsed.combinedTemplateIds) ? parsed.combinedTemplateIds : []),
      ...combineTemplates.map((t) => t.id),
      ...(mustCombine ? inference.ids : [])
    ]).slice(0, MAX_COMBINE);

    // If combine required but model returned <2, force inferred / selected set
    if (mustCombine && aiCombinedIds.length < 2) {
      aiCombinedIds = uniqStrings([...resolvedIds, ...inference.ids]).slice(0, MAX_COMBINE);
    }

    // Resolve any AI-picked templates not already loaded
    if (aiCombinedIds.length) {
      const more = await resolveCombineTemplates(aiCombinedIds);
      const byId = new Map(combineTemplates.map((t) => [t.id, t]));
      for (const t of more) byId.set(t.id, t);
      combineTemplates = [...byId.values()];
    }

    for (const tpl of combineTemplates) {
      for (const id of tpl.defaultTools || []) {
        if (toolIds.includes(String(id)) && !tools.includes(String(id))) tools.push(String(id));
      }
    }

    const nearest = parsed.nearestTemplateId
      ? combineTemplates.find((t) => t.id === parsed.nearestTemplateId) ||
        (await resolveTemplateById(parsed.nearestTemplateId)) ||
        getAgentTemplate(parsed.nearestTemplateId)
      : combineTemplates[0] || null;

    const stepCount = Array.isArray(parsed.steps) ? parsed.steps.length : 0;
    const shouldForceMerge =
      (mustCombine || combineTemplates.length >= 2) &&
      (stepCount < Math.max(8, combineTemplates.length * 2) || combineTemplates.length >= 2);

    let graph;
    if (shouldForceMerge && combineTemplates.length >= 2) {
      const merged = mergeTemplatesIntoGraph(combineTemplates, description, {
        preferredTypeId: type.id,
        titleHint,
        mustHaveTools: tools
      });
      if (merged) {
        // Prefer AI copy/rationale when present; keep merged graph for capability coverage
        const aiGraph =
          stepCount >= Math.max(10, combineTemplates.length * 3)
            ? normalizeGraph(
                buildAgentGraph({
                  greeting:
                    String(parsed.greeting || "").trim() ||
                    "Hello, thank you for contacting the clinic. How can I help you today?",
                  steps: parsed.steps.map((s) => ({
                    type: s.type,
                    label: s.label,
                    prompt: s.prompt,
                    toolId: s.toolId,
                    options: s.options,
                    branches: s.branches
                  })),
                  closing:
                    String(parsed.closing || "").trim() ||
                    "Thank you for contacting us. Goodbye."
                })
              )
            : merged.graph;

        return {
          draft: {
            ...merged,
            title: cleanTitle(parsed.title) || merged.title,
            description: String(parsed.description || merged.description).trim().slice(0, 4000),
            agentType: type.id,
            defaultTools: tools.length ? tools : merged.defaultTools,
            openaiVoice:
              String(parsed.openaiVoice || merged.openaiVoice || "marin").trim() || "marin",
            templateId: nearest?.id || merged.templateId,
            combinedTemplateIds: aiCombinedIds.length
              ? aiCombinedIds
              : merged.combinedTemplateIds,
            graph: aiGraph,
            rationale:
              String(parsed.rationale || "").trim() ||
              merged.rationale,
            source: "ai-combine"
          }
        };
      }
    }

    if (stepCount > 0) {
      graph = normalizeGraph(
        buildAgentGraph({
          greeting:
            String(parsed.greeting || "").trim() ||
            "Hello, thank you for contacting the clinic. How can I help you today?",
          steps: parsed.steps.map((s) => ({
            type: s.type,
            label: s.label,
            prompt: s.prompt,
            toolId: s.toolId,
            options: s.options,
            branches: s.branches
          })),
          closing:
            String(parsed.closing || "").trim() ||
            "Thank you for contacting us. Goodbye."
        })
      );
    } else if (combineTemplates.length >= 1) {
      const merged = mergeTemplatesIntoGraph(combineTemplates, description, {
        preferredTypeId: type.id,
        titleHint,
        mustHaveTools: tools
      });
      if (merged) {
        return {
          draft: {
            ...merged,
            title: cleanTitle(parsed.title) || merged.title,
            description: String(parsed.description || merged.description).trim().slice(0, 4000),
            agentType: type.id,
            defaultTools: tools.length ? tools : merged.defaultTools,
            openaiVoice:
              String(parsed.openaiVoice || merged.openaiVoice || "marin").trim() || "marin",
            combinedTemplateIds: aiCombinedIds.length
              ? aiCombinedIds
              : merged.combinedTemplateIds,
            rationale: String(parsed.rationale || "").trim() || merged.rationale,
            source: aiCombinedIds.length > 1 ? "ai-combine" : "ai"
          }
        };
      }
    } else if (nearest) {
      graph =
        nearest.graph ||
        resolveTemplateGraph(getAgentTemplate(nearest.id) || nearest);
    } else {
      return {
        draft: fallbackFromBrief(description, {
          preferredTypeId: type.id,
          titleHint,
          mustHaveTools
        })
      };
    }

    return {
      draft: {
        title: cleanTitle(parsed.title) || cleanTitle(titleHint) || `${type.name} assistant`,
        description: String(parsed.description || description).trim().slice(0, 4000),
        agentType: type.id,
        defaultTools: tools,
        openaiVoice:
          String(parsed.openaiVoice || nearest?.suggestedVoice || "marin").trim() || "marin",
        templateId: nearest?.id || combineTemplates[0]?.id || null,
        combinedTemplateIds: aiCombinedIds,
        graph,
        rationale:
          String(parsed.rationale || "").trim() ||
          (aiCombinedIds.length > 1
            ? `Combined ${aiCombinedIds.length} templates into one patient agent.`
            : ""),
        source: aiCombinedIds.length > 1 ? "ai-combine" : "ai"
      }
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[agentAiGenerate] falling back:", err?.message || err);
    return {
      draft: fallbackFromBrief(
        description,
        { preferredTypeId, titleHint, mustHaveTools },
        combineTemplates
      )
    };
  }
}

module.exports = {
  generateAgentFromBrief,
  fallbackFromBrief,
  mergeTemplatesIntoGraph,
  inferCombineTemplateIds,
  briefRequestsCombine
};
