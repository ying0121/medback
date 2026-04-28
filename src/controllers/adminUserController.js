const { User } = require("../db");
const {
  createUserSchema,
  updateUserSchema,
  changePasswordSchema
} = require("../utils/validators");
const { encodePassword } = require("../utils/passwordEncoder");

function parseClinicIds(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v)).filter(Boolean);
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((v) => String(v)).filter(Boolean);
  } catch {
    return [];
  }
}

function serializeClinicIds(ids) {
  const safe = Array.isArray(ids) ? ids.map((v) => String(v)).filter(Boolean) : [];
  return safe.length ? JSON.stringify(safe) : null;
}

function toUserDto(user) {
  const clinics = parseClinicIds(user.clinics);
  return {
    id: String(user.id),
    firstName: user.fname,
    middleName: "",
    lastName: user.lname,
    dob: user.dob,
    gender: "Other",
    address: user.address || "",
    state: user.state || "",
    city: user.city || "",
    zip: user.zip || "",
    phone: user.phone || "",
    email: user.email,
    role: user.role,
    status: user.status,
    photo: user.photo || "",
    clinics,
    clinicIds: clinics
  };
}

async function listUsers(req, res, next) {
  try {
    const users = await User.findAll({ order: [["id", "DESC"]] });
    return res.status(200).json({ users: users.map(toUserDto) });
  } catch (err) {
    return next(err);
  }
}

async function createUser(req, res, next) {
  try {
    const { value, error } = createUserSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const clinics = value.clinics !== undefined ? value.clinics : value.clinicIds;
    const created = await User.create({
      fname: value.fname.trim(),
      lname: value.lname.trim(),
      dob: value.dob,
      email: value.email.trim().toLowerCase(),
      password: encodePassword(value.password),
      phone: value.phone || null,
      role: value.role,
      status: value.status,
      address: value.address || null,
      city: value.city || null,
      state: value.state || null,
      zip: value.zip || null,
      photo: value.photo || null,
      clinics: serializeClinicIds(clinics)
    });

    return res.status(201).json({ user: toUserDto(created) });
  } catch (err) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Email already exists." });
    }
    return next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id." });

    const { value, error } = updateUserSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });

    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: "User not found." });

    const incomingClinics =
      value.clinics !== undefined ? value.clinics : value.clinicIds !== undefined ? value.clinicIds : undefined;

    const patch = {
      ...(value.fname !== undefined ? { fname: value.fname.trim() } : {}),
      ...(value.lname !== undefined ? { lname: value.lname.trim() } : {}),
      ...(value.dob !== undefined ? { dob: value.dob } : {}),
      ...(value.email !== undefined ? { email: value.email.trim().toLowerCase() } : {}),
      ...(value.phone !== undefined ? { phone: value.phone || null } : {}),
      ...(value.role !== undefined ? { role: value.role } : {}),
      ...(value.status !== undefined ? { status: value.status } : {}),
      ...(value.address !== undefined ? { address: value.address || null } : {}),
      ...(value.city !== undefined ? { city: value.city || null } : {}),
      ...(value.state !== undefined ? { state: value.state || null } : {}),
      ...(value.zip !== undefined ? { zip: value.zip || null } : {}),
      ...(value.photo !== undefined ? { photo: value.photo || null } : {}),
      ...(incomingClinics !== undefined ? { clinics: serializeClinicIds(incomingClinics) } : {})
    };

    await user.update(patch);
    return res.status(200).json({ user: toUserDto(user) });
  } catch (err) {
    if (err?.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ error: "Email already exists." });
    }
    return next(err);
  }
}

async function deleteUser(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id." });
    const deleted = await User.destroy({ where: { id } });
    if (!deleted) return res.status(404).json({ error: "User not found." });
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

async function changeUserPassword(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid user id." });
    const { value, error } = changePasswordSchema.validate(req.body);
    if (error) return res.status(400).json({ error: error.message });
    const user = await User.findByPk(id);
    if (!user) return res.status(404).json({ error: "User not found." });
    await user.update({ password: encodePassword(value.password) });
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listUsers,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword
};
