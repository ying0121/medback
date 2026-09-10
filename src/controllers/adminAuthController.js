const { User } = require("../db");
const { encodePassword } = require("../utils/passwordEncoder");
const { writeAuditLog, clientIp } = require("../services/auditLogService");

function parseClinicIds(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((v) => String(v)).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function toAuthUser(user) {
  const clinics = parseClinicIds(user.clinics);
  return {
    id: String(user.id),
    email: user.email,
    name: `${user.fname} ${user.lname}`.trim(),
    photo: user.photo || "",
    role: user.role,
    clinics,
    clinicIds: clinics
  };
}

async function login(req, res, next) {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const ip = clientIp(req);
    const userAgent = String(req.headers?.["user-agent"] || "").slice(0, 512) || null;

    if (!email || !password) {
      void writeAuditLog({
        actorEmail: email || null,
        action: "LOGIN_FAILURE",
        resourceType: "auth",
        outcome: "failure",
        ipAddress: ip,
        userAgent,
        method: "POST",
        path: "/api/admin/auth/login",
        statusCode: 400,
        summary: "Login failed — missing credentials"
      });
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      void writeAuditLog({
        actorEmail: email,
        action: "LOGIN_FAILURE",
        resourceType: "auth",
        outcome: "failure",
        ipAddress: ip,
        userAgent,
        method: "POST",
        path: "/api/admin/auth/login",
        statusCode: 401,
        summary: `Login failed — unknown user ${email}`
      });
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const encoded = encodePassword(password);
    if (user.password !== encoded) {
      void writeAuditLog({
        actorUserId: user.id,
        actorEmail: user.email,
        actorName: `${user.fname} ${user.lname}`.trim(),
        actorRole: user.role,
        action: "LOGIN_FAILURE",
        resourceType: "auth",
        resourceId: String(user.id),
        outcome: "failure",
        ipAddress: ip,
        userAgent,
        method: "POST",
        path: "/api/admin/auth/login",
        statusCode: 401,
        summary: `Login failed — bad password for ${user.email}`
      });
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const authUser = toAuthUser(user);
    // Explicit login success (middleware also logs; this enriches actor fields from DB)
    void writeAuditLog({
      actorUserId: user.id,
      actorEmail: authUser.email,
      actorName: authUser.name,
      actorRole: authUser.role,
      action: "LOGIN_SUCCESS",
      resourceType: "auth",
      resourceId: String(user.id),
      outcome: "success",
      ipAddress: ip,
      userAgent,
      method: "POST",
      path: "/api/admin/auth/login",
      statusCode: 200,
      summary: `Admin login success — ${authUser.email}`
    });

    return res.status(200).json({ user: authUser });
  } catch (err) {
    return next(err);
  }
}

module.exports = { login };
