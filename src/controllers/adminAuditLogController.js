const {
  listAuditLogs,
  clearAllAuditLogs,
  writeAuditFromRequest,
  extractActorFromRequest
} = require("../services/auditLogService");

function requireAdmin(req, res) {
  const actorRole = String(req.headers?.["x-admin-user-role"] || "").trim();
  if (actorRole && actorRole !== "Admin") {
    res.status(403).json({ error: "Only Admin users can manage audit logs." });
    return false;
  }
  return true;
}

async function listAuditLogsHandler(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const result = await listAuditLogs({
      q: req.query?.q || "",
      action: req.query?.action || "",
      resourceType: req.query?.resourceType || "",
      actorEmail: req.query?.actorEmail || "",
      outcome: req.query?.outcome || "",
      clinicId: req.query?.clinicId || "",
      from: req.query?.from || null,
      to: req.query?.to || null,
      page: req.query?.page,
      limit: req.query?.limit
    });

    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function clearAuditLogsHandler(req, res, next) {
  try {
    if (!requireAdmin(req, res)) return;

    const actor = extractActorFromRequest(req);
    const result = await clearAllAuditLogs();

    // Record that the trail was cleared (single surviving event after truncate).
    await writeAuditFromRequest(req, {
      action: "DELETE",
      resourceType: "audit_log",
      outcome: "success",
      statusCode: 200,
      summary: `${actor.actorEmail || actor.actorName || "Admin"} cleared all audit logs (${result.deleted} events)`,
      metadata: { deleted: result.deleted }
    });

    return res.status(200).json({ success: true, deleted: result.deleted });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAuditLogs: listAuditLogsHandler,
  clearAuditLogs: clearAuditLogsHandler
};
