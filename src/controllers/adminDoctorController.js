const { Doctor, Clinic } = require("../db");
const {
  normalizeScheduleFields,
  scheduleFieldsToDto,
  defaultWeeklyHours
} = require("../constants/scheduleHours");

const GENDERS = new Set(["Male", "Female", "Other"]);
const STATUSES = new Set(["active", "inactive"]);

function cleanStr(value, max = 255) {
  const s = String(value ?? "").trim();
  if (!s) return "";
  return s.slice(0, max);
}

function toDoctorDto(row) {
  if (!row) return null;
  const schedule = scheduleFieldsToDto({
    weeklyHours: row.weeklyHours ?? defaultWeeklyHours(),
    slotDurationMinutes: row.slotDurationMinutes,
    doctorDailyLimit: row.doctorDailyLimit
  });
  // Doctors may leave slotDuration null to inherit clinic default.
  if (row.slotDurationMinutes == null) {
    schedule.slotDurationMinutes = null;
  }
  return {
    id: String(row.id),
    firstName: row.firstName || "",
    lastName: row.lastName || "",
    gender: row.gender || "Other",
    phone: row.phone || "",
    email: row.email || "",
    language: row.language || "English",
    address1: row.address1 || "",
    address2: row.address2 || "",
    photo: row.photo || "",
    status: row.status || "active",
    clinicId: row.clinicId ? String(row.clinicId) : null,
    clinicName: row.clinic?.name || null,
    ...schedule,
    createdAt: row.createdAt || null,
    updatedAt: row.updatedAt || null
  };
}

function validatePayload(body, { partial = false } = {}) {
  const src = body && typeof body === "object" ? body : {};
  const errors = [];

  const firstName = cleanStr(src.firstName ?? src.first_name, 100);
  const lastName = cleanStr(src.lastName ?? src.last_name, 100);
  const genderRaw = cleanStr(src.gender, 16) || "Other";
  const phone = cleanStr(src.phone, 30);
  const email = cleanStr(src.email, 255).toLowerCase();
  const language = cleanStr(src.language, 64) || "English";
  const address1 = cleanStr(src.address1 ?? src.address_1, 255);
  const address2 = cleanStr(src.address2 ?? src.address_2, 255);
  const photo = src.photo != null ? String(src.photo) : undefined;
  const statusRaw = cleanStr(src.status, 16) || "active";

  let clinicId = undefined;
  if (!partial || src.clinicId !== undefined) {
    if (src.clinicId === null || src.clinicId === "" || src.clinicId === undefined) {
      clinicId = null;
    } else {
      const n = Number(src.clinicId);
      if (!Number.isFinite(n) || n <= 0) errors.push("Invalid clinic id.");
      else clinicId = n;
    }
  }

  if (!partial || src.firstName !== undefined || src.first_name !== undefined) {
    if (!firstName) errors.push("First name is required.");
  }
  if (!partial || src.lastName !== undefined || src.last_name !== undefined) {
    if (!lastName) errors.push("Last name is required.");
  }
  if (!partial || src.gender !== undefined) {
    if (!GENDERS.has(genderRaw)) errors.push("Gender must be Male, Female, or Other.");
  }
  if (!partial || src.status !== undefined) {
    if (!STATUSES.has(statusRaw)) errors.push("Status must be active or inactive.");
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.push("Email is invalid.");
  }
  if (photo !== undefined && photo.length > 2_500_000) {
    errors.push("Photo is too large.");
  }

  const schedule = normalizeScheduleFields(src, { partial: true });
  if (schedule.error) errors.push(schedule.error);

  if (errors.length) return { error: errors[0] };

  const value = {};
  if (!partial || src.firstName !== undefined || src.first_name !== undefined) {
    value.firstName = firstName;
  }
  if (!partial || src.lastName !== undefined || src.last_name !== undefined) {
    value.lastName = lastName;
  }
  if (!partial || src.gender !== undefined) value.gender = genderRaw;
  if (!partial || src.phone !== undefined) value.phone = phone || null;
  if (!partial || src.email !== undefined) value.email = email || null;
  if (!partial || src.language !== undefined) value.language = language;
  if (!partial || src.address1 !== undefined || src.address_1 !== undefined) {
    value.address1 = address1 || null;
  }
  if (!partial || src.address2 !== undefined || src.address_2 !== undefined) {
    value.address2 = address2 || null;
  }
  if (!partial || src.photo !== undefined) value.photo = photo || null;
  if (!partial || src.status !== undefined) value.status = statusRaw;
  if (clinicId !== undefined) value.clinicId = clinicId;

  if (schedule.value) {
    if (src.weeklyHours !== undefined) value.weeklyHours = schedule.value.weeklyHours;
    if (src.slotDurationMinutes !== undefined) {
      value.slotDurationMinutes =
        src.slotDurationMinutes === null || src.slotDurationMinutes === ""
          ? null
          : schedule.value.slotDurationMinutes;
    }
    if (src.doctorDailyLimit !== undefined) {
      value.doctorDailyLimit = schedule.value.doctorDailyLimit;
    }
  }

  return { value };
}

async function listDoctors(req, res, next) {
  try {
    const rows = await Doctor.findAll({
      include: [{ model: Clinic, as: "clinic", attributes: ["id", "name"], required: false }],
      order: [["last_name", "ASC"], ["first_name", "ASC"], ["id", "DESC"]]
    });
    return res.status(200).json({ doctors: rows.map(toDoctorDto) });
  } catch (err) {
    return next(err);
  }
}

async function getDoctor(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid doctor id." });
    const row = await Doctor.findByPk(id, {
      include: [{ model: Clinic, as: "clinic", attributes: ["id", "name"], required: false }]
    });
    if (!row) return res.status(404).json({ error: "Doctor not found." });
    return res.status(200).json({ doctor: toDoctorDto(row) });
  } catch (err) {
    return next(err);
  }
}

async function createDoctor(req, res, next) {
  try {
    const { value, error } = validatePayload(req.body, { partial: false });
    if (error) return res.status(400).json({ error });

    if (value.clinicId) {
      const clinic = await Clinic.findByPk(value.clinicId);
      if (!clinic) return res.status(400).json({ error: "Selected clinic was not found." });
    }

    const created = await Doctor.create(value);
    const row = await Doctor.findByPk(created.id, {
      include: [{ model: Clinic, as: "clinic", attributes: ["id", "name"], required: false }]
    });
    return res.status(201).json({ doctor: toDoctorDto(row) });
  } catch (err) {
    return next(err);
  }
}

async function updateDoctor(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid doctor id." });
    const row = await Doctor.findByPk(id);
    if (!row) return res.status(404).json({ error: "Doctor not found." });

    const { value, error } = validatePayload(req.body, { partial: true });
    if (error) return res.status(400).json({ error });

    if (value.clinicId) {
      const clinic = await Clinic.findByPk(value.clinicId);
      if (!clinic) return res.status(400).json({ error: "Selected clinic was not found." });
    }

    await row.update(value);
    const updated = await Doctor.findByPk(id, {
      include: [{ model: Clinic, as: "clinic", attributes: ["id", "name"], required: false }]
    });
    return res.status(200).json({ doctor: toDoctorDto(updated) });
  } catch (err) {
    return next(err);
  }
}

async function deleteDoctor(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: "Invalid doctor id." });
    const row = await Doctor.findByPk(id);
    if (!row) return res.status(404).json({ error: "Doctor not found." });
    await row.destroy();
    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listDoctors,
  getDoctor,
  createDoctor,
  updateDoctor,
  deleteDoctor
};
