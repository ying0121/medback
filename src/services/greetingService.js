/**
 * Inbound voice greeting templates — per-clinic text with token replacement.
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

const SYSTEM_DEFAULT_GREETING =
  "Hello. This is our automated assistant. How can I help you today?";

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

function getDefaultGreetingTemplate() {
  return normalizeGreetingText(
    process.env.TWILIO_INBOUND_VOICE_GREETING,
    SYSTEM_DEFAULT_GREETING
  );
}

/**
 * Raw template for a clinic: DB value, else global env default.
 */
function getGreetingTemplateForClinic(clinic) {
  const custom = String(clinic?.inboundGreeting || "").trim();
  if (custom) return normalizeGreetingText(custom, SYSTEM_DEFAULT_GREETING);
  return getDefaultGreetingTemplate();
}

/**
 * Final spoken greeting after placeholder substitution.
 */
function resolveInboundGreeting(clinic) {
  const template = getGreetingTemplateForClinic(clinic);
  return applyGreetingPlaceholders(template, clinic);
}

/**
 * Display fields for chat Socket.IO connect (and similar UIs).
 * Name/acronym use the same fallbacks as greeting placeholders.
 */
function getClinicConnectFields(clinic) {
  const ctx = buildPlaceholderContext(clinic);
  return {
    clinicName: ctx.clinicName,
    clinicAcronym: ctx.clinicAcronym,
    greeting: resolveInboundGreeting(clinic),
    themeColor: normalizeThemeColor(clinic?.themeColor),
    avatar: clinic?.avatar ? String(clinic.avatar) : null
  };
}

/**
 * Preview arbitrary draft text (e.g. from admin UI) before save.
 */
function previewGreetingTemplate(template, clinic) {
  const normalized = normalizeGreetingText(template, getDefaultGreetingTemplate());
  return applyGreetingPlaceholders(normalized, clinic);
}

module.exports = {
  GREETING_PLACEHOLDERS,
  SYSTEM_DEFAULT_GREETING,
  normalizeGreetingText,
  applyGreetingPlaceholders,
  getDefaultGreetingTemplate,
  getGreetingTemplateForClinic,
  resolveInboundGreeting,
  previewGreetingTemplate,
  getClinicConnectFields
};
