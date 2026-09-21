/**
 * Shared Bot Calendar schedule defaults and normalization.
 * Used by clinics, doctors, and scheduleAvailabilityService.
 */

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** JS getDay() / Intl weekday index 0=Sun … 6=Sat → our key */
const JS_WEEKDAY_TO_KEY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

const DEFAULT_DAY = { enabled: true, start: "09:00", end: "17:00" };
const WEEKEND_DAY = { enabled: false, start: "09:00", end: "17:00" };

function defaultWeeklyHours() {
  return {
    mon: { ...DEFAULT_DAY },
    tue: { ...DEFAULT_DAY },
    wed: { ...DEFAULT_DAY },
    thu: { ...DEFAULT_DAY },
    fri: { ...DEFAULT_DAY },
    sat: { ...WEEKEND_DAY },
    sun: { ...WEEKEND_DAY }
  };
}

function parseHm(value) {
  const m = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute, label: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}` };
}

function hmToMinutes(hm) {
  return hm.hour * 60 + hm.minute;
}

function normalizeDayHours(raw, fallback = DEFAULT_DAY) {
  const src = raw && typeof raw === "object" ? raw : {};
  const enabled = src.enabled === false || src.enabled === 0 || src.enabled === "false" ? false : Boolean(src.enabled ?? fallback.enabled);
  const start = parseHm(src.start) || parseHm(fallback.start) || parseHm("09:00");
  const end = parseHm(src.end) || parseHm(fallback.end) || parseHm("17:00");
  return {
    enabled,
    start: start.label,
    end: end.label
  };
}

function normalizeWeeklyHours(raw) {
  const defaults = defaultWeeklyHours();
  if (raw == null || raw === "") return defaults;
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaults;
    }
  }
  if (!parsed || typeof parsed !== "object") return defaults;
  const out = {};
  for (const key of WEEKDAY_KEYS) {
    out[key] = normalizeDayHours(parsed[key], defaults[key]);
  }
  return out;
}

function normalizeSlotDuration(value, fallback = 30) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 5 || n > 480) return fallback;
  return Math.round(n);
}

function normalizeDailyLimit(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(Math.round(n), 10000);
}

/**
 * Normalize schedule fields from clinic/doctor body.
 */
function normalizeScheduleFields(src = {}, { partial = false } = {}) {
  const out = {};

  if (!partial || src.weeklyHours !== undefined) {
    out.weeklyHours = normalizeWeeklyHours(src.weeklyHours);
  }
  if (!partial || src.slotDurationMinutes !== undefined) {
    out.slotDurationMinutes = normalizeSlotDuration(src.slotDurationMinutes, 30);
  }
  if (!partial || src.doctorDailyLimit !== undefined) {
    out.doctorDailyLimit = normalizeDailyLimit(src.doctorDailyLimit);
  }

  return { value: out };
}

function scheduleFieldsToDto(row) {
  return {
    weeklyHours: normalizeWeeklyHours(row?.weeklyHours),
    slotDurationMinutes: normalizeSlotDuration(row?.slotDurationMinutes, 30),
    doctorDailyLimit: normalizeDailyLimit(row?.doctorDailyLimit)
  };
}

const WEEKDAY_LABELS = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday"
};

function formatHm12(hm) {
  const parsed = parseHm(hm);
  if (!parsed) return String(hm || "");
  const period = parsed.hour >= 12 ? "PM" : "AM";
  const hour12 = parsed.hour % 12 === 0 ? 12 : parsed.hour % 12;
  return `${hour12}:${String(parsed.minute).padStart(2, "0")} ${period}`;
}

/**
 * Human-readable weekly hours for agent system prompts.
 */
function formatWeeklyHoursForPrompt(rawHours, { timeZoneLabel = "Eastern Time" } = {}) {
  const hours = normalizeWeeklyHours(rawHours);
  const lines = [`Clinic work hours (${timeZoneLabel}):`];
  for (const key of WEEKDAY_KEYS) {
    const day = hours[key];
    if (!day?.enabled) {
      lines.push(`- ${WEEKDAY_LABELS[key]}: closed`);
      continue;
    }
    lines.push(
      `- ${WEEKDAY_LABELS[key]}: ${formatHm12(day.start)} – ${formatHm12(day.end)}`
    );
  }
  return lines.join("\n");
}

/**
 * Booking rules that force appointments inside configured work hours.
 */
function formatScheduleBookingRulesPrompt(clinic, { meetingProvider = null } = {}) {
  if (!clinic) return null;
  const provider = String(meetingProvider || "").trim().toLowerCase();
  const hoursBlock = formatWeeklyHoursForPrompt(clinic.weeklyHours);
  const slot = normalizeSlotDuration(clinic.slotDurationMinutes, 30);
  const lines = [
    "APPOINTMENT SCHEDULING RULES (MANDATORY):",
    "- Appointments MUST be scheduled entirely within clinic work hours.",
    "- Do not offer, accept, or confirm a date/time outside those hours.",
    "- If the patient proposes a time outside work hours, say the clinic is closed then and ask for a time within the hours below.",
    `- Appointment slots are ${slot} minutes long; the full slot must fit inside work hours.`,
    hoursBlock
  ];
  if (provider === "bot") {
    lines.splice(
      4,
      0,
      "- This clinic uses Bot Calendar: only times inside work hours can be saved."
    );
  }
  return lines.join("\n");
}

module.exports = {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  JS_WEEKDAY_TO_KEY,
  defaultWeeklyHours,
  parseHm,
  hmToMinutes,
  normalizeDayHours,
  normalizeWeeklyHours,
  normalizeSlotDuration,
  normalizeDailyLimit,
  normalizeScheduleFields,
  scheduleFieldsToDto,
  formatHm12,
  formatWeeklyHoursForPrompt,
  formatScheduleBookingRulesPrompt
};
