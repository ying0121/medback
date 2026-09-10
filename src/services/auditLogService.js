/**
 * HIPAA-oriented audit logging.
 * Writes are fire-and-forget so they never break primary request handling.
 */

const { Op } = require("sequelize");
const geoip = require("geoip-lite");
const { AuditLog } = require("../db");

const SENSITIVE_KEYS = new Set([
  "password",
  "confirmPassword",
  "newPassword",
  "token",
  "authToken",
  "twilioAuthToken",
  "twilioApiKeySecret",
  "openaiApiKey",
  "googleClientSecret",
  "googleRefreshToken",
  "apiKey",
  "secret",
  "authorization"
]);

const COUNTRY_NAMES = {
  US: "United States",
  GB: "United Kingdom",
  KR: "South Korea",
  JP: "Japan",
  CN: "China",
  DE: "Germany",
  FR: "France",
  CA: "Canada",
  AU: "Australia",
  IN: "India",
  BR: "Brazil",
  MX: "Mexico",
  ES: "Spain",
  IT: "Italy",
  NL: "Netherlands",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  FI: "Finland",
  PL: "Poland",
  RU: "Russia",
  UA: "Ukraine",
  TR: "Turkey",
  SA: "Saudi Arabia",
  AE: "United Arab Emirates",
  SG: "Singapore",
  HK: "Hong Kong",
  TW: "Taiwan",
  VN: "Vietnam",
  TH: "Thailand",
  PH: "Philippines",
  ID: "Indonesia",
  MY: "Malaysia",
  NZ: "New Zealand",
  IE: "Ireland",
  CH: "Switzerland",
  AT: "Austria",
  BE: "Belgium",
  PT: "Portugal",
  LOCAL: "Local / private network"
};

function normalizeIp(raw) {
  let ip = String(raw || "").trim();
  if (!ip) return null;
  ip = ip.replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) ip = mapped[1];
  if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(":")[0];
  return ip || null;
}

function isPrivateOrLocalIp(ip) {
  if (!ip) return true;
  if (ip === "::1" || ip === "127.0.0.1" || ip === "0.0.0.0" || ip === "localhost") return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;
  if (/^fc/i.test(ip) || /^fd/i.test(ip) || /^fe80:/i.test(ip)) return true;
  return false;
}

function clientIp(req) {
  const candidates = [
    req?.headers?.["cf-connecting-ip"],
    req?.headers?.["true-client-ip"],
    req?.headers?.["x-real-ip"],
    String(req?.headers?.["x-forwarded-for"] || "")
      .split(",")[0]
      .trim(),
    req?.ip,
    req?.socket?.remoteAddress
  ];
  for (const c of candidates) {
    const ip = normalizeIp(c);
    if (ip) return ip;
  }
  return null;
}

function resolveCountry(ipAddress, provided = {}) {
  if (provided.countryCode || provided.countryName) {
    const code = provided.countryCode
      ? String(provided.countryCode).toUpperCase().slice(0, 8)
      : null;
    return {
      countryCode: code,
      countryName:
        provided.countryName || (code && COUNTRY_NAMES[code] ? COUNTRY_NAMES[code] : code)
    };
  }
  const ip = normalizeIp(ipAddress);
  if (!ip) return { countryCode: null, countryName: null };
  if (isPrivateOrLocalIp(ip)) {
    return { countryCode: "LOCAL", countryName: COUNTRY_NAMES.LOCAL };
  }
  try {
    const geo = geoip.lookup(ip);
    if (!geo?.country) return { countryCode: null, countryName: null };
    const code = String(geo.country).toUpperCase().slice(0, 8);
    return {
      countryCode: code,
      countryName: COUNTRY_NAMES[code] || code
    };
  } catch {
    return { countryCode: null, countryName: null };
  }
}

function extractActorFromRequest(req) {
  const h = req?.headers || {};
  const idRaw = h["x-admin-user-id"];
  const idNum = Number(idRaw);
  return {
    actorUserId: Number.isFinite(idNum) && idNum > 0 ? idNum : null,
    actorEmail: String(h["x-admin-user-email"] || "").trim().toLowerCase() || null,
    actorName: String(h["x-admin-user-name"] || "").trim() || null,
    actorRole: String(h["x-admin-user-role"] || "").trim() || null
  };
}

