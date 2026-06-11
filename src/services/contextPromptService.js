/**
 * Shared clinic + knowledge prompt builder used by both chat and inbound voice flows.
 *
 * Why this exists:
 * - chat mode and inbound voice mode previously each kept their own copy of the
 *   "Clinic Information" / "Product Knowledge" prompt assembly. Keeping them in
 *   sync by hand was fragile (small wording or field-list differences caused
 *   inconsistent answers between chat and phone).
 *
 * Identity input variants:
 * - chat flow uses the **business** clinic id stored on Conversation.clinicId
 *   (matches `clinics.clinicId`).
 * - inbound voice flow looks up the clinic by Twilio number, which yields the
 *   **system** primary key (`clinics.id`); we still need its `clinicId` field
 *   to load knowledge rows.
 *
 * The two `buildClinicContextBy*` helpers below resolve to the same internal
 * shape so chat and voice code paths converge.
 */

const { Clinic, Knowledge } = require("../db");

/** Allowed clinic profile fields exposed to the LLM (do not add PII). */
const CLINIC_PROMPT_FIELDS = ["name", "acronym", "web"];

/**
 * Format the clinic profile prompt block.
 * Always renders the header so the model treats the clinic context section as
 * present even when DB row is missing (defensive against stale conversations).
 */
function formatClinicPrompt(clinic) {
  const lines = ["Clinic Information:"];
  for (const field of CLINIC_PROMPT_FIELDS) {
    const label = field.charAt(0).toUpperCase() + field.slice(1);
    lines.push(`- ${label}: ${(clinic && clinic[field]) || ""}`);
  }
  return lines.join("\n");
}

/** Format the active knowledge rows as a numbered list, or return null when empty. */
function formatKnowledgePrompt(knowledgeRows) {
  const text = (knowledgeRows || [])
    .map((row, idx) => `${idx + 1}. ${String(row.knowledge || "").trim()}`)
    .filter(Boolean)
    .join("\n");
  return text ? `Product Knowledge:\n${text}` : null;
}

/**
 * Load active knowledge rows for a given **business** clinicId.
 * Returns [] when id is missing or invalid; never throws for absent data.
 */
async function loadActiveKnowledge(businessClinicId) {
  const id = Number(businessClinicId);
  if (!Number.isFinite(id) || id <= 0) return [];
  return Knowledge.findAll({
    where: { clinicId: id, status: "active" },
    order: [["id", "DESC"]]
  });
}

/**
 * Build prompts using the **business** clinic id (chat mode entrypoint).
 * @returns {Promise<{ clinicPrompt: string|null, knowledgePrompt: string|null }>}
 */
async function buildClinicContextByBusinessClinicId(businessClinicId) {
  if (!businessClinicId) return { clinicPrompt: null, knowledgePrompt: null };

  const [clinic, knowledgeRows] = await Promise.all([
    Clinic.findOne({ where: { clinicId: businessClinicId } }),
    loadActiveKnowledge(businessClinicId)
  ]);

  return {
    clinicPrompt: formatClinicPrompt(clinic),
    knowledgePrompt: formatKnowledgePrompt(knowledgeRows)
  };
}

const { resolveOpenAiVoice } = require("./openaiRealtimeVoices");

/**
 * Build prompts + OpenAI Realtime voice using the **system** clinic PK
 * (inbound voice entrypoint).
 *
 * Voice priority:
 *   1. Per-clinic `clinics.openai_voice`
 *   2. `OPENAI_REALTIME_VOICE` / `OPENAI_TTS_VOICE` env fallback
 *
 * @returns {Promise<{ clinicPrompt: string|null, knowledgePrompt: string|null, openaiVoice: string, clinicName: string }>}
 */
async function buildInboundClinicContextBySystemClinicId(systemClinicId) {
  const empty = {
    clinicPrompt: null,
    knowledgePrompt: null,
    openaiVoice: resolveOpenAiVoice(null),
    clinicName: ""
  };
  const id = Number(systemClinicId);
  if (!Number.isFinite(id) || id <= 0) return empty;

  const clinic = await Clinic.findByPk(id);
  if (!clinic) return empty;

  const knowledgeRows = await loadActiveKnowledge(clinic.clinicId);

  const clinicName =
    String(clinic.name || "").trim() ||
    String(clinic.acronym || "").trim() ||
    "";

  return {
    clinicPrompt: formatClinicPrompt(clinic),
    knowledgePrompt: formatKnowledgePrompt(knowledgeRows),
    openaiVoice: resolveOpenAiVoice(clinic.openaiVoice),
    clinicName
  };
}

module.exports = {
  CLINIC_PROMPT_FIELDS,
  formatClinicPrompt,
  formatKnowledgePrompt,
  loadActiveKnowledge,
  buildClinicContextByBusinessClinicId,
  buildInboundClinicContextBySystemClinicId
};
