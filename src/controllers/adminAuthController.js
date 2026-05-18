const { User } = require("../db");
const { encodePassword } = require("../utils/passwordEncoder");

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

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    const encoded = encodePassword(password);
    if (user.password !== encoded) {
      return res.status(401).json({ error: "Invalid email or password." });
    }

    return res.status(200).json({ user: toAuthUser(user) });
  } catch (err) {
    return next(err);
  }
}

module.exports = { login };
