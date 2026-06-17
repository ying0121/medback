/**
 * HTML + plain-text templates for appointment-request notification emails.
 * Inline CSS is used throughout for broad mail-client compatibility.
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatPatientType(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "new") return "New Patient";
  if (normalized === "existing") return "Existing Patient";
  if (!normalized) return "Not specified";
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function patientTypeDescription(type) {
  const normalized = String(type || "").trim().toLowerCase();
  if (normalized === "new") {
    return "This person is not yet in your system. You may need to create a new patient chart before scheduling.";
  }
  if (normalized === "existing") {
    return "This person indicated they are already a patient at your clinic. Please locate their chart before scheduling.";
  }
  return "Patient status was not specified. Please verify whether this person is new or existing before scheduling.";
}

function formatChannel(replyType) {
  return replyType === "voice" ? "Voice Assistant" : "Web Chat";
}

function formatDateTime(isoString) {
  try {
    return new Date(isoString).toLocaleString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return isoString;
  }
}

function formatClinicAddress(clinic = {}) {
  const line1 = [clinic.address1, clinic.address2].filter(Boolean).join(", ");
  const line2 = [clinic.city, clinic.state, clinic.zip].filter(Boolean).join(", ");
  return [line1, line2].filter(Boolean).join(" · ") || null;
}

function hasValue(value) {
  return value != null && String(value).trim() !== "";
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

function buildPlainSection(title, rows) {
  const lines = rows
    .filter(([, value]) => hasValue(value))
    .map(([label, value]) => `  ${label}: ${value}`);
  if (!lines.length) return "";
  return `${title}\n${lines.join("\n")}\n`;
}

function buildPatientRows(patientInfo = {}, patientType) {
  const rows = [
    ["Patient Type", patientType],
    ["Full Name", patientInfo.name],
    ["Date of Birth", patientInfo.dob],
    ["Phone", patientInfo.phone],
    ["Email", patientInfo.email]
  ];

  const knownKeys = new Set(["type", "name", "dob", "phone", "email"]);
  for (const [key, value] of Object.entries(patientInfo)) {
    if (knownKeys.has(key) || !hasValue(value)) continue;
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/^./, (char) => char.toUpperCase())
      .trim();
    rows.push([label, value]);
  }

  return rows;
}

function buildClinicRows(clinic = {}, clinicLabel) {
  return [
    ["Clinic Name", clinicLabel],
    ["Address", formatClinicAddress(clinic)],
    ["Clinic Phone", clinic.phone],
    ["Clinic Email", clinic.email],
    ["Website", clinic.web]
  ];
}

function buildNextSteps(patientInfo = {}) {
  const steps = [
    "Review the patient details below and confirm they are complete.",
    patientInfo.type === "existing"
      ? "Locate the existing patient chart in your scheduling system."
      : "Create a new patient record if this person is not yet in your system.",
    "Contact the patient by phone or email to confirm preferred dates, times, and visit type.",
    "Enter the confirmed appointment into your schedule and send the patient a confirmation."
  ];
  return steps;
}

/**
 * @param {object} params
 * @param {string|null} params.clinicName
 * @param {string|null} params.clinicAcronym
 * @param {object|null} params.clinic
 * @param {number} params.conversationId
 * @param {object} params.patientInfo
 * @param {string} [params.replyType]
 */
