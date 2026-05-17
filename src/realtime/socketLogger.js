/**
 * Socket.IO logging helpers (file-based, one log file per calendar day).
 *
 * Realtime traffic is high-volume; use `WS_DEBUG_LOGS=true` for verbose
 * per-message logs without affecting other subsystems.
 */

const logger = require("../utils/logger");

const WS_DEBUG = String(process.env.WS_DEBUG_LOGS || "").toLowerCase() === "true";

const logOk = (msg) => logger.info(`✅ ${msg}`);
const logInfo = (msg) => logger.info(`ℹ️  ${msg}`);
const logErr = (msg) => logger.error(`❌ ${msg}`);
const logDbg = (msg) => {
  if (WS_DEBUG) logger.info(`[WS] ${msg}`);
};

module.exports = { logOk, logInfo, logErr, logDbg, WS_DEBUG };
