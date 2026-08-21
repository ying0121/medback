/**
 * Patient-facing appointment confirmation email with Google Meet link.
 * Sent via SMTP after a Meet event is created; Google Calendar sends a separate invitation.
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasValue(value) {
  return value != null && String(value).trim() !== "";
}

function formatDateTime(value) {
  if (!hasValue(value)) return null;
  try {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).trim();
    return date.toLocaleString("en-US", {
      timeZone: "America/New_York",
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short"
    });
  } catch {
    return String(value).trim();
  }
}

function formatClinicAddress(clinic = {}) {
  const line1 = [clinic.address1, clinic.address2].filter(Boolean).join(", ");
  const line2 = [clinic.city, clinic.state, clinic.zip].filter(Boolean).join(", ");
  return [line1, line2].filter(Boolean).join(" · ") || null;
}

function formatSource(source) {
  const normalized = String(source || "").trim().toLowerCase();
  if (normalized === "phone" || normalized === "voice") return "phone call";
  return "online assistant";
}

function detailRow(label, value, { link = null } = {}) {
  const display = hasValue(value) ? String(value).trim() : "—";
  const valueHtml = link && hasValue(value)
    ? `<a href="${escapeHtml(link)}" style="color:#0369a1;text-decoration:none;font-weight:600;">${escapeHtml(display)}</a>`
    : escapeHtml(display);

  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#64748b;font-size:13px;width:38%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0 10px 16px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:600;vertical-align:top;">${valueHtml}</td>
    </tr>`;
}

/**
 * @param {object} params
 * @param {string|null} params.clinicName
 * @param {object|null} params.clinic
 * @param {object} params.patientInfo
 * @param {object} params.googleMeet
 * @param {string} [params.source]
 */
function buildPatientMeetingEmail({
  clinicName,
  clinic = {},
  patientInfo = {},
  googleMeet = {},
  source = "chat"
} = {}) {
  const clinicLabel = clinicName || clinic.name || "Your clinic";
  const patientName = hasValue(patientInfo.name) ? String(patientInfo.name).trim() : "there";
  const meetLink = String(googleMeet.meetLink || "").trim();
  const appointmentTime =
    formatDateTime(googleMeet.start) ||
    formatDateTime(patientInfo.datetime) ||
    (hasValue(patientInfo.date) && hasValue(patientInfo.time)
      ? `${String(patientInfo.date).trim()} at ${String(patientInfo.time).trim()}`
      : null);
  const clinicAddress = formatClinicAddress(clinic);
  const sourceLabel = formatSource(source);
  const calendarInviteNote =
    "A calendar invitation is attached to this email. Add it to your calendar, then join with the Google Meet link at your scheduled time.";

  const subject = `Your appointment with ${clinicLabel}`;

  const text = [
    `Hello ${patientName},`,
    "",
    `Your appointment with ${clinicLabel} has been scheduled.`,
    "",
    appointmentTime ? `Date & time: ${appointmentTime}` : "",
    meetLink ? `Join Google Meet: ${meetLink}` : "",
    "",
    "APPOINTMENT DETAILS",
    `  Clinic: ${clinicLabel}`,
    clinicAddress ? `  Address: ${clinicAddress}` : "",
    clinic.phone ? `  Clinic phone: ${clinic.phone}` : "",
    clinic.email ? `  Clinic email: ${clinic.email}` : "",
    patientInfo.phone ? `  Your phone: ${patientInfo.phone}` : "",
    "",
    calendarInviteNote,
    "",
    `This confirmation was sent after your ${sourceLabel} with our assistant.`,
    "If you need to reschedule or have questions, please contact the clinic directly.",
    "",
    "—",
    clinicLabel
  ]
    .filter(Boolean)
    .join("\n");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f1f5f9;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,0.08);">
          <tr>
            <td style="background:linear-gradient(135deg,#0ea5e9 0%,#0369a1 100%);padding:28px 32px;">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.82);margin-bottom:8px;">${escapeHtml(clinicLabel)}</div>
              <div style="font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;margin:0;">Your appointment is confirmed</div>
              <div style="font-size:15px;line-height:1.6;color:rgba(255,255,255,0.92);margin-top:10px;">
                Hello ${escapeHtml(patientName)}, your appointment has been scheduled. Please save the details below.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2563eb;margin-bottom:10px;">Appointment Summary</div>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      ${detailRow("Clinic", clinicLabel)}
                      ${appointmentTime ? detailRow("Date & time", appointmentTime) : ""}
                      ${meetLink ? detailRow("Google Meet", meetLink, { link: meetLink }) : ""}
                    </table>
                    ${
                      meetLink
                        ? `<div style="margin-top:16px;text-align:center;">
                            <a href="${escapeHtml(meetLink)}" style="display:inline-block;background:#0369a1;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:12px 20px;border-radius:10px;">Join Google Meet</a>
                          </div>`
                        : ""
                    }
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Clinic Contact</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:8px 18px 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      ${clinicAddress ? detailRow("Address", clinicAddress) : ""}
                      ${clinic.phone ? detailRow("Phone", clinic.phone, { link: `tel:${String(clinic.phone).replace(/[^\d+]/g, "")}` }) : ""}
                      ${clinic.email ? detailRow("Email", clinic.email, { link: `mailto:${String(clinic.email).trim()}` }) : ""}
                      ${clinic.web ? detailRow("Website", clinic.web, { link: String(clinic.web).trim() }) : ""}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;">
              <div style="padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;font-size:14px;line-height:1.6;color:#166534;">
                ${escapeHtml(calendarInviteNote)}
              </div>
              <div style="margin-top:16px;font-size:14px;line-height:1.6;color:#475569;">
                This confirmation was sent after your ${escapeHtml(sourceLabel)} with our assistant.
                If you need to reschedule or have questions, please contact ${escapeHtml(clinicLabel)} directly.
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}

