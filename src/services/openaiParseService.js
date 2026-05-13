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

module.exports = {
  extractJsonObject,
  readStringField,
  readBooleanField,
  parseLanguageHints,
  parseInboundMergedTurn,
  parseEndCallFlag,
  parseEndCallTurn
};
