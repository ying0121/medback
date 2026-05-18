const nodemailer = require("nodemailer");

const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === "true";
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const alertEmail = process.env.ALERT_EMAIL || "";

const isConfigured =
  !!smtpHost && !!smtpUser && !!smtpPass && !!alertEmail;

const transporter = isConfigured
  ? nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    })
  : null;

async function sendAlertEmail(subject, text) {
  if (!transporter) {
    return { sent: false, reason: "SMTP is not configured." };
  }

  const info = await transporter.sendMail({
    from: smtpUser,
    to: alertEmail,
    subject,
    text
  });

  return { sent: true, messageId: info.messageId };
}

module.exports = { sendAlertEmail };
