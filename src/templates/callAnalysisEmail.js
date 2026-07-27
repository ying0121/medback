/**
 * HTML + plain-text templates for post-call analysis notification emails.
 * Inline CSS is used throughout for broad mail-client compatibility.
 */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hasValue(value) {
  if (Array.isArray(value)) return value.some((item) => hasValue(item));
  return value != null && String(value).trim() !== "";
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

function formatDuration(seconds) {
  const total = Number(seconds || 0);
  if (!Number.isFinite(total) || total <= 0) return "—";
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins <= 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

function formatClinicAddress(clinic = {}) {
  const line1 = [clinic.address1, clinic.address2].filter(Boolean).join(", ");
  const line2 = [clinic.city, clinic.state, clinic.zip].filter(Boolean).join(", ");
  return [line1, line2].filter(Boolean).join(" · ") || null;
}

function titleCase(value) {
  const text = String(value || "").trim();
  if (!text) return "Unknown";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function urgencyStyles(urgency) {
  const normalized = String(urgency || "unknown").toLowerCase();
  if (normalized === "emergency") {
    return { bg: "#fef2f2", border: "#fecaca", text: "#991b1b", badge: "#dc2626" };
  }
  if (normalized === "high") {
    return { bg: "#fff7ed", border: "#fed7aa", text: "#9a3412", badge: "#ea580c" };
  }
  if (normalized === "medium") {
    return { bg: "#fffbeb", border: "#fde68a", text: "#92400e", badge: "#d97706" };
  }
  if (normalized === "low") {
    return { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", badge: "#16a34a" };
  }
  return { bg: "#f8fafc", border: "#e2e8f0", text: "#475569", badge: "#64748b" };
}

function sentimentStyles(sentiment) {
  const normalized = String(sentiment || "unknown").toLowerCase();
  if (normalized === "distressed" || normalized === "negative") {
    return { bg: "#fdf2f8", border: "#fbcfe8", text: "#9d174d" };
  }
  if (normalized === "positive") {
    return { bg: "#ecfdf5", border: "#a7f3d0", text: "#065f46" };
  }
  return { bg: "#f8fafc", border: "#e2e8f0", text: "#334155" };
}

function detailRow(label, value, { link = null, multiline = false } = {}) {
  const display = hasValue(value) ? String(value).trim() : "—";
  const valueHtml = link && hasValue(value)
    ? `<a href="${escapeHtml(link)}" style="color:#4338ca;text-decoration:none;font-weight:600;">${escapeHtml(display)}</a>`
    : escapeHtml(display);

  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#64748b;font-size:13px;width:34%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0 10px 16px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:600;vertical-align:top;${multiline ? "line-height:1.6;" : ""}">${valueHtml}</td>
    </tr>`;
}

function buildHelpRequestedList(helpRequested = []) {
  const items = Array.isArray(helpRequested)
    ? helpRequested.filter((item) => hasValue(item))
    : [];
  if (!items.length) return "—";
  return items.map((item) => titleCase(String(item).replace(/_/g, " "))).join(", ");
}

function buildPlainSection(title, rows) {
  const lines = rows
    .filter(([, value]) => hasValue(value))
    .map(([label, value]) => `  ${label}: ${value}`);
  if (!lines.length) return "";
  return `${title}\n${lines.join("\n")}\n`;
}

/**
 * @param {object} params
 */
function buildCallAnalysisEmail({
  call = {},
  analysis = {},
  clinic = {},
  clinicLabel = "Clinic",
  transcriptTurns = []
}) {
  const analyzedAt = analysis.createdAt || new Date().toISOString();
  const formattedAnalyzedAt = formatDateTime(analyzedAt);
  const formattedCallAt = formatDateTime(call.createdAt || analyzedAt);
  const duration = formatDuration(call.seconds);
  const urgency = titleCase(analysis.urgency || "unknown");
  const sentiment = titleCase(analysis.sentiment || "unknown");
  const helpRequestedText = buildHelpRequestedList(analysis.helpRequested);
  const patientDisplayName = analysis.patientName || "Unknown caller";
  const callerPhone = analysis.callerPhone || call.phone || "—";
  const patientPhone = analysis.patientPhoneSpoken || "—";
  const urgencyTheme = urgencyStyles(analysis.urgency);
  const sentimentTheme = sentimentStyles(analysis.sentiment);

  const subject = `Call Analysis — ${patientDisplayName} · ${clinicLabel}`;

  const callRows = [
    ["Clinic", clinicLabel],
    ["Call ID", call.id ? `#${call.id}` : "—"],
    ["Call SID", call.callSid || "—"],
    ["Call Started", formattedCallAt],
    ["Duration", duration],
    ["Caller ID", callerPhone]
  ];

  const patientRows = [
    ["Patient Name", analysis.patientName],
    ["Phone (spoken)", patientPhone],
    ["Reason for Call", analysis.reasonForCall],
    ["Symptoms / Conditions", analysis.symptomsConditions],
    ["Help Requested", helpRequestedText],
    ["Urgency", urgency],
    ["Sentiment", sentiment],
    ["Outcome / Next Step", analysis.outcomeNextStep]
  ];

  const keyQuotes = Array.isArray(analysis.keyQuotes)
    ? analysis.keyQuotes.filter((quote) => hasValue(quote))
    : [];

  const text = [
    "INBOUND CALL ANALYSIS",
    "=====================",
    "",
    analysis.summary || "No summary available.",
    "",
    buildPlainSection("CALL DETAILS", callRows),
    buildPlainSection("PATIENT & CLINICAL INTELLIGENCE", patientRows),
    keyQuotes.length ? "KEY QUOTES" : "",
    ...keyQuotes.map((quote, index) => `  ${index + 1}. "${quote}"`),
    hasValue(analysis.notes) ? "\nSTAFF NOTES\n  " + analysis.notes : "",
    transcriptTurns.length ? "\nTRANSCRIPT PREVIEW" : "",
    ...transcriptTurns.slice(0, 8).map((turn) => `  ${turn.role}: ${turn.text}`),
    "",
    `Analyzed on ${formattedAnalyzedAt}.`,
    "",
    "—",
    "Automated post-call intelligence from the Medical Bot voice assistant.",
    "Do not reply to this email — follow up with the patient using the contact details above."
  ].filter(Boolean).join("\n");

  const callTable = callRows.map(([label, value]) => {
    if (label === "Caller ID" && hasValue(value) && value !== "—") {
      const tel = String(value).replace(/[^\d+]/g, "");
      return detailRow(label, value, { link: `tel:${tel}` });
    }
    return detailRow(label, value);
  }).join("");

  const patientTable = [
    detailRow("Patient Name", analysis.patientName),
    detailRow("Phone (spoken)", patientPhone),
    detailRow("Reason for Call", analysis.reasonForCall, { multiline: true }),
    detailRow("Symptoms / Conditions", analysis.symptomsConditions, { multiline: true }),
    detailRow("Help Requested", helpRequestedText),
    detailRow("Outcome / Next Step", analysis.outcomeNextStep, { multiline: true })
  ].join("");

  const quotesHtml = keyQuotes.length
    ? keyQuotes.map((quote) => `
      <div style="margin:0 0 10px;padding:14px 16px;background:#ffffff;border-left:4px solid #6366f1;border-radius:10px;font-size:14px;line-height:1.6;color:#334155;font-style:italic;">
        “${escapeHtml(quote)}”
      </div>`).join("")
    : `<div style="font-size:14px;color:#64748b;">No notable caller quotes were captured.</div>`;

  const helpTags = (Array.isArray(analysis.helpRequested) ? analysis.helpRequested : [])
    .filter((item) => hasValue(item))
    .map((item) => `
      <span style="display:inline-block;margin:0 8px 8px 0;padding:6px 12px;background:#eef2ff;border:1px solid #c7d2fe;border-radius:999px;font-size:12px;font-weight:700;color:#4338ca;">
        ${escapeHtml(titleCase(String(item).replace(/_/g, " ")))}
      </span>`).join("");

  const transcriptHtml = transcriptTurns.slice(0, 10).map((turn) => {
    const isCaller = turn.role === "Caller";
    return `
      <tr>
        <td style="padding:0 0 10px;width:88px;vertical-align:top;">
          <span style="display:inline-block;padding:4px 10px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;${isCaller ? "background:#dbeafe;color:#1d4ed8;" : "background:#ede9fe;color:#6d28d9;"}">
            ${escapeHtml(turn.role)}
          </span>
        </td>
        <td style="padding:0 0 10px 12px;font-size:13px;line-height:1.6;color:#334155;vertical-align:top;">
          ${escapeHtml(turn.text)}
        </td>
      </tr>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef2ff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2ff;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:680px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 16px 48px rgba(49,46,129,0.12);">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5 0%,#312e81 100%);padding:30px 32px;">
              <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.82);margin-bottom:8px;">Medical Bot · Call Intelligence</div>
              <div style="font-size:28px;line-height:1.25;font-weight:700;color:#ffffff;margin:0;">Inbound Call Analysis</div>
              <div style="font-size:15px;line-height:1.6;color:rgba(255,255,255,0.92);margin-top:10px;">
                A phone call has ended. Here is the structured analysis extracted from the conversation for your clinical and front-desk team.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f5f3ff;border:1px solid #ddd6fe;border-radius:14px;">
                <tr>
                  <td style="padding:20px 22px;">
                    <div style="font-size:12px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#6366f1;margin-bottom:10px;">Executive Summary</div>
                    <div style="font-size:16px;line-height:1.7;color:#1e1b4b;font-weight:600;">
                      ${escapeHtml(analysis.summary || "No summary available.")}
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:12px 32px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
                <tr>
                  <td style="width:50%;padding-right:8px;vertical-align:top;">
                    <div style="background:${urgencyTheme.bg};border:1px solid ${urgencyTheme.border};border-radius:14px;padding:16px 18px;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${urgencyTheme.text};margin-bottom:8px;">Urgency</div>
                      <div style="display:inline-block;padding:6px 12px;border-radius:999px;background:${urgencyTheme.badge};color:#ffffff;font-size:13px;font-weight:700;">${escapeHtml(urgency)}</div>
                    </div>
                  </td>
                  <td style="width:50%;padding-left:8px;vertical-align:top;">
                    <div style="background:${sentimentTheme.bg};border:1px solid ${sentimentTheme.border};border-radius:14px;padding:16px 18px;">
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${sentimentTheme.text};margin-bottom:8px;">Caller Sentiment</div>
                      <div style="font-size:18px;font-weight:700;color:${sentimentTheme.text};">${escapeHtml(sentiment)}</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Call Details</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
                <tr>
                  <td style="padding:8px 18px 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${callTable}</table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Patient & Clinical Intelligence</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
                <tr>
                  <td style="padding:8px 18px 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${patientTable}</table>
                  </td>
                </tr>
              </table>
              ${helpTags ? `<div style="margin-top:14px;">${helpTags}</div>` : ""}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Key Quotes</div>
              <div style="background:#fafafa;border:1px solid #e5e7eb;border-radius:14px;padding:16px 18px;">
                ${quotesHtml}
              </div>
            </td>
          </tr>
          ${hasValue(analysis.notes) ? `
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Staff Notes</div>
              <div style="padding:16px 18px;background:#fffbeb;border:1px solid #fde68a;border-radius:14px;font-size:14px;line-height:1.7;color:#78350f;">
                ${escapeHtml(analysis.notes)}
              </div>
            </td>
          </tr>` : ""}
          ${transcriptTurns.length ? `
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Transcript Preview</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px 6px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${transcriptHtml}</table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>` : ""}
          <tr>
            <td style="padding:16px 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#eef2ff;border:1px solid #c7d2fe;border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:14px;font-weight:700;color:#312e81;margin-bottom:6px;">Recommended Follow-Up</div>
                    <div style="font-size:14px;line-height:1.7;color:#3730a3;">
                      Review the analysis above and contact
                      <strong>${escapeHtml(patientDisplayName)}</strong>
                      ${hasValue(patientPhone) && patientPhone !== "—" ? ` at <strong>${escapeHtml(patientPhone)}</strong>` : hasValue(callerPhone) && callerPhone !== "—" ? ` using caller ID <strong>${escapeHtml(callerPhone)}</strong>` : ""}
                      to complete the requested next step.
                      Analyzed on <strong>${escapeHtml(formattedAnalyzedAt)}</strong>.
                    </div>
                    ${formatClinicAddress(clinic) ? `<div style="margin-top:10px;font-size:13px;color:#4338ca;">${escapeHtml(clinicLabel)} · ${escapeHtml(formatClinicAddress(clinic))}</div>` : ""}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
                Automated post-call intelligence from the Medical Bot voice assistant.<br>
                Recipients were BCC'd for privacy. Do not reply to this email.
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

module.exports = { buildCallAnalysisEmail };
