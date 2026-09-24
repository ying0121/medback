/**
 * Expand compact template graphSpecs into specialist conversation brains.
 *
 * Every topic template gets:
 * - A genuine medical-ops specialist persona for that topic
 * - Accurate patient-intent detection across the FULL specialty feature set
 *   (e.g. appointment desks always include book + reschedule + cancel +
 *   same-day + telehealth + confirm — never a single micro-action)
 * - Divergent specialized capability paths per intent
 */

const { buildAgentGraph, normalizeGraph } = require("./agentGraphBuilder");
const { buildPersona, buildIntentBundle } = require("./templateSpecialistLibrary");

function q(label, prompt, options, guideText = "") {
  const step = { type: "question", label, prompt, options };
  if (guideText) step.guideText = guideText;
  return step;
}

function isShortFaqTemplate(template) {
  const typeId = String(template?.typeId || "");
  const id = String(template?.id || "").toLowerCase();
  const tags = (Array.isArray(template?.tags) ? template.tags : []).map((t) =>
    String(t || "").toLowerCase()
  );
  const name = String(template?.name || "").toLowerCase();
  const summary = String(template?.summary || "").toLowerCase();
  const blob = `${id} ${name} ${summary} ${tags.join(" ")}`;

  if (tags.includes("faq") || tags.includes("hours") || tags.includes("directions") || tags.includes("parking")) {
    return true;
  }
  if (typeId === "receptionist") {
    if (/\b(insurance-verify|eligibility|prior-auth|intake|triage|urgent)\b/.test(blob)) return false;
    return true;
  }
  if (typeId === "campaign" && /\b(survey|nps|birthday|feedback)\b/.test(blob)) return true;
  if (
    typeId === "afterhours" &&
    /\b(password|portal login|parking|weekend info|office closed info)\b/.test(blob)
  ) {
    return true;
  }
  if (typeId === "billing" && /\b(hsa|fsa|faq|statement overview)\b/.test(blob)) return true;
  if (typeId === "pharmacy" && /\b(otc|pickup timing|pick-up timing)\b/.test(blob)) return true;
  return false;
}

/**
 * Build specialist graphSpec: greeting + intent_router (capabilities) + wrap-up + closing.
 */
function buildDetailedGraphSpec(template) {
  const persona = buildPersona(template);
  const { prompt, intents, catalog } = buildIntentBundle(template);
  const existing = template?.graphSpec && typeof template.graphSpec === "object" ? template.graphSpec : {};

  const greeting =
    String(existing.greeting || "").trim() ||
    `Thank you for calling {{clinic_name}}. This is {{agent_name}}, ${persona.role} — how can I help you today?`;

  let closing =
    String(existing.closing || "").trim() ||
    `Thank you for calling {{clinic_name}}. Take care, and call us back anytime you need help.`;
  if (closing.endsWith("?")) {
    closing = closing.replace(/\?+\s*$/, "").trim() + ".";
  }

  // Even FAQ templates use intent detection — just with receptionist intents (already specialized).
  // For ultra-short FAQ we still use the receptionist intent bundle (hours/providers/route/forms).
  const steps = [
    {
      type: "intent_router",
      label: "Detect patient intent",
      prompt,
      guideText: [
        "ACCURATE INTENT DETECTION:",
        "1. Listen to the patient's free-text reason for calling.",
        "2. Map to the closest intent using labels + synonyms.",
        "3. If two intents are close, ask one clarifying either/or question.",
        "4. Then follow ONLY that intent's specialized path.",
        `Persona: ${persona.role} · Focus: ${persona.specialty}`
      ].join("\n"),
      intents,
      includeEscalate: true
    },
    q(
      "Anything else",
      "Is there anything else I can help with today?",
      ["Yes, another question", "No, I'm all set", "Speak to staff"],
      "If another question, re-detect intent from the catalog before acting."
    )
  ];

  return {
    greeting,
    steps,
    closing,
    persona,
    intentCatalog: catalog
  };
}

function resolveDetailedTemplateGraph(template) {
  const spec = buildDetailedGraphSpec(template);
  const graph = buildAgentGraph(spec);
  const normalized = normalizeGraph(graph);
  // Preserve specialist metadata stripped by normalizeGraph's node filter
  if (graph.persona) normalized.persona = graph.persona;
  if (graph.intentCatalog) normalized.intentCatalog = graph.intentCatalog;
  // Keep start-node persona/intent guide from builder
  const builtStart = (graph.nodes || []).find((n) => n.type === "start");
  const normStart = (normalized.nodes || []).find((n) => n.type === "start");
  if (builtStart?.data?.guideText && normStart) {
    normStart.data = {
      ...normStart.data,
      guideText: builtStart.data.guideText
    };
  }
  return normalized;
}

module.exports = {
  buildDetailedGraphSpec,
  resolveDetailedTemplateGraph,
  isShortFaqTemplate,
  buildPersona,
  buildIntentBundle
};
