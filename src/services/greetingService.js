/**
 * Per-clinic greeting templates (inbound phone vs web chat) with token replacement.
 *
 * Supported placeholders (case-insensitive):
 *   $clinic_name$    — clinics.name, else acronym, else env fallback
 *   $clinic_acronym$ — clinics.acronym, else name
 *   $clinic_city$    — clinics.city
 */

const { normalizeThemeColor } = require("../constants/themeColors");

const CLINIC_NAME_RE = /\$clinic_name\$/gi;
const CLINIC_ACRONYM_RE = /\$clinic_acronym\$/gi;
const CLINIC_CITY_RE = /\$clinic_city\$/gi;

const GREETING_PLACEHOLDERS = [
  { token: "$clinic_name$", label: "Clinic name", description: "Full name, or acronym if name is empty" },
  { token: "$clinic_acronym$", label: "Acronym", description: "Short code, or name if acronym is empty" },
  { token: "$clinic_city$", label: "City", description: "Clinic city from profile" }
];

const SYSTEM_DEFAULT_INBOUND_GREETING =
  "Hello. This is our automated assistant. How can I help you today?";

const SYSTEM_DEFAULT_CHAT_GREETING =
  "Hello! Welcome. How can I help you today?";

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

function buildPlaceholderContext(clinic) {
  const fallback = clinicNameFallback();
  const name = String(clinic?.name || "").trim();
  const acronym = String(clinic?.acronym || "").trim();
  const city = String(clinic?.city || "").trim();

  return {
    clinicName: name || acronym || fallback,
    clinicAcronym: acronym || name || fallback,
    clinicCity: city
  };
}

function applyGreetingPlaceholders(text, clinic) {
  const ctx = buildPlaceholderContext(clinic);
  return String(text || "")
    .replace(CLINIC_NAME_RE, ctx.clinicName)
    .replace(CLINIC_ACRONYM_RE, ctx.clinicAcronym)
    .replace(CLINIC_CITY_RE, ctx.clinicCity);
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

function resolveGreeting(clinic, kind = "inbound") {
  const template = getGreetingTemplateForClinic(clinic, kind);
  return applyGreetingPlaceholders(template, clinic);
}

function resolveInboundGreeting(clinic) {
  return resolveGreeting(clinic, "inbound");
}

function resolveChatGreeting(clinic) {
  return resolveGreeting(clinic, "chat");
}

function previewGreetingTemplate(template, clinic, kind = "inbound") {
  const normalized = normalizeGreetingText(
    template,
    getDefaultGreetingTemplate(kind)
  );
  return applyGreetingPlaceholders(normalized, clinic);
}

function buildGreetingPanel(clinic, kind) {
  const meta = GREETING_KIND[kind] || GREETING_KIND.inbound;
  const greeting = String(clinic?.[meta.clinicField] || "").trim();
  return {
    greeting,
    defaultGreeting: getDefaultGreetingTemplate(kind),
    resolvedPreview: resolveGreeting(clinic, kind),
    usesCustomGreeting: Boolean(greeting)
  };
}

/**
 * Socket.IO connect payload — uses chat greeting only.
 */
function getClinicConnectFields(clinic) {
  const ctx = buildPlaceholderContext(clinic);
  return {
    clinicName: ctx.clinicName,
    clinicAcronym: ctx.clinicAcronym,
    greeting: resolveChatGreeting(clinic),
    themeColor: normalizeThemeColor(clinic?.themeColor),
    avatar: clinic?.avatar ? String(clinic.avatar) : null
  };
}

module.exports = {
  GREETING_PLACEHOLDERS,
  GREETING_KIND,
  SYSTEM_DEFAULT_INBOUND_GREETING,
  SYSTEM_DEFAULT_CHAT_GREETING,
  normalizeGreetingText,
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
