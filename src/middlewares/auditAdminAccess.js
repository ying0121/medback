/**
 * Attach admin actor headers onto req and automatically write HIPAA audit events
 * for admin API access after the response finishes.
 */

const {
  writeAuditFromRequest,
  extractActorFromRequest,
  inferAction,
  inferResourceFromPath
} = require("../services/auditLogService");

function shouldSkipAudit(req) {
  const method = String(req.method || "").toUpperCase();
  if (method === "OPTIONS" || method === "HEAD") return true;
  // Page loads / list fetches — do not treat as audit events.
  if (method === "GET") return true;
  const path = String(req.originalUrl || req.url || "");
  if (path === "/health" || path.startsWith("/health?")) return true;
  // Login is audited explicitly with richer actor details (no password stored).
  if (path.startsWith("/api/admin/auth/login")) return true;
  // Clear-all is audited explicitly after truncate.
  if (method === "DELETE" && path.split("?")[0].replace(/\/$/, "") === "/api/admin/audit-logs") {
    return true;
  }
  return false;
}

function buildSummary(req, res) {
  const action = inferAction(req.method);
  const resource = inferResourceFromPath(req.originalUrl || req.url || "");
  const status = res.statusCode;
  const actor = extractActorFromRequest(req);
  const who = actor.actorEmail || actor.actorName || "unknown actor";
  return `${who} ${action.toLowerCase()} ${resource} (${status})`;
}

function auditAdminAccess(req, res, next) {
  if (shouldSkipAudit(req)) return next();

  const started = Date.now();
  res.on("finish", () => {
    const path = String(req.originalUrl || req.url || "");
    // Skip pure static-ish noise under admin if needed later
    if (!path.startsWith("/api/admin")) return;

    const statusCode = res.statusCode || 0;
    const outcome = statusCode >= 400 ? "failure" : "success";
    const action =
      path.includes("/auth/login") && req.method === "POST"
        ? statusCode < 400
          ? "LOGIN_SUCCESS"
          : "LOGIN_FAILURE"
        : inferAction(req.method);

    void writeAuditFromRequest(req, {
      action,
      outcome,
      statusCode,
      summary: buildSummary(req, res),
      metadata: {
        durationMs: Date.now() - started,
        query: req.query || undefined
      }
    });
  });

  return next();
}

module.exports = {
  auditAdminAccess
};
