export const APP_TIMEZONE = "America/New_York";

const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

export type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number;
};

export function getZonedParts(value: Date | string | number = new Date(), timeZone = APP_TIMEZONE): ZonedParts {
  const date = value instanceof Date ? value : new Date(value);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const map: Record<string, string> = {};
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
    weekday: WEEKDAY_SHORT[map.weekday] ?? 0,
  };
}

export function zonedCivilToUtcDate(
  civil: { year: number; month: number; day: number; hour?: number; minute?: number; second?: number },
  timeZone = APP_TIMEZONE
) {
  const utcGuess = Date.UTC(
    civil.year,
    civil.month - 1,
    civil.day,
    civil.hour || 0,
    civil.minute || 0,
    civil.second || 0
  );
  const parts = getZonedParts(new Date(utcGuess), timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return new Date(utcGuess - (asUtc - utcGuess));
}

export function addDaysCivil(civil: ZonedParts, days: number) {
  const utc = Date.UTC(civil.year, civil.month - 1, civil.day + days);
  const date = new Date(utc);
  return {
    ...civil,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function zonedDateKey(value: Date | string | number, timeZone = APP_TIMEZONE) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = getZonedParts(date, timeZone);
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`;
}

export function formatInAppTz(
  value: Date | string | number,
  options: Intl.DateTimeFormatOptions,
  timeZone = APP_TIMEZONE
) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", { timeZone, ...options }).format(date);
}

export function formatNyTime(value: Date | string | number) {
  return formatInAppTz(value, { hour: "numeric", minute: "2-digit" });
}

export function formatNyDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions) {
  return formatInAppTz(value, { weekday: "long", month: "long", day: "numeric", year: "numeric", ...options });
}

export function formatNyDateTime(value: Date | string | number) {
  return formatInAppTz(value, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export function nyCalendarAnchor(value: Date | string | number = new Date()) {
  const parts = getZonedParts(value);
  return new Date(parts.year, parts.month - 1, parts.day, 12, 0, 0, 0);
}

export function isNyCalendarDay(day: Date) {
  const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
  return key === zonedDateKey(new Date());
}

export function isNyToday(value: Date | string | number) {
  return zonedDateKey(value) === zonedDateKey(new Date());
}

export function isNyYesterday(value: Date | string | number) {
  const yesterday = addDaysCivil(getZonedParts(new Date()), -1);
  return zonedDateKey(value) === `${yesterday.year}-${pad(yesterday.month)}-${pad(yesterday.day)}`;
}

export function startEndOfNyDayIso(value: Date | string | number = new Date()) {
  const parts = getZonedParts(value);
  return {
    from: zonedCivilToUtcDate({
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 0,
      minute: 0,
      second: 0,
    }).toISOString(),
    to: zonedCivilToUtcDate({
      year: parts.year,
      month: parts.month,
      day: parts.day,
      hour: 23,
      minute: 59,
      second: 59,
    }).toISOString(),
  };
}

export function nyCivilRangeIso(start: Date, end: Date) {
  return {
    from: zonedCivilToUtcDate({
      year: start.getFullYear(),
      month: start.getMonth() + 1,
      day: start.getDate(),
      hour: 0,
      minute: 0,
      second: 0,
    }).toISOString(),
    to: zonedCivilToUtcDate({
      year: end.getFullYear(),
      month: end.getMonth() + 1,
      day: end.getDate(),
      hour: 23,
      minute: 59,
      second: 59,
    }).toISOString(),
  };
}
