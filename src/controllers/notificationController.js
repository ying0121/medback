const { sendAlertSms } = require("../services/twilioService");
const { sendAlertEmail } = require("../services/emailService");
const { alertSchema } = require("../utils/validators");

async function sendAlert(req, res, next) {
  try {
    const { value, error } = alertSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: error.message });
    }

    const smsResult = await sendAlertSms(`${value.subject}\n${value.message}`);
    const emailResult = await sendAlertEmail(value.subject, value.message);

    return res.status(200).json({
      sms: smsResult,
      email: emailResult
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { sendAlert };
