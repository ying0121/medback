/**
 * Shared appointment intake: required fields, normalization, and "ask if missing".
 * Used by web chat, web voice, and inbound phone booking.
 */

const { APP_TIMEZONE, zonedCivilToUtcDate } = require("../utils/appTimeZone");

const INTAKE_MARKER = "To finish booking this appointment";

const REQUIRED_FIELDS = [
  { key: "name", label: "full name", prompt: "What is your full name?" },
  { key: "phone", label: "phone number", prompt: "What is the best phone number to reach you?" },
  { key: "email", label: "email address", prompt: "What is your email address?" },
  { key: "dob", label: "date of birth", prompt: "What is your date of birth?" },
  {
    key: "type",
    label: "whether you are a new or existing patient",
    prompt: "Are you a new patient or an existing patient?"
  },
  {
    key: "datetime",
    label: "appointment date and time",
    prompt: "What date and time would you like for the appointment?"
  }
];

const EMPTY_INTAKE = {
  name: "",
  email: "",
  phone: "",
  dob: "",
  type: "",
  datetime: ""
};

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function envEmailList(...values) {
  return values
    .flatMap((value) => String(value || "").split(","))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function isNonPatientEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!isValidEmail(email)) return true;
  const [localPart] = email.split("@");
  if (/^(medibot|medicalbot|noreply|no-reply|donotreply|do-not-reply|bot|support|info|admin)$/i.test(localPart)) {
    return true;
  }
  const blocked = new Set(
    envEmailList(
      process.env.SMTP_USER,
      process.env.ALERT_EMAIL,
      process.env.APPOINTMENT_NOTIFY_EMAILS,
      process.env.CALL_ANALYSIS_NOTIFY_EMAILS
    )
  );
  return blocked.has(email);
}

function isPlaceholderName(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  if (!text) return true;
  return /^(medical bot|medibot|test user|test patient|guest|n\/a)$/i.test(text);
}

function isPlaceholderPhone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (!digits) return true;
  if (/^(\d)\1{9,}$/.test(digits)) return true;
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return true;
  if (national === "1234567890" || national === "0123456789") return true;
  if (national.startsWith("555")) return true;
  if (national.startsWith("000") || national.startsWith("111")) return true;
  return false;
}

function isPlaceholderDob(value) {
  const iso = String(value || "").trim().slice(0, 10);
  if (!iso) return true;
  return /^(1970-01-01|1900-01-01|2000-01-01|0001-01-01)$/.test(iso);
}

function firstSpokenEmail(text) {
  const matches = String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];
  for (const match of matches) {
    const email = String(match).trim();
    if (isValidEmail(email) && !isNonPatientEmail(email)) return email;
  }
  return "";
}

/**
 * Parse conversation.userInfo which may be a JSON string or already an object.
 */
function parseUserInfoBlob(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * Flatten webchat/form payloads into a single patient-shaped object.
 * Clients may nest fields under patientInfo / form / firstName+lastName, etc.
 */
function coercePatientForm(raw) {
  const root = parseUserInfoBlob(raw);
  if (!root || typeof root !== "object" || Array.isArray(root)) return {};
  const nested = [
    root.patientInfo,
    root.patient,
    root.form,
    root.appointmentForm,
    root.appointment,
    root.user
  ]
    .map((value) => (value && typeof value === "object" && !Array.isArray(value) ? value : null))
    .filter(Boolean);

  const merged = Object.assign({}, root, ...nested);
  const firstLast = [merged.firstName, merged.lastName, merged.fname, merged.lname]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");

  if (firstLast && !merged.name && !merged.fullName) {
    merged.name = firstLast;
  }
  if (merged.mobileNumber && !merged.phone && !merged.phoneNumber) {
    merged.phone = merged.mobileNumber;
  }
  if (merged.dateOfBirth && !merged.dob) {
    merged.dob = merged.dateOfBirth;
  }
  return merged;
}

function normalizePhone(value) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length >= 10) return `+${digits}`;
  return "";
}

function parseDob(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^(1970-01-01|1900-01-01|2000-01-01|0001-01-01)([T\s].*)?$/.test(text)) return "";
  if (/^(01[/-]01[/-]1970|1[/-]1[/-]1970)$/.test(text)) return "";
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return "";
  const now = new Date();
  if (parsed > now) return "";
  const ageYears = (now.getTime() - parsed.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  if (ageYears > 120) return "";
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  const iso = `${y}-${m}-${d}`;
  if (isPlaceholderDob(iso)) return "";
  return iso;
}

function parseClockTime(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  const ampm = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (ampm) {
    let hours = Number(ampm[1]);
    const minutes = Number(ampm[2] || 0);
    const period = ampm[3].toLowerCase();
    if (hours === 12) hours = 0;
    if (period === "pm") hours += 12;
    return { hours, minutes };
  }
  const twentyFour = text.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFour) {
    return { hours: Number(twentyFour[1]), minutes: Number(twentyFour[2]) };
  }
  return null;
}

