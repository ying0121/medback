const XLSX = require("xlsx");

/** Canonical patient fields required for campaigns */
const PATIENT_FIELDS = [
  {
    key: "firstName",
    label: "First name",
    required: true,
    aliases: ["firstname", "first", "fname", "givenname", "given"]
  },
  {
    key: "lastName",
    label: "Last name",
    required: true,
    aliases: ["lastname", "last", "lname", "surname", "familyname", "family"]
  },
  {
    key: "dob",
    label: "Date of birth",
    required: true,
    aliases: ["dob", "dateofbirth", "date_of_birth", "birthday", "birthdate", "birth"]
  },
  {
    key: "phone",
    label: "Phone number",
    required: true,
    aliases: ["phone", "phonenumber", "phone_number", "mobile", "tel", "cellphone", "cell", "msisdn"]
  },
  {
    key: "language",
    label: "Language",
    required: true,
    aliases: ["language", "lang", "locale", "preferredlanguage", "preferred_language"]
  },
  {
    key: "memberNumber",
    label: "Member number",
    required: true,
    aliases: [
      "membernumber",
      "member_number",
      "memberno",
      "member_no",
      "memberid",
      "member_id",
      "membership",
      "membershipnumber",
      "membership_number",
      "mrn",
      "chartnumber",
      "chart_number"
    ]
  }
];

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function normalizePhone(value) {
  return String(value || "").trim().replace(/[^\d+]/g, "");
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function asDob(month, day, year) {
  const m = Number(month);
  const d = Number(day);
  let y = Number(year);
  if (!Number.isFinite(m) || !Number.isFinite(d) || !Number.isFinite(y)) return "";
  if (y < 100) y += y >= 30 ? 1900 : 2000;
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return "";
  // Validate real calendar day
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return "";
  return `${pad2(m)}/${pad2(d)}/${y}`;
}

function excelSerialToDob(serial) {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80000) return "";
  // Excel epoch (with 1900 leap-year bug accounted via 25569 for Unix)
  const utc = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(utc);
  if (Number.isNaN(d.getTime())) return "";
  return asDob(d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCFullYear());
}

const MONTH_NAME = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

/**
 * Parse many Excel / API DOB formats into display form MM/DD/YYYY.
 * Input may be Date, Excel serial, ISO, US, EU, month-name, etc.
 */
function formatDob(value) {
  if (value == null || value === "") return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return asDob(value.getMonth() + 1, value.getDate(), value.getFullYear());
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial (common for DOB columns)
    if (value > 1000) {
      const fromSerial = excelSerialToDob(value);
      if (fromSerial) return fromSerial;
    }
    return "";
  }

  const text = String(value).trim();
  if (!text) return "";

  // Pure Excel serial as string
  if (/^\d{4,5}(\.\d+)?$/.test(text)) {
    const fromSerial = excelSerialToDob(Number(text));
    if (fromSerial) return fromSerial;
  }

  // ISO-like: YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD (optional time)
  let m = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:[T\s].*)?$/);
  if (m) {
    const out = asDob(m[2], m[3], m[1]);
    if (out) return out;
  }

  // Numeric: A/B/YYYY or A-B-YYYY or A.B.YYYY
  m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    const y = Number(m[3]);
    // If first part > 12, treat as DD/MM/YYYY (common Excel EU format)
    if (a > 12 && b >= 1 && b <= 12) {
      const out = asDob(b, a, y);
      if (out) return out;
    } else {
      // Prefer MM/DD/YYYY (US) when ambiguous
      const us = asDob(a, b, y);
      if (us) return us;
      // Fallback DD/MM if US invalid
      const eu = asDob(b, a, y);
      if (eu) return eu;
    }
  }

  // 15-Mar-1990 / 15 March 1990 / Mar 15, 1990 / March 15 1990
  m = text.match(/^(\d{1,2})[\s\-\/.]+([A-Za-z]{3,9})[\s\-\/.,]+(\d{2,4})$/);
  if (m) {
    const month = MONTH_NAME[m[2].toLowerCase()];
    if (month) {
      const out = asDob(month, m[1], m[3]);
      if (out) return out;
    }
  }
  m = text.match(/^([A-Za-z]{3,9})[\s\-\/.,]+(\d{1,2})(?:st|nd|rd|th)?[\s\-\/.,]+(\d{2,4})$/i);
  if (m) {
    const month = MONTH_NAME[m[1].toLowerCase()];
    if (month) {
      const out = asDob(month, m[2], m[3]);
      if (out) return out;
    }
  }

  // Last resort: Date.parse for remaining Excel locale strings
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime()) && /\d/.test(text)) {
    const out = asDob(parsed.getMonth() + 1, parsed.getDate(), parsed.getFullYear());
    if (out) return out;
  }

  return "";
}

function cellText(value) {
  if (value == null) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    // Keep raw date cells as ISO-ish parseable text; DOB column is normalized in formatDob
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 1000 && value < 80000) {
    // Preserve Excel serial so formatDob can convert the DOB column later
    return String(value);
  }
  return String(value).trim();
}

