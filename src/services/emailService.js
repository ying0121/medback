const nodemailer = require("nodemailer");
const { buildAppointmentRequestEmail } = require("../templates/appointmentRequestEmail");
const { buildCallAnalysisEmail } = require("../templates/callAnalysisEmail");
const {
  buildPatientMeetingEmail,
  buildPatientMeetingInviteIcs
} = require("../templates/patientMeetingEmail");

const { isNonPatientEmail } = require("./appointmentIntakeService");

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

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function resolvePatientEmail(patientInfo = {}) {
  const candidates = [
    patientInfo.email,
    patientInfo.emailAddress,
    patientInfo.patientEmail,
    patientInfo.userEmail
  ];
  for (const candidate of candidates) {
    const email = String(candidate || "").trim();
    if (isValidEmail(email) && !isNonPatientEmail(email)) return email;
  }
  return "";
}

async function sendMailSafe(options, label) {
  if (!transporter) {
    return { sent: false, reason: "SMTP is not configured." };
  }
  try {
    const info = await transporter.sendMail(options);
    const accepted = Array.isArray(info.accepted) ? info.accepted.join(", ") : "";
    const rejected = Array.isArray(info.rejected) ? info.rejected.filter(Boolean) : [];
    if (rejected.length) {
      // eslint-disable-next-line no-console
      console.error(`[Email] ${label} rejected=${rejected.join(", ")}`);
      return { sent: false, reason: `SMTP rejected: ${rejected.join(", ")}`, messageId: info.messageId };
    }
    // eslint-disable-next-line no-console
    console.log(`[Email] ${label} sent messageId=${info.messageId || "-"} accepted=${accepted || options.to}`);
    return { sent: true, messageId: info.messageId, to: options.to };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Email] ${label} failed: ${err.message}`);
    return { sent: false, reason: err.message };
  }
}

async function sendAlertEmail(subject, text) {
  if (!alertEmail) {
    return { sent: false, reason: "ALERT_EMAIL is not configured." };
  }
  return sendMailSafe(
    {
      from: smtpUser,
      to: alertEmail,
      subject,
      text
    },
    "alert"
  );
}

async function sendAppointmentRequestEmail(details) {
  if (!appointmentNotifyEmails.length) {
    return { sent: false, reason: "APPOINTMENT_NOTIFY_EMAILS is not configured." };
  }

  const { subject, text, html } = buildAppointmentRequestEmail(details);
  return sendMailSafe(
    {
      from: smtpUser,
      to: appointmentNotifyEmails.join(", "),
      subject,
      text,
      html
    },
    "staff appointment"
  );
}

async function sendCallAnalysisEmail(details) {
  if (!callAnalysisNotifyEmails.length) {
    return { sent: false, reason: "CALL_ANALYSIS_NOTIFY_EMAILS is not configured." };
  }

  const { subject, text, html } = buildCallAnalysisEmail(details);
  return sendMailSafe(
    {
      from: smtpUser,
      to: smtpUser,
      bcc: callAnalysisNotifyEmails.join(", "),
      subject,
      text,
      html
    },
    "call analysis"
  );
}

async function sendPatientMeetingNotificationEmail(details) {
  const patientEmail = resolvePatientEmail(details?.patientInfo || {});
  if (!patientEmail) {
    return { sent: false, reason: "Patient email is missing or invalid." };
  }

  const patientInfo = { ...(details.patientInfo || {}), email: patientEmail };
  const { subject, text, html } = buildPatientMeetingEmail({ ...details, patientInfo });
  const clinicName = details.clinicName || details.clinic?.name || "Clinic";
  const ics = buildPatientMeetingInviteIcs({
    ...details,
    patientInfo,
    organizerEmail: smtpUser
  });

  const mail = {
    from: smtpUser,
    to: patientEmail,
    replyTo: details.clinic?.email || smtpUser,
    subject,
    text,
    html
  };

  if (ics) {
    mail.icalEvent = {
      method: "REQUEST",
      filename: "invite.ics",
      content: ics
    };
  }

  const result = await sendMailSafe(mail, `patient meeting to ${patientEmail}`);
  return { ...result, to: patientEmail };
}

module.exports = {
  sendAlertEmail,
  sendAppointmentRequestEmail,
  sendCallAnalysisEmail,
  sendPatientMeetingNotificationEmail,
  resolvePatientEmail
};
