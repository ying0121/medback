/**
 * Bot Calendar availability: weekly hours, doctor daily cap, overlap checks.
 */

const { Op } = require("sequelize");
const { Appointment, Clinic, Doctor } = require("../db");
const {
  APP_TIMEZONE,
  getZonedParts,
  zonedCivilToUtcDate,
  addDaysCivil
} = require("../utils/appTimeZone");
const {
  JS_WEEKDAY_TO_KEY,
  parseHm,
  hmToMinutes,
  normalizeWeeklyHours,
  normalizeSlotDuration,
  normalizeDailyLimit
} = require("../constants/scheduleHours");

async function resolveClinicRow(clinicId) {
  const id = Number(clinicId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const byPk = await Clinic.findByPk(id);
  if (byPk) return byPk;
  return Clinic.findOne({ where: { clinicId: id } });
}

/**
 * Merge doctor schedule over clinic schedule when doctor fields are set.
 */
function resolveEffectiveSchedule(clinic, doctor = null) {
  const clinicHours = normalizeWeeklyHours(clinic?.weeklyHours);
  const clinicSlot = normalizeSlotDuration(clinic?.slotDurationMinutes, 30);
  const clinicDoctorLimit = normalizeDailyLimit(clinic?.doctorDailyLimit);

  if (!doctor) {
    return {
      weeklyHours: clinicHours,
      slotDurationMinutes: clinicSlot,
      doctorDailyLimit: clinicDoctorLimit,
      source: "clinic"
    };
  }

  const hasDoctorHours = doctor.weeklyHours != null && doctor.weeklyHours !== "";
  return {
    weeklyHours: hasDoctorHours ? normalizeWeeklyHours(doctor.weeklyHours) : clinicHours,
    slotDurationMinutes:
      doctor.slotDurationMinutes != null
        ? normalizeSlotDuration(doctor.slotDurationMinutes, clinicSlot)
        : clinicSlot,
    doctorDailyLimit:
      doctor.doctorDailyLimit != null
        ? normalizeDailyLimit(doctor.doctorDailyLimit)
        : clinicDoctorLimit,
    source: "doctor"
  };
}

function dayBoundsUtc(civilDay, timeZone = APP_TIMEZONE) {
  const start = zonedCivilToUtcDate(
    { year: civilDay.year, month: civilDay.month, day: civilDay.day, hour: 0, minute: 0, second: 0 },
    timeZone
  );
  const next = addDaysCivil(civilDay, 1);
  const end = zonedCivilToUtcDate(
    { year: next.year, month: next.month, day: next.day, hour: 0, minute: 0, second: 0 },
    timeZone
  );
  return { start, end };
}

function validateAgainstWeeklyHours(startsAt, endsAt, weeklyHours, timeZone = APP_TIMEZONE) {
  const startParts = getZonedParts(startsAt, timeZone);
  const endParts = getZonedParts(endsAt, timeZone);

  // Reject slots that cross midnight in clinic TZ for simplicity.
  if (
    startParts.year !== endParts.year ||
    startParts.month !== endParts.month ||
    startParts.day !== endParts.day
  ) {
    return {
      ok: false,
      code: "OUTSIDE_HOURS",
      message: "Appointments must start and end on the same day during clinic hours."
    };
  }

  const dayKey = JS_WEEKDAY_TO_KEY[startParts.weekday] || "mon";
  const day = weeklyHours[dayKey];
  const dayLabel = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday"
  }[dayKey] || dayKey;

  if (!day || !day.enabled) {
    return {
      ok: false,
      code: "DAY_CLOSED",
      message: `The clinic is closed on ${dayLabel}. Please choose a time during work hours on another day.`
    };
  }

  const open = parseHm(day.start);
  const close = parseHm(day.end);
  if (!open || !close || hmToMinutes(close) <= hmToMinutes(open)) {
    return {
      ok: false,
      code: "HOURS_INVALID",
      message: "Clinic hours are not configured correctly for that day."
    };
  }

  const startMin = startParts.hour * 60 + startParts.minute;
  const endMin = endParts.hour * 60 + endParts.minute;
  if (startMin < hmToMinutes(open) || endMin > hmToMinutes(close)) {
    return {
      ok: false,
      code: "OUTSIDE_HOURS",
      message: `Appointments must be within work hours on ${dayLabel} (${day.start}–${day.end}). Please choose another time.`
    };
  }

  return { ok: true, dayKey, civilDay: startParts };
}

async function countScheduledForDay({ clinicSystemId, doctorId, dayStart, dayEnd }) {
  const where = {
    clinicId: clinicSystemId,
    status: "scheduled",
    startsAt: { [Op.gte]: dayStart, [Op.lt]: dayEnd }
  };
  const docId = Number(doctorId);
  if (Number.isFinite(docId) && docId > 0) {
    where.doctorId = docId;
  }
  return Appointment.count({ where });
}

async function findOverlappingAppointment({ clinicSystemId, doctorId, startsAt, endsAt }) {
  const where = {
    clinicId: clinicSystemId,
    status: "scheduled",
    startsAt: { [Op.lt]: endsAt },
    endsAt: { [Op.gt]: startsAt }
  };
  const docId = Number(doctorId);
  if (Number.isFinite(docId) && docId > 0) {
    where.doctorId = docId;
  }
  return Appointment.findOne({ where, order: [["id", "ASC"]] });
}

/**
 * Validate a proposed Bot Calendar slot.
 * @returns {{ ok: true, schedule } | { ok: false, code: string, message: string }}
 */
async function validateBotCalendarSlot({
  clinicId,
  doctorId = null,
  startsAt,
  endsAt,
  timeZone = APP_TIMEZONE
} = {}) {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  const end = endsAt instanceof Date ? endsAt : new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return {
      ok: false,
      code: "INVALID_WINDOW",
      message: "That appointment time is not valid. Please choose another time."
    };
  }

  const clinic = await resolveClinicRow(clinicId);
  if (!clinic) {
    return {
      ok: false,
      code: "CLINIC_NOT_FOUND",
      message: "Clinic not found for this appointment."
    };
  }

  let doctor = null;
  const docId = Number(doctorId);
  if (Number.isFinite(docId) && docId > 0) {
    doctor = await Doctor.findByPk(docId);
  }

  const schedule = resolveEffectiveSchedule(clinic, doctor);
  const hoursCheck = validateAgainstWeeklyHours(start, end, schedule.weeklyHours, timeZone);
  if (!hoursCheck.ok) return hoursCheck;

  const { start: dayStart, end: dayEnd } = dayBoundsUtc(hoursCheck.civilDay, timeZone);

  if (schedule.doctorDailyLimit != null) {
    const count = await countScheduledForDay({
      clinicSystemId: clinic.id,
      doctorId: doctor?.id || null,
      dayStart,
      dayEnd
    });
    if (count >= schedule.doctorDailyLimit) {
      return {
        ok: false,
        code: "DAILY_LIMIT",
        message: `That day is fully booked (limit ${schedule.doctorDailyLimit}). Please choose another day.`
      };
    }
  }

  const overlap = await findOverlappingAppointment({
    clinicSystemId: clinic.id,
    doctorId: doctor?.id || null,
    startsAt: start,
    endsAt: end
  });
  if (overlap) {
    return {
      ok: false,
      code: "TIME_CONFLICT",
      message: "That time overlaps an existing appointment. Please choose a different time."
    };
  }

  return { ok: true, schedule, clinic };
}

module.exports = {
  resolveClinicRow,
  resolveEffectiveSchedule,
  validateBotCalendarSlot,
  dayBoundsUtc,
  validateAgainstWeeklyHours
};
