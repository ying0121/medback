/**
 * Per-clinic / per-agent greeting & prompt templates with token replacement.
 *
 * Preferred syntax: {{clinic_name}}, {{agent_name}}, …
 * Legacy syntax still supported: $clinic_name$, $agent_name$, …
 */

const { normalizeThemeColor } = require("../constants/themeColors");

const GREETING_PLACEHOLDERS = [
  {
    token: "{{clinic_name}}",
    label: "Clinic name",
    description: "Full clinic name (falls back to acronym)"
  },
  {
    token: "{{clinic_acronym}}",
    label: "Clinic acronym",
    description: "Short clinic code (falls back to name)"
  },
  {
    token: "{{clinic_city}}",
    label: "Clinic city",
    description: "City from the clinic profile"
  },
  {
    token: "{{clinic_phone}}",
    label: "Clinic phone",
    description: "Main clinic phone number"
  },
  {
    token: "{{agent_name}}",
    label: "Agent name",
    description: "Human-facing agent name (identity)"
  },
  {
    token: "{{patient_name}}",
    label: "Patient name",
    description: "Full patient name when known"
  },
  {
    token: "{{patient_first_name}}",
    label: "Patient first name",
    description: "Patient first name when known"
  }
];

const SYSTEM_DEFAULT_INBOUND_GREETING =
  "Hello. This is {{agent_name}} at {{clinic_name}}. How can I help you today?";

const SYSTEM_DEFAULT_CHAT_GREETING =
  "Hello! Welcome to {{clinic_name}}. I'm {{agent_name}}. How can I help you today?";

const GREETING_KIND = {
  inbound: {
    clinicField: "inboundGreeting",
    envKey: "TWILIO_INBOUND_VOICE_GREETING",
    systemDefault: SYSTEM_DEFAULT_INBOUND_GREETING
  },
  chat: {
    clinicField: "chatGreeting",
    envKey: "CHAT_GREETING",
    systemDefault: SYSTEM_DEFAULT_CHAT_GREETING
  }
};

function normalizeGreetingText(rawText, fallbackText) {
  const base = String(rawText || "").trim() || fallbackText;
  return base.replace(/after the tone[:,]?\s*/gi, "");
}

function clinicNameFallback() {
  return (
    String(process.env.TWILIO_INBOUND_GREETING_CLINIC_FALLBACK || "").trim() || "our clinic"
  );
}

/**
 * Build a flat token map from clinic / agent / patient objects.
 */
function buildPlaceholderContext(clinicOrCtx = null, agent = null, patient = null) {
  const looksLikeClinic =
    clinicOrCtx &&
    typeof clinicOrCtx === "object" &&
    (clinicOrCtx.name != null ||
      clinicOrCtx.acronym != null ||
      clinicOrCtx.clinicId != null ||
      clinicOrCtx.inboundGreeting != null ||
      clinicOrCtx.chatGreeting != null);

  const clinic = looksLikeClinic ? clinicOrCtx : clinicOrCtx?.clinic || null;
  const agentRow = agent || clinicOrCtx?.agent || null;
  const patientRow = patient || clinicOrCtx?.patient || null;

  const fallback = clinicNameFallback();
  const name = String(clinic?.name || "").trim();
  const acronym = String(clinic?.acronym || "").trim();
  const city = String(clinic?.city || "").trim();
  const phone = String(clinic?.phone || "").trim();

  const agentName =
    String(
      agentRow?.title ||
        agentRow?.name ||
        clinicOrCtx?.agentName ||
        clinicOrCtx?.agent_name ||
        ""
    ).trim() || "the clinic assistant";

  const first = String(
    patientRow?.patientFirstName || patientRow?.firstName || patientRow?.first_name || ""
  ).trim();
  const last = String(
    patientRow?.patientLastName || patientRow?.lastName || patientRow?.last_name || ""
  ).trim();
  const fullPatient =
    String(patientRow?.patientName || patientRow?.name || "").trim() ||
    [first, last].filter(Boolean).join(" ").trim();

  const clinicName = name || acronym || fallback;
  const clinicAcronym = acronym || name || fallback;
  const patientName = fullPatient || "there";
  const patientFirstName = first || fullPatient || "there";

  return {
    clinic_name: clinicName,
    clinic_acronym: clinicAcronym,
    clinic_city: city,
    clinic_phone: phone,
    agent_name: agentName,
    agent_title: agentName,
    patient_name: patientName,
    patient_first_name: patientFirstName,
    clinicName,
    clinicAcronym,
    clinicCity: city,
    clinicPhone: phone,
    agentName,
    patientName,
    patientFirstName
  };
}