function sanitizeMetadata(value, depth = 0) {
  if (value == null) return null;
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 30).map((v) => sanitizeMetadata(v, depth + 1));
  }
  if (typeof value !== "object") {
    const s = String(value);
    return s.length > 240 ? `${s.slice(0, 237)}…` : s;
  }
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key) || /password|secret|token|apikey|authorization/i.test(key)) {
      out[key] = "[redacted]";
      continue;
    }
    out[key] = sanitizeMetadata(val, depth + 1);
  }
  return out;
}

function inferAction(method) {
  const m = String(method || "GET").toUpperCase();
  if (m === "POST") return "CREATE";
  if (m === "PUT" || m === "PATCH") return "UPDATE";
  if (m === "DELETE") return "DELETE";
  return "READ";
}

function inferResourceFromPath(pathname) {
  const path = String(pathname || "");
  const rules = [
    [/\/api\/admin\/auth\/login/i, "auth"],
    [/\/api\/admin\/audit-logs/i, "audit_log"],
    [/\/api\/admin\/users/i, "user"],
    [/\/api\/admin\/doctors/i, "doctor"],
    [/\/api\/admin\/agents/i, "agent"],
    [/\/api\/admin\/knowledge/i, "knowledge"],
    [/\/api\/admin\/flows/i, "conversation_flow"],
    [/\/api\/admin\/campaigns\/[^/]+\/contacts/i, "campaign_contact"],
    [/\/api\/admin\/campaigns/i, "campaign"],
    [/\/api\/admin\/dashboard\/clinics/i, "clinic"],
    [/\/api\/admin\/dashboard\/appointments/i, "appointment"],
    [/\/api\/admin\/dashboard\/.*conversations/i, "conversation"],
    [/\/api\/admin\/dashboard\/.*messages/i, "message"],
    [/\/api\/admin\/dashboard\/.*calls/i, "call"],
    [/\/api\/admin\/dashboard/i, "dashboard"]
  ];
  for (const [re, type] of rules) {
    if (re.test(path)) return type;
  }
  return "admin";
}

function extractResourceId(pathname) {
  const parts = String(pathname || "")
    .split("?")[0]
    .split("/")
    .filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    if (/^\d+$/.test(parts[i])) return parts[i];
  }
  return null;
}

function serializeMetadata(meta) {
  if (meta == null) return null;
  try {
    const cleaned = sanitizeMetadata(meta);
    const json = JSON.stringify(cleaned);
    return json.length > 4000 ? `${json.slice(0, 3997)}…` : json;
  } catch {
    return null;
  }
}

