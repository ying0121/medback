const nodemailer = require("nodemailer");
const { buildAppointmentRequestEmail } = require("../templates/appointmentRequestEmail");
const { buildCallAnalysisEmail } = require("../templates/callAnalysisEmail");

const smtpHost = process.env.SMTP_HOST || "";
const smtpPort = Number(process.env.SMTP_PORT || 587);
const smtpSecure = process.env.SMTP_SECURE === "true";
const smtpUser = process.env.SMTP_USER || "";
const smtpPass = process.env.SMTP_PASS || "";
const alertEmail = process.env.ALERT_EMAIL || "";
const appointmentNotifyEmails = (
  process.env.APPOINTMENT_NOTIFY_EMAILS || "roswellg@gmail.com,uross1026@gmail.com"
)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);
const callAnalysisNotifyEmails = (
  process.env.CALL_ANALYSIS_NOTIFY_EMAILS || "uross1026@gmail.com,roswellg@gmail.com"
)
  .split(",")
  .map((email) => email.trim())
  .filter(Boolean);

const smtpConfigured = !!smtpHost && !!smtpUser && !!smtpPass;

const transporter = smtpConfigured
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
  if (!alertEmail) {
    return { sent: false, reason: "ALERT_EMAIL is not configured." };
  }

  const info = await transporter.sendMail({
    from: smtpUser,
    to: alertEmail,
    subject,
    text
  });

  return { sent: true, messageId: info.messageId };
}

async function sendAppointmentRequestEmail(details) {
  if (!transporter) {
    return { sent: false, reason: "SMTP is not configured." };
  }
  if (!appointmentNotifyEmails.length) {
    return { sent: false, reason: "APPOINTMENT_NOTIFY_EMAILS is not configured." };
  }

  const { subject, text, html } = buildAppointmentRequestEmail(details);

  const info = await transporter.sendMail({
    from: smtpUser,
    to: appointmentNotifyEmails.join(", "),
    subject,
    text,
    html
  });

  return { sent: true, messageId: info.messageId };
}

async function sendCallAnalysisEmail(details) {
  if (!transporter) {
    return { sent: false, reason: "SMTP is not configured." };
  }
  if (!callAnalysisNotifyEmails.length) {
    return { sent: false, reason: "CALL_ANALYSIS_NOTIFY_EMAILS is not configured." };
  }

  const { subject, text, html } = buildCallAnalysisEmail(details);

  const info = await transporter.sendMail({
    from: smtpUser,
    to: smtpUser,
    bcc: callAnalysisNotifyEmails.join(", "),
    subject,
    text,
    html
  });

  return { sent: true, messageId: info.messageId };
}

module.exports = { sendAlertEmail, sendAppointmentRequestEmail, sendCallAnalysisEmail };
