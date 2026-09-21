const {
  runHistoryAnalysis,
  listAlerts,
  getAlert,
  deleteAlert,
  deleteAllAlerts,
  updateAlertStatus,
  notifyAlertEmail,
  notifyAlertVoice
} = require("../services/systemAlertService");

async function listAlertsHandler(req, res, next) {
  try {
    const result = await listAlerts({
      q: req.query?.q || "",
      priority: req.query?.priority || "",
      status: req.query?.status || "",
      sourceType: req.query?.sourceType || "",
      clinicId: req.query?.clinicId || "",
      page: req.query?.page,
      limit: req.query?.limit
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function getAlertHandler(req, res, next) {
  try {
    const alert = await getAlert(req.params.id);
    if (!alert) return res.status(404).json({ error: "Alert not found." });
    return res.status(200).json({ alert });
  } catch (err) {
    return next(err);
  }
}

async function runAnalysisHandler(req, res, next) {
  try {
    const result = await runHistoryAnalysis({
      lookbackDays: req.body?.lookbackDays,
      limit: req.body?.limit,
      enrich: req.body?.enrich
    });
    return res.status(200).json({ success: true, ...result });
  } catch (err) {
    return next(err);
  }
}

async function deleteAlertHandler(req, res, next) {
  try {
    const result = await deleteAlert(req.params.id);
    if (!result.deleted) return res.status(404).json({ error: "Alert not found." });
    return res.status(200).json({ success: true, deleted: result.deleted });
  } catch (err) {
    return next(err);
  }
}

async function deleteAllAlertsHandler(req, res, next) {
  try {
    const result = await deleteAllAlerts();
    return res.status(200).json({ success: true, deleted: result.deleted });
  } catch (err) {
    return next(err);
  }
}

async function updateStatusHandler(req, res, next) {
  try {
    const result = await updateAlertStatus(req.params.id, req.body?.status);
    if (result.error) return res.status(400).json({ error: result.error });
    return res.status(200).json({ success: true, alert: result.alert });
  } catch (err) {
    return next(err);
  }
}

async function notifyEmailHandler(req, res, next) {
  try {
    const result = await notifyAlertEmail(req.params.id, {
      doctorId: req.body?.doctorId,
      toEmail: req.body?.toEmail
    });
    if (result.error) return res.status(400).json({ error: result.error });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

async function notifyVoiceHandler(req, res, next) {
  try {
    const result = await notifyAlertVoice(req.params.id, {
      doctorId: req.body?.doctorId,
      toPhone: req.body?.toPhone,
      toEmail: req.body?.toEmail,
      clinicId: req.body?.clinicId
    });
    if (result.error) return res.status(400).json({ error: result.error });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listAlerts: listAlertsHandler,
  getAlert: getAlertHandler,
  runAnalysis: runAnalysisHandler,
  deleteAlert: deleteAlertHandler,
  deleteAllAlerts: deleteAllAlertsHandler,
  updateStatus: updateStatusHandler,
  notifyEmail: notifyEmailHandler,
  notifyVoice: notifyVoiceHandler
};
