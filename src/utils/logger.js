const fs = require("fs");
const path = require("path");

const LOG_DIR = process.env.LOG_DIR
  ? path.resolve(process.env.LOG_DIR)
  : path.resolve(process.cwd(), "logs");

function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function formatLine(level, message) {
  const ts = new Date().toISOString();
  return `[${ts}] [${level.toUpperCase()}] ${message}`;
}

function logFilePath(date = new Date()) {
  ensureLogDir();
  return path.join(LOG_DIR, `${dateKey(date)}.log`);
}

function write(level, message) {
  const line = `${formatLine(level, message)}\n`;
  fs.appendFile(logFilePath(), line, () => {});
}

function toMessage(value) {
  if (value instanceof Error) {
    return value.stack || value.message;
  }
  return String(value);
}

const logger = {
  info(message) {
    write("info", toMessage(message));
  },
  warn(message) {
    write("warn", toMessage(message));
  },
  error(message) {
    write("error", toMessage(message));
  },
  debug(message) {
    if (String(process.env.DEBUG_LOGS || "").toLowerCase() === "true") {
      write("debug", toMessage(message));
    }
  },
  /** Writable stream for Morgan HTTP request logging. */
  httpStream: {
    write(message) {
      write("info", String(message).trim());
    }
  }
};

module.exports = logger;
