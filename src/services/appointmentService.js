const { Op } = require("sequelize");
const { Appointment, Clinic } = require("../db");
const { normalizePatientInfo, resolveAppointmentWindow } = require("./appointmentIntakeService");

async function resolveClinicRow(clinicId) {
  const id = Number(clinicId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const byPk = await Clinic.findByPk(id);
  if (byPk) return byPk;
  return Clinic.findOne({ where: { clinicId: id } });
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function mapAppointmentRow(row) {
  const clinic = row.clinic || row.Clinic || null;
  return {
    id: String(row.id),
    clinicId: String(row.clinicId),
    conversationId: row.conversationId ? String(row.conversationId) : null,
    callId: row.callId ? String(row.callId) : null,
    source: row.source || "chat",
    patientName: row.patientName || "",
    patientEmail: row.patientEmail || "",
    patientPhone: row.patientPhone || "",
    patientDob: row.patientDob || "",
    patientType: row.patientType || "",
    startsAt: toIso(row.startsAt),
    endsAt: toIso(row.endsAt),
    meetLink: row.meetLink || null,
    googleEventId: row.googleEventId || null,
    status: row.status || "scheduled",
    createdAt: toIso(row.createdAt),
    clinic: clinic
      ? {
          id: String(clinic.id),
          name: clinic.name || `Clinic ${clinic.id}`,
          acronym: clinic.acronym || "",
          themeColor: clinic.themeColor || "azure"
        }
      : null
  };
}

async function createAppointmentFromIntake({
  clinicId,
  conversationId = null,
  callId = null,
  source = "chat",
  patientInfo = {},
  meetResult = null
} = {}) {
  try {
    const clinic = await resolveClinicRow(clinicId);
    if (!clinic) {
      // eslint-disable-next-line no-console
      console.error(`[Appointment] clinic not found clinicId=${clinicId || "-"}`);
      return null;
    }

    const normalized = normalizePatientInfo(patientInfo);
    const window = resolveAppointmentWindow(normalized);
    if (!window?.start || !window?.end) {
      // eslint-disable-next-line no-console
      console.error(`[Appointment] missing datetime clinicId=${clinic.id}`);
      return null;
    }

    const created = await Appointment.create({
      clinicId: clinic.id,
      conversationId: conversationId ? Number(conversationId) : null,
      callId: callId ? Number(callId) : null,
      source: String(source || "chat").slice(0, 32),
      patientName: normalized.name,
      patientEmail: normalized.email || null,
      patientPhone: normalized.phone || null,
      patientDob: normalized.dob || null,
      patientType: normalized.type || null,
      startsAt: window.start,
      endsAt: window.end,
      meetLink: meetResult?.meetLink || null,
      googleEventId: meetResult?.eventId || null,
      status: "scheduled"
    });

    return created;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Appointment] persist failed: ${err.message}`);
    return null;
  }
}

async function listAppointments({ clinicId = null, from = null, to = null } = {}) {
  const where = { status: "scheduled" };
  const id = Number(clinicId);
  if (Number.isFinite(id) && id > 0) where.clinicId = id;

  if (from || to) {
    where.startsAt = {};
    if (from) {
      const start = new Date(from);
      if (!Number.isNaN(start.getTime())) where.startsAt[Op.gte] = start;
    }
    if (to) {
      const end = new Date(to);
      if (!Number.isNaN(end.getTime())) where.startsAt[Op.lte] = end;
    }
    if (!Object.keys(where.startsAt).length) delete where.startsAt;
  }

  const rows = await Appointment.findAll({
    where,
    include: [
      {
        model: Clinic,
        as: "clinic",
        attributes: ["id", "name", "acronym", "themeColor"],
        required: false
      }
    ],
    order: [["startsAt", "ASC"]]
  });

  return rows.map(mapAppointmentRow);
}

async function cancelAppointment(appointmentId) {
  const id = Number(appointmentId);
  if (!Number.isFinite(id) || id <= 0) {
    return { ok: false, status: 400, error: "Invalid appointment id." };
  }

  const row = await Appointment.findByPk(id, {
    include: [
      {
        model: Clinic,
        as: "clinic",
        attributes: ["id", "name", "acronym", "themeColor"],
        required: false
      }
    ]
  });
  if (!row) {
    return { ok: false, status: 404, error: "Appointment not found." };
  }
  if (String(row.status || "").toLowerCase() === "cancelled") {
    return { ok: false, status: 409, error: "Appointment is already cancelled." };
  }

  let calendarResult = null;
  if (row.googleEventId) {
    const { tryCancelGoogleCalendarEvent } = require("./googleMeetService");
    calendarResult = await tryCancelGoogleCalendarEvent({
      clinicId: row.clinicId,
      eventId: row.googleEventId
    });
    if (!calendarResult?.cancelled) {
      // eslint-disable-next-line no-console
      console.error(
        `[Appointment] Google Calendar cancel failed id=${id}: ${calendarResult?.reason || "unknown"}`
      );
    }
  }

  await row.update({ status: "cancelled" });
  await row.reload({
    include: [
      {
        model: Clinic,
        as: "clinic",
        attributes: ["id", "name", "acronym", "themeColor"],
        required: false
      }
    ]
  });

  return {
    ok: true,
    appointment: mapAppointmentRow(row),
    calendarCancelled: Boolean(calendarResult?.cancelled)
  };
}

module.exports = {
  resolveClinicRow,
  createAppointmentFromIntake,
  listAppointments,
  cancelAppointment,
  mapAppointmentRow
};