function suggestMapping(columns) {
  const mapping = {};
  const used = new Set();
  const normalizedCols = columns.map((c) => ({
    original: c,
    norm: normalizeHeader(c)
  }));

  for (const field of PATIENT_FIELDS) {
    const hit = normalizedCols.find(
      (c) => !used.has(c.original) && field.aliases.some((a) => c.norm === normalizeHeader(a) || c.norm.includes(normalizeHeader(a)))
    );
    if (hit) {
      mapping[field.key] = hit.original;
      used.add(hit.original);
    } else {
      mapping[field.key] = "";
    }
  }

  // Fallback: single "name" column → firstName only
  if (!mapping.firstName) {
    const nameCol = normalizedCols.find(
      (c) => !used.has(c.original) && ["name", "patientname", "fullname", "patient"].includes(c.norm)
    );
    if (nameCol) {
      mapping.firstName = nameCol.original;
      used.add(nameCol.original);
    }
  }

  return mapping;
}

/**
 * Read workbook → columns + raw row objects (original header keys).
 */
function analyzePatientWorkbook(buffer) {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { error: "Workbook has no sheets.", columns: [], rows: [], totalRows: 0 };
  }

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!rows.length) {
    return { error: "Sheet is empty.", columns: [], rows: [], totalRows: 0 };
  }

  const columns = Object.keys(rows[0] || {});
  if (!columns.length) {
    return { error: "No header row found.", columns: [], rows: [], totalRows: 0 };
  }

  const suggestedMapping = suggestMapping(columns);
  const previewRows = rows.slice(0, 5).map((r) => {
    const out = {};
    for (const col of columns) out[col] = cellText(r[col]);
    return out;
  });

  const normalizedRows = rows.map((r) => {
    const out = {};
    for (const col of columns) out[col] = cellText(r[col]);
    return out;
  });

  return {
    columns,
    suggestedMapping,
    previewRows,
    rows: normalizedRows,
    totalRows: rows.length,
    fields: PATIENT_FIELDS.map(({ key, label, required }) => ({ key, label, required }))
  };
}

function applyMappingToRows(rows, mapping = {}) {
  const contacts = [];
  const errors = [];

  rows.forEach((row, index) => {
    const firstName = cellText(row[mapping.firstName]);
    const lastName = cellText(row[mapping.lastName]);
    const dob = formatDob(row[mapping.dob]);
    const phone = normalizePhone(row[mapping.phone]);
    const language = cellText(row[mapping.language]);
    const memberNumber = cellText(row[mapping.memberNumber]);

    const mappedCols = new Set(
      Object.values(mapping || {}).filter(Boolean).map(String)
    );
    const extra = {};
    for (const [key, value] of Object.entries(row || {})) {
      if (mappedCols.has(key)) continue;
      const text = cellText(value);
      if (!text) continue;
      extra[key] = text;
    }

    const rowNum = index + 2;
    if (!firstName) {
      errors.push({ row: rowNum, reason: "First name is required." });
      return;
    }
    if (!lastName) {
      errors.push({ row: rowNum, reason: "Last name is required." });
      return;
    }
    if (!dob) {
      errors.push({
        row: rowNum,
        reason: "Date of birth is missing or could not be parsed from the Excel value."
      });
      return;
    }
    if (!phone) {
      errors.push({ row: rowNum, reason: "Phone number is required." });
      return;
    }
    if (!language) {
      errors.push({ row: rowNum, reason: "Language is required." });
      return;
    }
    if (!memberNumber) {
      errors.push({ row: rowNum, reason: "Member number is required." });
      return;
    }

    contacts.push({
      patientFirstName: firstName,
      patientLastName: lastName,
      patientName: `${firstName} ${lastName}`.trim(),
      patientPhone: phone,
      patientDob: dob,
      patientLanguage: language,
      patientMemberNumber: memberNumber,
      patientEmail: null,
      extra,
      sourceRow: rowNum
    });
  });

  return { contacts, errors };
}

/**
 * Split contacts into unique / file-duplicates / existing-duplicates.
 * Duplicate key = normalized phone.
 */
function classifyDuplicates(contacts, existingPhones = []) {
  const existing = new Set(
    (existingPhones || []).map((p) => normalizePhone(p)).filter(Boolean)
  );
  const seenInFile = new Map();
  const unique = [];
  const duplicatesInFile = [];
  const duplicatesExisting = [];

  for (const contact of contacts) {
    const phone = normalizePhone(contact.patientPhone);
    if (existing.has(phone)) {
      duplicatesExisting.push(contact);
      continue;
    }
    if (seenInFile.has(phone)) {
      duplicatesInFile.push({ ...contact, duplicateOfRow: seenInFile.get(phone) });
      continue;
    }
    seenInFile.set(phone, contact.sourceRow);
    unique.push(contact);
  }

  return { unique, duplicatesInFile, duplicatesExisting };
}

function buildImportPreview(rows, mapping, existingPhones = []) {
  const { contacts, errors } = applyMappingToRows(rows, mapping);
  const { unique, duplicatesInFile, duplicatesExisting } = classifyDuplicates(
    contacts,
    existingPhones
  );

  return {
    valid: contacts.length,
    invalid: errors.length,
    duplicatesInFileCount: duplicatesInFile.length,
    duplicatesExistingCount: duplicatesExisting.length,
    willImport: unique.length,
    errors: errors.slice(0, 50),
    uniqueSample: unique.slice(0, 8),
    duplicateInFileSample: duplicatesInFile.slice(0, 8),
    duplicateExistingSample: duplicatesExisting.slice(0, 8),
    unique,
    duplicatesInFile,
    duplicatesExisting
  };
}

module.exports = {
  PATIENT_FIELDS,
  analyzePatientWorkbook,
  applyMappingToRows,
  classifyDuplicates,
  buildImportPreview,
  suggestMapping,
  normalizePhone,
  normalizeHeader,
  formatDob
};