function formatCivilDateTime(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${h}:${min}`;
}

function parseAppointmentDateTime(patientInfo = {}) {
  const explicit = firstNonEmpty(
    patientInfo.datetime,
    patientInfo.dateTime,
    patientInfo.appointmentDateTime,
    patientInfo.appointmentDatetime,
    patientInfo.start,
    patientInfo.startTime
  );
  if (explicit) {
    const parsed = new Date(explicit);
    if (!Number.isNaN(parsed.getTime())) return formatCivilDateTime(parsed);
  }

  const dateValue = firstNonEmpty(
    patientInfo.preferredDate,
    patientInfo.appointmentDate,
    patientInfo.date
  );
  const timeValue = firstNonEmpty(
    patientInfo.preferredTime,
    patientInfo.appointmentTime,
    patientInfo.time
  );
  if (!dateValue || !timeValue) return "";

  const datePart = new Date(dateValue);
  if (Number.isNaN(datePart.getTime())) return "";
  const clock = parseClockTime(timeValue);
  if (!clock) {
    const withTime = new Date(`${String(dateValue).trim()} ${String(timeValue).trim()}`);
    if (Number.isNaN(withTime.getTime())) return "";
    return formatCivilDateTime(withTime);
  }
  datePart.setHours(clock.hours, clock.minutes, 0, 0);
  return formatCivilDateTime(datePart);
}

function normalizePatientType(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return "";
  if (/\b(existing|current|returning|established)\b/.test(text)) return "existing";
  if (/\b(new)\b/.test(text)) return "new";
  if (text === "existing" || text === "new") return text;
  return "";
}

function normalizeName(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (text.length < 2) return "";
  if (/^(yes|no|ok|okay|hi|hello)$/i.test(text)) return "";
  return text;
}

function normalizePatientInfo(raw = {}) {
  const source = coercePatientForm(raw);
  let type = normalizePatientType(
    firstNonEmpty(source.type, source.patientType, source.patientStatus, source.newOrExisting)
  );
  if (!type && (source.isNewPatient === true || /^(yes|true|1)$/i.test(String(source.isNewPatient || "")))) {
    type = "new";
  }
  if (!type && (source.isNewPatient === false || /^(no|false|0)$/i.test(String(source.isExistingPatient || "")))) {
    type = source.isExistingPatient === false ? "" : type;
  }
  if (!type && source.isExistingPatient === true) type = "existing";

  return {
    name: normalizeName(
      firstNonEmpty(
        source.name,
        source.fullName,
        source.patientName,
        source.userName,
        [source.firstName, source.lastName].filter(Boolean).join(" ")
      )
    ),
    email: (() => {
      const candidates = [
        source.email,
        source.emailAddress,
        source.patientEmail,
        source.userEmail,
        source.mail
      ];
      for (const candidate of candidates) {
        const email = String(candidate || "").trim();
        if (isValidEmail(email) && !isNonPatientEmail(email)) return email;
      }
      return "";
    })(),
    phone: (() => {
      const phone = normalizePhone(
        firstNonEmpty(source.phone, source.phoneNumber, source.tel, source.mobile, source.mobileNumber)
      );
      return phone && !isPlaceholderPhone(phone) ? phone : "";
    })(),
    dob: (() => {
      const dob = parseDob(
        firstNonEmpty(source.dob, source.dateOfBirth, source.birthDate, source.birthday, source.date_of_birth)
      );
      return dob && !isPlaceholderDob(dob) ? dob : "";
    })(),
    type,
    datetime: parseAppointmentDateTime(source)
  };
}

function mergePatientInfo(...parts) {
  const merged = { ...EMPTY_INTAKE };
  for (const part of parts) {
    const normalized = normalizePatientInfo(part || {});
    for (const key of Object.keys(EMPTY_INTAKE)) {
      if (normalized[key]) merged[key] = normalized[key];
    }
  }
  return merged;
}

function getMissingAppointmentFields(patientInfo = {}) {
  const normalized = normalizePatientInfo(patientInfo);
  return REQUIRED_FIELDS.filter((field) => !normalized[field.key]);
}

function isAppointmentComplete(patientInfo = {}) {
  return getMissingAppointmentFields(patientInfo).length === 0;
}

function buildMissingFieldsQuestion(missingFields, { voice = false } = {}) {
  const missing = Array.isArray(missingFields) && missingFields.length
    ? missingFields
    : REQUIRED_FIELDS;
  const first = missing[0];
  const restLabels = missing.slice(1).map((field) => field.label);

  if (voice) {
    if (missing.length === 1) {
      return `${INTAKE_MARKER}, I still need your ${first.label}. ${first.prompt}`;
    }
    return `${INTAKE_MARKER}, I still need a few details. ${first.prompt}`;
  }

  if (missing.length === 1) {
    return `${INTAKE_MARKER}, I still need your ${first.label}. ${first.prompt}`;
  }

  const also = restLabels.length
    ? ` After that I will also need ${restLabels.join(", ")}.`
    : "";
  return `${INTAKE_MARKER}, I still need: ${missing.map((field) => field.label).join(", ")}. ${first.prompt}${also}`;
}

function isAppointmentIntakeQuestion(text) {
  return String(text || "").includes(INTAKE_MARKER);
}

function parseCivilDateTimeParts(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0)
  };
}

function resolveAppointmentWindow(patientInfo = {}, extras = {}) {
  const timeZone = String(extras.timeZone || APP_TIMEZONE).trim() || APP_TIMEZONE;
  const durationRaw = Number(extras.durationMinutes || extras.duration || 30);
  const durationMinutes = Number.isFinite(durationRaw) && durationRaw > 0 ? durationRaw : 30;

  const normalized = normalizePatientInfo(patientInfo);
  const civilText = firstNonEmpty(
    normalized.datetime,
    extras.start,
    extras.datetime,
    extras.dateTime
  );

  let start = null;
  const parts = parseCivilDateTimeParts(civilText);
  if (parts) {
    start = zonedCivilToUtcDate(parts, timeZone);
  } else if (civilText) {
    const parsed = new Date(civilText);
    if (!Number.isNaN(parsed.getTime())) start = parsed;
  }

  if (!start || Number.isNaN(start.getTime())) {
    return { start: null, end: null, timeZone };
  }

  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  return { start, end, timeZone };
}

function isAppointmentCancelRequest(text) {
  const value = String(text || "").toLowerCase();
  return /\b(cancel( the)? appointment|never mind|forget it|stop booking|don't (want|need) (an )?appointment|do not (want|need) (an )?appointment)\b/.test(
    value
  );
}

const APPOINTMENT_COLLECTION_INSTRUCTIONS = [
  "APPOINTMENT BOOKING (MANDATORY):",
  "When the caller wants to schedule, book, change, or make an appointment, collect ALL of these before confirming the booking:",
  "1. Full name",
  "2. Phone number",
  "3. Email address",
  "4. Date of birth",
  "5. Whether they are a new patient or an existing patient",
  "6. Appointment date AND time",
  "If any item is missing, ask for the next missing item. Ask one question at a time.",
  "Do not say the appointment is booked until every item above has been answered.",
  "Do not invent values. Repeat back the details briefly once they are complete.",
  "If the caller wants to stop booking, acknowledge and return to normal help."
].join("\n");

function extractAppointmentIntakeHeuristic(text) {
  const raw = String(text || "");
  const emailMatch = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const labeledPhone = raw.match(
    /(?:phone|mobile|cell|call me at|number is)[:\s-]*((?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4})/i
  );
  const dobMatch = raw.match(
    /(?:dob|date of birth|birthday|born on)[:\s-]+(\d{1,4}[/-]\d{1,2}[/-]\d{1,4})/i
  );

  return normalizePatientInfo({
    email: emailMatch ? emailMatch[0] : "",
    phone: labeledPhone ? labeledPhone[1] : "",
    dob: dobMatch ? dobMatch[1] : ""
  });
}

function conversationTextFromMessages(messages = []) {
  return (messages || [])
    .map((msg) => {
      const role = msg.userType === "bot" || msg.role === "assistant" ? "Assistant" : "Caller";
      const text = msg.message || msg.content || msg.text || "";
      return `${role}: ${String(text).trim()}`;
    })
    .filter((line) => !line.endsWith(":"))
    .join("\n");
}

function conversationCallerTextFromMessages(messages = []) {
  return (messages || [])
    .filter((msg) => msg.userType !== "bot" && msg.role !== "assistant")
    .map((msg) => String(msg.message || msg.content || msg.text || "").trim())
    .filter(Boolean)
    .join("\n");
}

module.exports = {
  INTAKE_MARKER,
  REQUIRED_FIELDS,
  EMPTY_INTAKE,
  APPOINTMENT_COLLECTION_INSTRUCTIONS,
  normalizePatientInfo,
  mergePatientInfo,
  getMissingAppointmentFields,
  isAppointmentComplete,
  buildMissingFieldsQuestion,
  isAppointmentIntakeQuestion,
  isAppointmentCancelRequest,
  resolveAppointmentWindow,
  extractAppointmentIntakeHeuristic,
  conversationTextFromMessages,
  conversationCallerTextFromMessages,
  parseAppointmentDateTime,
  parseUserInfoBlob,
  coercePatientForm,
  isNonPatientEmail,
  isPlaceholderPhone,
  isPlaceholderDob,
  firstSpokenEmail
};