function lookupToken(ctx, rawKey) {
  const key = String(rawKey || "").trim();
  if (!key) return null;
  const lower = key.toLowerCase();
  if (Object.prototype.hasOwnProperty.call(ctx, lower) && ctx[lower] != null) {
    return String(ctx[lower]);
  }
  if (Object.prototype.hasOwnProperty.call(ctx, key) && ctx[key] != null) {
    return String(ctx[key]);
  }
  // camelCase from snake_case
  const camel = lower.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
  if (Object.prototype.hasOwnProperty.call(ctx, camel) && ctx[camel] != null) {
    return String(ctx[camel]);
  }
  return null;
}

/**
 * Replace {{token}} and $token$ placeholders. Unknown tokens are left as-is.
 */
function applyTemplatePlaceholders(text, clinicOrCtx, agent = null, patient = null) {
  const ctx = buildPlaceholderContext(clinicOrCtx, agent, patient);
  return String(text || "").replace(
    /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}|\$([a-zA-Z0-9_]+)\$/g,
    (match, mustacheKey, dollarKey) => {
      const resolved = lookupToken(ctx, mustacheKey || dollarKey);
      return resolved != null ? resolved : match;
    }
  );
}

/** @deprecated Prefer applyTemplatePlaceholders — kept for callers. */
function applyGreetingPlaceholders(text, clinic, agent = null, patient = null) {
  return applyTemplatePlaceholders(text, clinic, agent, patient);
}

function getDefaultGreetingTemplate(kind = "inbound") {
  const meta = GREETING_KIND[kind] || GREETING_KIND.inbound;
  return normalizeGreetingText(process.env[meta.envKey], meta.systemDefault);
}

function getGreetingTemplateForClinic(clinic, kind = "inbound") {
  const meta = GREETING_KIND[kind] || GREETING_KIND.inbound;
  const custom = String(clinic?.[meta.clinicField] || "").trim();
  if (custom) {
    return normalizeGreetingText(custom, meta.systemDefault);
  }
  return getDefaultGreetingTemplate(kind);
}

function resolveGreeting(clinic, kind = "inbound", agent = null, patient = null) {
  const template = getGreetingTemplateForClinic(clinic, kind);
  return applyTemplatePlaceholders(template, clinic, agent, patient);
}

function resolveInboundGreeting(clinic, agent = null, patient = null) {
  return resolveGreeting(clinic, "inbound", agent, patient);
}

function resolveChatGreeting(clinic, agent = null, patient = null) {
  return resolveGreeting(clinic, "chat", agent, patient);
}

function previewGreetingTemplate(template, clinic, kind = "inbound", agent = null) {
  const normalized = normalizeGreetingText(
    template,
    getDefaultGreetingTemplate(kind)
  );
  return applyTemplatePlaceholders(normalized, clinic, agent);
}

function buildGreetingPanel(clinic, kind, agent = null) {
  const meta = GREETING_KIND[kind] || GREETING_KIND.inbound;
  const greeting = String(clinic?.[meta.clinicField] || "").trim();
  return {
    greeting,
    defaultGreeting: getDefaultGreetingTemplate(kind),
    resolvedPreview: resolveGreeting(clinic, kind, agent),
    usesCustomGreeting: Boolean(greeting)
  };
}

/**
 * WebSocket connect payload — uses chat greeting only.
 */
function getClinicConnectFields(clinic, agent = null) {
  const ctx = buildPlaceholderContext(clinic, agent);
  const twilioPhoneNumber = String(clinic?.twilioPhoneNumber || "").trim() || null;
  return {
    clinicName: ctx.clinic_name,
    clinicAcronym: ctx.clinic_acronym,
    greeting: resolveChatGreeting(clinic, agent),
    themeColor: normalizeThemeColor(clinic?.themeColor),
    avatar: clinic?.avatar ? String(clinic.avatar) : null,
    twilioPhoneNumber
  };
}

module.exports = {
  GREETING_PLACEHOLDERS,
  GREETING_KIND,
  SYSTEM_DEFAULT_INBOUND_GREETING,
  SYSTEM_DEFAULT_CHAT_GREETING,
  normalizeGreetingText,
  buildPlaceholderContext,
  applyTemplatePlaceholders,
  applyGreetingPlaceholders,
  getDefaultGreetingTemplate,
  getGreetingTemplateForClinic,
  resolveGreeting,
  resolveInboundGreeting,
  resolveChatGreeting,
  previewGreetingTemplate,
  buildGreetingPanel,
  getClinicConnectFields
};
