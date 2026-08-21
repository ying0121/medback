/**
 * Clinic wall-clock timezone. All appointment parsing, Google Calendar events,
 * emails, and admin "today" buckets use this zone — not the server's local TZ.
 */
const APP_TIMEZONE =
  process.env.APP_TIMEZONE || process.env.GOOGLE_CALENDAR_TIMEZONE || "America/New_York";

const WEEKDAY_SHORT = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

function pad(value) {
  return String(value).padStart(2, "0");
}

function toDate(value) {
  if (value instanceof Date) return value;
  return new Date(value);
}

function getZonedParts(value = new Date(), timeZone = APP_TIMEZONE) {
  const date = toDate(value);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const map = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  let hour = Number(map.hour);
  if (hour === 24) hour = 0;
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour,
    minute: Number(map.minute),
    second: Number(map.second),
    weekday: WEEKDAY_SHORT[map.weekday] ?? 0
  };
}

function zonedCivilToUtcDate(civil, timeZone = APP_TIMEZONE) {
  const year = Number(civil.year);
  const month = Number(civil.month);
  const day = Number(civil.day);
  const hour = Number(civil.hour || 0);
  const minute = Number(civil.minute || 0);
  const second = Number(civil.second || 0);
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = getZonedParts(new Date(utcGuess), timeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return new Date(utcGuess - (asUtc - utcGuess));
}

function addDaysCivil(civil, days) {
  const utc = Date.UTC(civil.year, civil.month - 1, Number(civil.day) + Number(days || 0));
  const date = new Date(utc);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
    hour: Number(civil.hour || 0),
    minute: Number(civil.minute || 0),
    second: Number(civil.second || 0)
  };
}

function zonedDateKey(value, timeZone = APP_TIMEZONE) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

function formatInTimeZone(value, options = {}, timeZone = APP_TIMEZONE) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
}

function formatDateTimeNy(value) {
  const date = toDate(value);
  if (Number.isNaN(date.getTime())) return String(value || "");
  return formatInTimeZone(date, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

function formatGoogleDateTime(date, timeZone = APP_TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
}

function formatCivilInZone(date, timeZone = APP_TIMEZONE) {
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

function startOfZonedDay(value = new Date(), timeZone = APP_TIMEZONE) {
  const parts = getZonedParts(value, timeZone);
  return zonedCivilToUtcDate(
    { year: parts.year, month: parts.month, day: parts.day, hour: 0, minute: 0, second: 0 },
    timeZone
  );
}

function endOfZonedDay(value = new Date(), timeZone = APP_TIMEZONE) {
  const parts = getZonedParts(value, timeZone);
  return zonedCivilToUtcDate(
    {
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 23,
      minute: 59,
      second: 59
    },
    timeZone
  );
}

function nowLabelNy(value = new Date()) {
  return formatInTimeZone(value, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short"
  });
}

module.exports = {
  APP_TIMEZONE,
  pad,
  getZonedParts,
  zonedCivilToUtcDate,
  addDaysCivil,
  zonedDateKey,
  formatInTimeZone,
  formatDateTimeNy,
  formatGoogleDateTime,
  formatCivilInZone,
  startOfZonedDay,
  endOfZonedDay,
  nowLabelNy
};