function icsEscape(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function icsUtc(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function foldIcsLine(line) {
  const text = String(line || "");
  if (text.length <= 74) return text;
  const chunks = [];
  let remaining = text;
  chunks.push(remaining.slice(0, 74));
  remaining = remaining.slice(74);
  while (remaining.length) {
    chunks.push(` ${remaining.slice(0, 73)}`);
    remaining = remaining.slice(73);
  }
  return chunks.join("\r\n");
}

function buildPatientMeetingInviteIcs({
  clinicName,
  clinic = {},
  patientInfo = {},
  googleMeet = {},
  organizerEmail = ""
} = {}) {
  const clinicLabel = clinicName || clinic.name || "Clinic";
  const patientName = String(patientInfo.name || "Patient").trim() || "Patient";
  const patientEmail = String(patientInfo.email || "").trim();
  const meetLink = String(googleMeet.meetLink || "").trim();
  const startUtc = icsUtc(googleMeet.start);
  const endUtc = icsUtc(googleMeet.end || googleMeet.start);
  if (!startUtc || !endUtc || !patientEmail) return "";

  const uid = `${googleMeet.eventId || `appt-${Date.now()}`}@mediback`;
  const stamp = icsUtc(new Date());
  const organizer = String(organizerEmail || clinic.email || "").trim();
  const description = [
    `Appointment with ${clinicLabel}`,
    meetLink ? `Join Google Meet: ${meetLink}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Medical Bot//Appointment//EN",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${icsEscape(`Appointment with ${clinicLabel}`)}`,
    `DESCRIPTION:${icsEscape(description)}`,
    meetLink ? `LOCATION:${icsEscape(meetLink)}` : "LOCATION:Google Meet",
    meetLink ? `URL:${meetLink}` : null,
    organizer ? `ORGANIZER;CN=${icsEscape(clinicLabel)}:mailto:${organizer}` : null,
    `ATTENDEE;CN=${icsEscape(patientName)};RSVP=TRUE;PARTSTAT=NEEDS-ACTION;ROLE=REQ-PARTICIPANT:mailto:${patientEmail}`,
    "STATUS:CONFIRMED",
    "SEQUENCE:0",
    "BEGIN:VALARM",
    "TRIGGER:-PT30M",
    "ACTION:DISPLAY",
    "DESCRIPTION:Appointment reminder",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR"
  ].filter((line) => line != null);

  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}

module.exports = { buildPatientMeetingEmail, buildPatientMeetingInviteIcs };
