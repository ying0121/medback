/**
 * Pure helpers for parsing structured JSON responses from OpenAI completions.
 *
 * The model occasionally wraps JSON in code fences or surrounds it with prose,
 * so we (1) extract the first {...} block and (2) tolerate snake_case vs
 * camelCase aliases that we have observed in real outputs.
 *
 * All helpers are side-effect free and return safe fallbacks rather than
 * throwing; callers can decide whether a fallback should trigger a retry.
 */

/**
 * Pull the first balanced-looking JSON object out of an arbitrary model reply.
 * Returns parsed value, or null if no parseable JSON was found.
 */
function extractJsonObject(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return null;

  const match = raw.match(/\{[\s\S]*\}/);
  const candidate = match ? match[0] : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

/** Read a string field from a parsed object, accepting any of the given aliases. */
function readStringField(obj, aliases, fallback = "") {
  if (!obj) return fallback;
  for (const key of aliases) {
    if (obj[key] !== undefined && obj[key] !== null) {
      const value = String(obj[key]).trim();
      if (value) return value;
    }
  }
  return fallback;
}

/** Read a strict boolean (only `true` literal counts as true). */
function readBooleanField(obj, aliases) {
  if (!obj) return false;
  for (const key of aliases) {
    if (obj[key] === true) return true;
  }
  return false;
}

/**
 * Parse Twilio language-detection JSON: { iso_639_1, english_name, twilio_bcp47, twilio_voice }.
 * Returns the parsed shape, or `fallback` when required keys are missing.
 */
function parseLanguageHints(rawText, fallback) {
  const parsed = extractJsonObject(rawText);
  if (!parsed) return fallback;

  const twilio_bcp47 = readStringField(parsed, ["twilio_bcp47", "twilioBcp47"]);
  const twilio_voice = readStringField(parsed, ["twilio_voice", "twilioVoice"]);
  if (!twilio_bcp47 || !twilio_voice) return fallback;

  return {
    iso_639_1:    readStringField(parsed, ["iso_639_1", "iso6391"], "en"),
    english_name: readStringField(parsed, ["english_name", "englishName"], "English"),
    twilio_bcp47,
    twilio_voice
  };
}

/**
 * Parse the merged inbound turn JSON: language hints + reply + end_call.
 * Returns null when the reply is missing/invalid so caller can use a fallback.
 */
function parseInboundMergedTurn(rawText) {
  const parsed = extractJsonObject(rawText);
  if (!parsed) return null;

  const reply        = readStringField(parsed, ["reply", "answer"]);
  const twilio_bcp47 = readStringField(parsed, ["twilio_bcp47", "twilioBcp47"]);
  const twilio_voice = readStringField(parsed, ["twilio_voice", "twilioVoice"]);
  if (!reply || !twilio_bcp47 || !twilio_voice) return null;

  return {
    iso_639_1:    readStringField(parsed, ["iso_639_1", "iso6391"], "en"),
    english_name: readStringField(parsed, ["english_name", "englishName"], "English"),
    twilio_bcp47,
    twilio_voice,
    reply,
    end_call:     readBooleanField(parsed, ["end_call", "endCall"])
  };
}

/**
 * Parse `{ "end_call": true|false }` style classifier output.
 * Tolerates plain "true"/"false" tokens when the model omits braces.
 */
function parseEndCallFlag(rawText) {
  const parsed = extractJsonObject(rawText);
  if (parsed) return readBooleanField(parsed, ["end_call", "endCall"]);

  const lower = String(rawText || "").toLowerCase();
  if (/\btrue\b/.test(lower))  return true;
  if (/\bfalse\b/.test(lower)) return false;
  return false;
}

/**
 * Parse `{ "end_call": bool, "farewell": "..." }` from the end-call + farewell classifier.
 * @returns {{ endCall: boolean, farewell: string }}
 */
function parseEndCallTurn(rawText) {
  const parsed = extractJsonObject(rawText);
  if (!parsed) {
    return { endCall: false, farewell: "" };
  }
  return {
    endCall: readBooleanField(parsed, ["end_call", "endCall"]),
    farewell: readStringField(parsed, ["farewell", "farewell_message", "goodbye", "closing"], "")
  };
}

function readStringArrayField(obj, aliases) {
  if (!obj) return [];
  for (const key of aliases) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return value
        .map((item) => String(item ?? "").trim())
        .filter(Boolean);
    }
    if (typeof value === "string" && value.trim()) {
      return value
        .split(/[,;\n]+/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/**
 * Parse structured post-call analysis JSON from the model.
 * @returns {object|null}
 */
function parseCallAnalysis(rawText) {
  const parsed = extractJsonObject(rawText);
  if (!parsed) return null;

  const patientName = readStringField(parsed, ["patient_name", "patientName"]);
  const patientPhoneSpoken = readStringField(parsed, [
    "patient_phone",
    "patientPhone",
    "patient_phone_spoken",
    "patientPhoneSpoken"
  ]);
  const reasonForCall = readStringField(parsed, [
    "reason_for_call",
    "reasonForCall",
    "call_reason"
  ]);
  const symptomsConditions = readStringField(parsed, [
    "symptoms_conditions",
    "symptomsConditions",
    "symptoms",
    "conditions",
    "disease"
  ]);
  const helpRequested = readStringArrayField(parsed, [
    "help_requested",
    "helpRequested",
    "help_needed"
  ]);
  const urgency = readStringField(parsed, ["urgency"], "unknown").toLowerCase();
  const sentiment = readStringField(parsed, ["sentiment"], "unknown").toLowerCase();
  const outcomeNextStep = readStringField(parsed, [
    "outcome_next_step",
    "outcomeNextStep",
    "outcome",
    "next_step",
    "nextStep"
  ]);
  const summary = readStringField(parsed, ["summary", "call_summary", "callSummary"]);
  const keyQuotes = readStringArrayField(parsed, ["key_quotes", "keyQuotes", "quotes"]);
  const notes = readStringField(parsed, ["notes", "free_form_notes", "freeFormNotes"]);

  if (!summary && !reasonForCall && !symptomsConditions && !helpRequested.length) {
    return null;
  }

  const appointmentName = readStringField(parsed, [
    "appointment_name",
    "appointmentName",
    "patient_name",
    "patientName"
  ]);
  const appointmentEmail = readStringField(parsed, [
    "appointment_email",
    "appointmentEmail",
    "email"
  ]);
  const appointmentPhone = readStringField(parsed, [
    "appointment_phone",
    "appointmentPhone",
    "patient_phone",
    "patientPhone"
  ]);
  const appointmentDob = readStringField(parsed, [
    "appointment_dob",
    "appointmentDob",
    "date_of_birth",
    "dateOfBirth",
    "dob"
  ]);
  const appointmentDatetime = readStringField(parsed, [
    "appointment_datetime",
    "appointmentDatetime",
    "appointment_date_time",
    "appointmentDateTime"
  ]);
  const appointmentPatientType = readStringField(parsed, [
    "appointment_patient_type",
    "appointmentPatientType",
    "patient_type",
    "patientType"
  ]);

  return {
    patientName,
    patientPhoneSpoken,
    reasonForCall,
    symptomsConditions,
    helpRequested,
    urgency,
    sentiment,
    outcomeNextStep,
    summary,
    keyQuotes,
    notes,
    appointmentIntake: {
      name: appointmentName,
      email: appointmentEmail,
      phone: appointmentPhone,
      dob: appointmentDob,
      datetime: appointmentDatetime,
      type: appointmentPatientType
    }
  };
}

function parseAppointmentIntake(rawText) {
  const parsed = extractJsonObject(rawText);
  if (!parsed) return null;
  return {
    name: readStringField(parsed, ["name", "full_name", "fullName", "patient_name", "patientName"]),
    email: readStringField(parsed, ["email", "email_address", "emailAddress"]),
    phone: readStringField(parsed, ["phone", "phone_number", "phoneNumber"]),
    dob: readStringField(parsed, ["dob", "date_of_birth", "dateOfBirth", "birth_date", "birthDate"]),
    datetime: readStringField(parsed, [
      "datetime",
      "date_time",
      "dateTime",
      "appointment_datetime",
      "appointmentDatetime"
    ]),
    type: readStringField(parsed, ["type", "patient_type", "patientType"]),
    date: readStringField(parsed, ["date", "appointment_date", "appointmentDate"]),
    time: readStringField(parsed, ["time", "appointment_time", "appointmentTime"])
  };
}

module.exports = {
  extractJsonObject,
  readStringField,
  readBooleanField,
  readStringArrayField,
  parseLanguageHints,
  parseInboundMergedTurn,
  parseEndCallFlag,
  parseEndCallTurn,
  parseCallAnalysis,
  parseAppointmentIntake
};
