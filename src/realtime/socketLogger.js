/**
 * Tiny ANSI-coloured logger used by the Socket.IO layer.
 *
 * Kept dedicated (not pulled into a global logger) because:
 *   - Realtime traffic is high-volume; we want a debug toggle (`WS_DEBUG_LOGS`)
 *     that does not influence other subsystems.
 *   - The colour scheme matches the historical server output that operators
 *     are already used to reading from logs.
 */

const C = { reset: "\x1b[0m", green: "\x1b[32m", blue: "\x1b[36m", red: "\x1b[31m" };

const WS_DEBUG = String(process.env.WS_DEBUG_LOGS || "").toLowerCase() === "true";

// eslint-disable-next-line no-console
const logOk   = (msg) => console.log(`${C.green}✅ ${msg}${C.reset}`);
// eslint-disable-next-line no-console
const logInfo = (msg) => console.log(`${C.blue}ℹ️  ${msg}${C.reset}`);
// eslint-disable-next-line no-console
const logErr  = (msg) => console.error(`${C.red}❌ ${msg}${C.reset}`);
const logDbg  = (msg) => { if (WS_DEBUG) logInfo(`[WS] ${msg}`); };

module.exports = { logOk, logInfo, logErr, logDbg, WS_DEBUG };
