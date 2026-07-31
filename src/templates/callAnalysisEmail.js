/**
 * HIPAA-safe call analysis email template.
 * The email intentionally excludes all patient identifiers and raw transcript
 * content. Detailed PHI remains only in secure internal storage.
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

function detailRow(label, value) {
  const display = hasValue(value) ? String(value).trim() : "—";
  return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eef2f7;color:#64748b;font-size:13px;width:36%;vertical-align:top;">${escapeHtml(label)}</td>
      <td style="padding:10px 0 10px 16px;border-bottom:1px solid #eef2f7;color:#0f172a;font-size:14px;font-weight:600;vertical-align:top;">${escapeHtml(display)}</td>
    </tr>`;
}

function buildHelpRequestedList(helpRequested = []) {
  const items = Array.isArray(helpRequested)
    ? helpRequested.filter((item) => hasValue(item))
    : [];
  if (!items.length) return "—";
  return items.map((item) => titleCase(String(item).replace(/_/g, " "))).join(", ");
}

function formatCaseNumber(callId, clinicAcronym) {
  if (!callId) return "—";
  const acronym = String(clinicAcronym || "").trim();
  return `${callId}${acronym}-Bot(Voice)`;
}

function buildCallAnalysisEmail({ call = {}, analysis = {}, clinic = {}, clinicLabel = "Clinic" }) {
  const analyzedAt = analysis.createdAt || new Date().toISOString();
  const formattedAnalyzedAt = formatDateTime(analyzedAt);
  const formattedCallAt = formatDateTime(call.createdAt || analyzedAt);
  const duration = formatDuration(call.seconds);
  const urgency = titleCase(analysis.urgency || "unknown");
  const sentiment = titleCase(analysis.sentiment || "unknown");
  const helpRequestedText = buildHelpRequestedList(analysis.helpRequested);
  const urgencyTheme = urgencyStyles(analysis.urgency);
  const sentimentTheme = sentimentStyles(analysis.sentiment);
  const clinicAcronym = clinic.acronym || "";
  const caseNumber = formatCaseNumber(call.id, clinicAcronym);

  const subject = `HIPAA-Safe Call Analysis · ${clinicLabel} · ${caseNumber}`;

  const callRows = [
    ["Clinic", clinicLabel],
    ["Case Number", caseNumber],
    ["Call SID", call.callSid || "—"],
    ["Call Started", formattedCallAt],
    ["Duration", duration],
    ["Analyzed At", formattedAnalyzedAt]
  ];

  const intelligenceRows = [
    ["Urgency", urgency],
    ["Sentiment", sentiment],
    ["Requested Help Categories", helpRequestedText]
  ];

  const text = [
    "HIPAA-SAFE CALL ANALYSIS",
    "========================",
    "",
    "This email intentionally excludes patient identifiers and transcript content.",
    "Review detailed data only in secure internal systems.",
    "",
    "CALL METADATA",
    ...callRows.map(([label, value]) => `  ${label}: ${value}`),
    "",
    "ANALYSIS SNAPSHOT",
    ...intelligenceRows.map(([label, value]) => `  ${label}: ${value}`),
    "",
    "COMPLIANCE NOTE",
    "  No patient name, phone, raw transcript, quotes, notes, or free-text medical narrative is included in this message.",
    "",
    "—",
    "Automated call analysis notification.",
    "Recipients were BCC'd for privacy. Do not reply to this email."
  ].join("\n");

  const callTable = callRows.map(([label, value]) => detailRow(label, value)).join("");
  const intelligenceTable = intelligenceRows.map(([label, value]) => detailRow(label, value)).join("");

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
              <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.82);margin-bottom:8px;">Call Analysis Notification</div>
              <div style="font-size:28px;line-height:1.25;font-weight:700;color:#ffffff;margin:0;">HIPAA-Safe Email</div>
              <div style="font-size:15px;line-height:1.6;color:rgba(255,255,255,0.92);margin-top:10px;">
                This email is de-identified and excludes personal patient information.
              </div>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px 8px;">
              <div style="padding:14px 16px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;font-size:14px;line-height:1.7;color:#334155;">
                Detailed call content is available only in secure internal records.
                This email contains operational metadata and risk-level indicators only.
              </div>
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
                      <div style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${sentimentTheme.text};margin-bottom:8px;">Sentiment</div>
                      <div style="font-size:18px;font-weight:700;color:${sentimentTheme.text};">${escapeHtml(sentiment)}</div>
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 8px;">
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Call Metadata</div>
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
              <div style="font-size:13px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#64748b;margin-bottom:12px;">Analysis Snapshot</div>
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:14px;">
                <tr>
                  <td style="padding:8px 18px 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%">${intelligenceTable}</table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:16px 32px 28px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ecfeff;border:1px solid #a5f3fc;border-radius:14px;">
                <tr>
                  <td style="padding:16px 18px;">
                    <div style="font-size:14px;font-weight:700;color:#155e75;margin-bottom:6px;">Compliance Note</div>
                    <div style="font-size:14px;line-height:1.7;color:#0e7490;">
                      No patient name, phone number, transcript, quotes, notes, or free-text clinical narrative is included in this email.
                    </div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="font-size:12px;line-height:1.6;color:#94a3b8;text-align:center;">
                Automated call analysis notification.<br>
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
