/** Bot Calendar weekly hours helpers (mirrors backend scheduleHours). */

export const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

export const WEEKDAY_LABELS: Record<WeekdayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

export type DayHours = {
  enabled: boolean;
  start: string;
  end: string;
};

export type WeeklyHours = Record<WeekdayKey, DayHours>;

const DEFAULT_DAY: DayHours = { enabled: true, start: "09:00", end: "17:00" };
const WEEKEND_DAY: DayHours = { enabled: false, start: "09:00", end: "17:00" };

export function defaultWeeklyHours(): WeeklyHours {
  return {
    mon: { ...DEFAULT_DAY },
    tue: { ...DEFAULT_DAY },
    wed: { ...DEFAULT_DAY },
    thu: { ...DEFAULT_DAY },
    fri: { ...DEFAULT_DAY },
    sat: { ...WEEKEND_DAY },
    sun: { ...WEEKEND_DAY },
  };
}

function normalizeDay(raw: unknown, fallback: DayHours): DayHours {
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const enabled =
    src.enabled === false || src.enabled === 0 || src.enabled === "false"
      ? false
      : Boolean(src.enabled ?? fallback.enabled);
  const start = String(src.start || fallback.start || "09:00").slice(0, 5);
  const end = String(src.end || fallback.end || "17:00").slice(0, 5);
  return { enabled, start, end };
}

export function normalizeWeeklyHours(raw: unknown): WeeklyHours {
  const defaults = defaultWeeklyHours();
  if (raw == null || raw === "") return defaults;
  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return defaults;
    }
  }
  if (!parsed || typeof parsed !== "object") return defaults;
  const obj = parsed as Record<string, unknown>;
  const out = {} as WeeklyHours;
  for (const key of WEEKDAY_KEYS) {
    out[key] = normalizeDay(obj[key], defaults[key]);
  }
  return out;
}

export function normalizeSlotDuration(value: unknown, fallback = 30): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 5 || n > 480) return fallback;
  return Math.round(n);
}

export function normalizeDailyLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(Math.round(n), 10000);
}