async function writeAuditLog(input = {}) {
  try {
    const action = String(input.action || "ACCESS").trim().slice(0, 64) || "ACCESS";
    const resourceType =
      String(input.resourceType || "system").trim().slice(0, 64) || "system";
    const outcome = String(input.outcome || "success").trim().slice(0, 32) || "success";
    const ipAddress = normalizeIp(input.ipAddress) || null;
    const geo = resolveCountry(ipAddress, {
      countryCode: input.countryCode,
      countryName: input.countryName
    });

    await AuditLog.create({
      actorUserId: input.actorUserId != null ? Number(input.actorUserId) || null : null,
      actorEmail: input.actorEmail ? String(input.actorEmail).slice(0, 255) : null,
      actorName: input.actorName ? String(input.actorName).slice(0, 255) : null,
      actorRole: input.actorRole ? String(input.actorRole).slice(0, 64) : null,
      action,
      resourceType,
      resourceId: input.resourceId != null ? String(input.resourceId).slice(0, 128) : null,
      clinicId: input.clinicId != null ? String(input.clinicId).slice(0, 64) : null,
      outcome,
      ipAddress: ipAddress ? String(ipAddress).slice(0, 64) : null,
      countryCode: geo.countryCode ? String(geo.countryCode).slice(0, 8) : null,
      countryName: geo.countryName ? String(geo.countryName).slice(0, 128) : null,
      userAgent: input.userAgent ? String(input.userAgent).slice(0, 512) : null,
      method: input.method ? String(input.method).slice(0, 16) : null,
      path: input.path ? String(input.path).slice(0, 512) : null,
      statusCode:
        input.statusCode != null && Number.isFinite(Number(input.statusCode))
          ? Number(input.statusCode)
          : null,
      summary: input.summary ? String(input.summary).slice(0, 512) : null,
      metadata: serializeMetadata(input.metadata)
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[audit] write failed: ${err.message}`);
  }
}

function writeAuditFromRequest(req, overrides = {}) {
  const actor = extractActorFromRequest(req);
  const path = String(req.originalUrl || req.url || "").slice(0, 512);
  return writeAuditLog({
    ...actor,
    action: overrides.action || inferAction(req.method),
    resourceType: overrides.resourceType || inferResourceFromPath(path),
    resourceId: overrides.resourceId || extractResourceId(path),
    clinicId: overrides.clinicId || req.query?.clinicId || req.body?.clinicId || null,
    outcome: overrides.outcome || "success",
    ipAddress: clientIp(req),
    userAgent: String(req.headers?.["user-agent"] || "").slice(0, 512) || null,
    method: req.method,
    path,
    statusCode: overrides.statusCode,
    summary: overrides.summary,
    metadata: overrides.metadata
  });
}

async function listAuditLogs({
  q = "",
  action = "",
  resourceType = "",
  actorEmail = "",
  outcome = "",
  clinicId = "",
  from = null,
  to = null,
  page = 1,
  limit = 50
} = {}) {
  const where = {};
  if (action) where.action = String(action);
  if (resourceType) where.resourceType = String(resourceType);
  if (outcome) where.outcome = String(outcome);
  if (clinicId) where.clinicId = String(clinicId);
  if (actorEmail) where.actorEmail = { [Op.like]: `%${String(actorEmail).trim()}%` };

  if (from || to) {
    where.createdAt = {};
    if (from) {
      const d = new Date(from);
      if (!Number.isNaN(d.getTime())) where.createdAt[Op.gte] = d;
    }
    if (to) {
      const d = new Date(to);
      if (!Number.isNaN(d.getTime())) where.createdAt[Op.lte] = d;
    }
    if (!Object.keys(where.createdAt).length) delete where.createdAt;
  }

  if (q) {
    const like = `%${String(q).trim()}%`;
    where[Op.or] = [
      { actorEmail: { [Op.like]: like } },
      { actorName: { [Op.like]: like } },
      { summary: { [Op.like]: like } },
      { path: { [Op.like]: like } },
      { resourceType: { [Op.like]: like } },
      { resourceId: { [Op.like]: like } },
      { action: { [Op.like]: like } },
      { ipAddress: { [Op.like]: like } },
      { countryCode: { [Op.like]: like } },
      { countryName: { [Op.like]: like } }
    ];
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const { rows, count } = await AuditLog.findAndCountAll({
    where,
    order: [["id", "DESC"]],
    limit: safeLimit,
    offset
  });

  return {
    items: rows.map(toAuditDto),
    total: count,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.max(1, Math.ceil(count / safeLimit))
  };
}

async function clearAllAuditLogs() {
  const count = await AuditLog.count();
  await AuditLog.destroy({ where: {}, truncate: true });
  return { deleted: count };
}

function toAuditDto(row) {
  if (!row) return null;
  let metadata = null;
  if (row.metadata) {
    try {
      metadata = JSON.parse(row.metadata);
    } catch {
      metadata = { raw: String(row.metadata).slice(0, 200) };
    }
  }

  let countryCode = row.countryCode || null;
  let countryName = row.countryName || null;
  if (!countryCode && row.ipAddress) {
    const geo = resolveCountry(row.ipAddress);
    countryCode = geo.countryCode;
    countryName = geo.countryName;
  }

  const createdRaw =
    row.createdAt ??
    row.created_at ??
    (typeof row.getDataValue === "function" ? row.getDataValue("createdAt") : null);

  return {
    id: String(row.id),
    occurredAt: createdRaw ? new Date(createdRaw).toISOString() : null,
    actorUserId: row.actorUserId != null ? String(row.actorUserId) : null,
    actorEmail: row.actorEmail || null,
    actorName: row.actorName || null,
    actorRole: row.actorRole || null,
    action: row.action,
    resourceType: row.resourceType,
    resourceId: row.resourceId || null,
    clinicId: row.clinicId || null,
    outcome: row.outcome,
    ipAddress: row.ipAddress || null,
    countryCode,
    countryName,
    userAgent: row.userAgent || null,
    method: row.method || null,
    path: row.path || null,
    statusCode: row.statusCode != null ? Number(row.statusCode) : null,
    summary: row.summary || null,
    metadata
  };
}

module.exports = {
  writeAuditLog,
  writeAuditFromRequest,
  listAuditLogs,
  clearAllAuditLogs,
  extractActorFromRequest,
  clientIp,
  normalizeIp,
  resolveCountry,
  inferAction,
  inferResourceFromPath,
  toAuditDto,
  sanitizeMetadata
};