function buildAppointmentRequestEmail({
  clinicName,
  clinicAcronym,
  clinic = {},
  conversationId,
  patientInfo = {},
  replyType = "chat"
}) {
  const submittedAt = new Date().toISOString();
  const clinicLabel = clinicName || clinicAcronym || clinic.name || clinic.acronym || "Clinic";
  const patientType = formatPatientType(patientInfo.type);
  const channel = formatChannel(replyType);
  const patientDescription = patientTypeDescription(patientInfo.type);
  const formattedSubmittedAt = formatDateTime(submittedAt);

  const patientRows = buildPatientRows(patientInfo, patientType);
  const clinicRows = buildClinicRows(clinic, clinicLabel);
  const nextSteps = buildNextSteps(patientInfo);

  const subject = `New Appointment Request — ${patientInfo.name || "Patient"} @ ${clinicLabel}`;

  const text = [
    "NEW APPOINTMENT REQUEST",
    "========================",
    "",
    "A patient has submitted an appointment request through your Medical Bot assistant.",
    "Please review the details below and follow up with the patient to confirm scheduling.",
    "",
    "REQUEST SUMMARY",
    `  Clinic: ${clinicLabel}`,
    `  Case Number: #${conversationId}`,
    `  Submitted: ${formattedSubmittedAt}`,
    `  Request Channel: ${channel}`,
    "",
    buildPlainSection("CLINIC DETAILS", clinicRows),
    buildPlainSection("PATIENT DETAILS", patientRows),
    "PATIENT NOTE",
    `  ${patientDescription}`,
    "",
    "RECOMMENDED NEXT STEPS",
    ...nextSteps.map((step, index) => `  ${index + 1}. ${step}`),
    "",
    "ACTION REQUIRED",
    `  Please contact ${patientInfo.name || "the patient"} to confirm availability and finalize the appointment.`,
    `  Submitted on ${formattedSubmittedAt}.`,
    "",
    "—",
    "This notification was sent automatically by the Medical Bot chat assistant.",
    "Do not reply to this email — contact the patient directly using the details above."
  ].filter(Boolean).join("\n");

  const patientTable = patientRows.map(([label, value]) => {
    if (label === "Phone" && hasValue(value)) {
      const tel = String(value).replace(/[^\d+]/g, "");
      return detailRow(label, value, { link: `tel:${tel}` });
    }
    if (label === "Email" && hasValue(value)) {
      return detailRow(label, value, { link: `mailto:${String(value).trim()}` });
    }
    return detailRow(label, value);
  }).join("");

  const clinicTable = clinicRows.map(([label, value]) => detailRow(label, value)).join("");
  const nextStepsHtml = nextSteps.map((step, index) => `
    <tr>
      <td style="padding:0 0 12px;color:#334155;font-size:14px;line-height:1.6;vertical-align:top;width:28px;">${index + 1}.</td>
      <td style="padding:0 0 12px;color:#334155;font-size:14px;line-height:1.6;vertical-align:top;">${escapeHtml(step)}</td>
    </tr>`).join("");

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
              <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.82);margin-bottom:8px;">Medical Bot · Staff Notification</div>
              <div style="font-size:26px;line-height:1.25;font-weight:700;color:#ffffff;margin:0;">New Appointment Request</div>
              <div style="font-size:15px;line-height:1.6;color:rgba(255,255,255,0.92);margin-top:10px;">
                A patient has submitted an appointment request through your online assistant.
                Please review the information below and follow up to confirm scheduling.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;">
                <tr>
                  <td style="padding:18px 20px;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2563eb;margin-bottom:10px;">Request Summary</div>
                    <div style="font-size:18px;font-weight:700;color:#0f172a;margin-bottom:8px;">${escapeHtml(clinicLabel)}</div>
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                      ${detailRow("Case Number", `#${conversationId}`)}
                      ${detailRow("Submitted", formattedSubmittedAt)}
                      ${detailRow("Request Channel", channel)}
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Clinic Details</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:8px 18px 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${clinicTable}</table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Patient Details</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:8px 18px 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${patientTable}</table>
                  </td>
                </tr>
              </table>
              <div style="margin-top:12px;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;font-size:14px;line-height:1.6;color:#166534;">
                <strong>Patient note:</strong> ${escapeHtml(patientDescription)}
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Recommended Next Steps</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${nextStepsHtml}</table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:14px;font-weight:700;color:#9a3412;margin-bottom:6px;">Action Required</div>
                    <div style="font-size:14px;line-height:1.6;color:#7c2d12;">
                      Please contact <strong>${escapeHtml(patientInfo.name || "the patient")}</strong>
                      ${hasValue(patientInfo.phone) ? ` at <strong>${escapeHtml(patientInfo.phone)}</strong>` : ""}
                      to confirm availability, preferred visit type, and finalize the appointment.
                      Submitted on <strong>${escapeHtml(formattedSubmittedAt)}</strong>.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
                Automated staff notification from the Medical Bot chat assistant.<br>
                Do not reply to this email — reach out to the patient directly using the contact details above.
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

module.exports = { buildAppointmentRequestEmail };
