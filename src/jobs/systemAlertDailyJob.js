/**
 * Daily system-alert history analysis scheduler.
 * Runs once per calendar day at ALERT_ANALYSIS_HOUR:MINUTE (default 06:00 America/New_York).
 */

const fs = require("fs");
const path = require("path");
const { runHistoryAnalysis } = require("../services/systemAlertService");

const DEFAULT_TZ = "America/New_York";
const STATE_FILE = ".alert-analysis-last-run";

function envFlag(name, defaultOn = true) {
  const raw = process.env[name];
  if (raw == null || raw === "") return defaultOn;
  return !["0", "false", "off", "no"].includes(String(raw).trim().toLowerCase());
}

function envInt(name, fallback, min, max) {
  const n = Number(process.env[name]);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function config() {
  return {
    enabled: envFlag("ALERT_ANALYSIS_ENABLED", true),
    hour: envInt("ALERT_ANALYSIS_HOUR", 6, 0, 23),
    minute: envInt("ALERT_ANALYSIS_MINUTE", 0, 0, 59),
    timeZone: String(process.env.ALERT_ANALYSIS_TZ || DEFAULT_TZ).trim() || DEFAULT_TZ,
    lookbackDays: envInt("ALERT_ANALYSIS_LOOKBACK_DAYS", 14, 1, 90),
    limit: envInt("ALERT_ANALYSIS_LIMIT", 50, 10, 200),
    enrich: envFlag("ALERT_ANALYSIS_ENRICH", true)
  };
}

function statePath() {
  const dir = String(process.env.LOG_DIR || path.join(process.cwd(), "logs")).trim();
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    /* ignore */
  }
  return path.join(dir, STATE_FILE);
}

function readLastRunDay() {
  try {
    const raw = fs.readFileSync(statePath(), "utf8").trim();
    return raw || null;
  } catch {
    return null;
  }
}

function writeLastRunDay(dayKey) {
  try {
    fs.writeFileSync(statePath(), `${dayKey}\n`, "utf8");
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[AlertJob] failed to persist last-run day: ${err.message}`);
  }
}

/** Calendar YYYY-MM-DD in the configured timezone. */
function dayKeyInTz(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

/** Hour/minute/second parts in timezone. */
function partsInTz(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });
  const map = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

/**
 * Approximate UTC ms for a wall-clock time in `timeZone` on a given Y-M-D.
 * Iterates once from a UTC guess (good enough for scheduling).
 */
function zonedLocalToUtcMs({ year, month, day, hour, minute }, timeZone) {
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0);
  for (let i = 0; i < 3; i += 1) {
    const p = partsInTz(new Date(guess), timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const want = Date.UTC(year, month - 1, day, hour, minute, 0);
    guess += want - asUtc;
  }
  return guess;
}

function nextScheduledAt(now, cfg) {
  const p = partsInTz(now, cfg.timeZone);
  let target = zonedLocalToUtcMs(
    { year: p.year, month: p.month, day: p.day, hour: cfg.hour, minute: cfg.minute },
    cfg.timeZone
  );
  if (target <= now.getTime()) {
    // Tomorrow in that timezone: add ~24h then re-resolve from that calendar day.
    const tomorrow = new Date(target + 36 * 3600 * 1000);
    const tp = partsInTz(tomorrow, cfg.timeZone);
    target = zonedLocalToUtcMs(
      { year: tp.year, month: tp.month, day: tp.day, hour: cfg.hour, minute: cfg.minute },
      cfg.timeZone
    );
  }
  return new Date(target);
}

function shouldHaveRunToday(now, cfg) {
  const p = partsInTz(now, cfg.timeZone);
  const scheduled = zonedLocalToUtcMs(
    { year: p.year, month: p.month, day: p.day, hour: cfg.hour, minute: cfg.minute },
    cfg.timeZone
  );
  return now.getTime() >= scheduled;
}

let timer = null;
let running = false;

async function executeAnalysis(reason) {
  if (running) {
    // eslint-disable-next-line no-console
    console.log(`[AlertJob] skip overlapping run (${reason})`);
    return;
  }
  const cfg = config();
  const today = dayKeyInTz(new Date(), cfg.timeZone);
  running = true;
  // eslint-disable-next-line no-console
  console.log(`[AlertJob] starting daily analysis (${reason}) day=${today}`);
  try {
    const result = await runHistoryAnalysis({
      lookbackDays: cfg.lookbackDays,
      limit: cfg.limit,
      enrich: cfg.enrich
    });
    writeLastRunDay(today);
    // eslint-disable-next-line no-console
    console.log(
      `[AlertJob] done created=${result.created} open=${result.openCount} bySource=${JSON.stringify(result.bySource)}`
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[AlertJob] failed: ${err.message}`);
  } finally {
    running = false;
  }
}

function scheduleNext() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const cfg = config();
  if (!cfg.enabled) return;

  const now = new Date();
  const next = nextScheduledAt(now, cfg);
  const delay = Math.max(5_000, next.getTime() - now.getTime());
  // eslint-disable-next-line no-console
  console.log(
    `[AlertJob] next run at ${next.toISOString()} (${cfg.timeZone} ${String(cfg.hour).padStart(2, "0")}:${String(cfg.minute).padStart(2, "0")}) in ${Math.round(delay / 60000)}m`
  );

  timer = setTimeout(() => {
    void executeAnalysis("scheduled").finally(() => scheduleNext());
  }, delay);
  if (typeof timer.unref === "function") timer.unref();
}

function startSystemAlertDailyJob() {
  const cfg = config();
  if (!cfg.enabled) {
    // eslint-disable-next-line no-console
    console.log("[AlertJob] disabled (ALERT_ANALYSIS_ENABLED=0)");
    return;
  }

  const now = new Date();
  const today = dayKeyInTz(now, cfg.timeZone);
  const last = readLastRunDay();

  if (shouldHaveRunToday(now, cfg) && last !== today) {
    void executeAnalysis(last ? "catch-up" : "startup").finally(() => scheduleNext());
  } else {
    scheduleNext();
  }
}

module.exports = {
  startSystemAlertDailyJob,
  /** exposed for tests */
  _internal: { dayKeyInTz, nextScheduledAt, shouldHaveRunToday, config }
};
