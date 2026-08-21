/**
 * Create Google Meet links via Google Calendar API using per-clinic OAuth credentials.
 *
 * Required clinic fields: googleClientId, googleClientSecret, googleRefreshToken.
 * The refresh token must be issued with Calendar access so conferenceData can
 * attach a Google Meet conference to the event.
 */

const crypto = require("crypto");
const axios = require("axios");
const { APP_TIMEZONE, formatGoogleDateTime } = require("../utils/appTimeZone");
const { Clinic } = require("../db");
const { resolveAppointmentWindow, isNonPatientEmail } = require("./appointmentIntakeService");

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const DEFAULT_TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE || APP_TIMEZONE;

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function readGoogleCredential(clinic, camel, column) {
  return String(
    clinic?.[camel] ||
      clinic?.getDataValue?.(camel) ||
      clinic?.dataValues?.[camel] ||
      clinic?.dataValues?.[column] ||
      ""
  ).trim();
}

function googleApiErrorMessage(err) {
  const data = err?.response?.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  const nested = data?.error?.message || data?.error_description || data?.error;
  if (typeof nested === "string" && nested.trim()) return nested.trim();
  return err?.message || "Google Meet request failed.";
}

async function resolveSystemClinicId(clinicId) {
  const id = Number(clinicId);
  if (!Number.isFinite(id) || id <= 0) return null;

  const byPk = await Clinic.findByPk(id, { attributes: ["id"] });
  if (byPk) return Number(byPk.id);

  const byBusinessId = await Clinic.findOne({
    where: { clinicId: id },
    attributes: ["id"]
  });
  return byBusinessId ? Number(byBusinessId.id) : null;
}

async function getClinicGoogleConfig(clinicId) {
  const systemClinicId = await resolveSystemClinicId(clinicId);
  if (!systemClinicId) return null;

  const clinic = await Clinic.findByPk(systemClinicId, {
    attributes: [
      "id",
      "name",
      "meetingProvider",
      "googleClientId",
      "googleClientSecret",
      "googleRefreshToken",
      "googleCreateMeet"
    ]
  });
  if (!clinic) return null;

  const meetingProvider = String(clinic.meetingProvider || "google").trim().toLowerCase();
  if (meetingProvider && meetingProvider !== "google") {
    return null;
  }

  const googleClientId = readGoogleCredential(clinic, "googleClientId", "google_client_id");
  const googleClientSecret = readGoogleCredential(clinic, "googleClientSecret", "google_client_secret");
  const googleRefreshToken = readGoogleCredential(clinic, "googleRefreshToken", "google_refresh_token");
  if (!googleClientId || !googleClientSecret || !googleRefreshToken) {
    // eslint-disable-next-line no-console
    console.error(
      `[GoogleMeet] clinic ${systemClinicId} missing google_client_id, google_client_secret, or google_refresh_token`
    );
    return null;
  }

  return {
    clinicId: Number(clinic.id),
    clinicName: String(clinic.name || "").trim() || `Clinic ${clinic.id}`,
    googleClientId,
    googleClientSecret,
    googleRefreshToken,
    googleCreateMeet: Boolean(clinic.googleCreateMeet)
  };
}

async function getAccessToken(config) {
  const body = new URLSearchParams({
    client_id: config.googleClientId,
    client_secret: config.googleClientSecret,
    refresh_token: config.googleRefreshToken,
    grant_type: "refresh_token"
  });

  const response = await axios.post(TOKEN_URL, body.toString(), {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    timeout: 15000
  });

  const accessToken = String(response.data?.access_token || "").trim();
  if (!accessToken) {
    throw new Error("Google did not return an access token.");
  }
  return accessToken;
}

function extractMeetLink(event) {
  const hangout = String(event?.hangoutLink || "").trim();
  if (hangout) return hangout;

  const entryPoints = event?.conferenceData?.entryPoints;
  if (Array.isArray(entryPoints)) {
    const video = entryPoints.find((entry) => entry?.entryPointType === "video" && entry?.uri);
    if (video?.uri) return String(video.uri).trim();
    const any = entryPoints.find((entry) => entry?.uri);
    if (any?.uri) return String(any.uri).trim();
  }

  return String(event?.htmlLink || "").trim();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function eventHasAttendee(event, email) {
  const wanted = String(email || "").trim().toLowerCase();
  if (!wanted) return false;
  const attendees = Array.isArray(event?.attendees) ? event.attendees : [];
  return attendees.some((item) => String(item?.email || "").trim().toLowerCase() === wanted);
}

async function notifyGoogleAttendee({ accessToken, eventId, attendee, description }) {
  const url = `${CALENDAR_EVENTS_URL}/${encodeURIComponent(eventId)}`;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json"
  };

  try {
    const patched = await axios.patch(
      url,
      {
        description,
        attendees: [attendee],
        status: "confirmed"
      },
      {
        params: {
          conferenceDataVersion: 1,
          sendUpdates: "all"
        },
        headers,
        timeout: 20000
      }
    );
    if (eventHasAttendee(patched.data, attendee.email)) {
      return { inviteSent: true };
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[GoogleMeet] attendee patch failed eventId=${eventId}: ${googleApiErrorMessage(err)}`);
  }

  try {
    const existing = await axios.get(url, { headers, timeout: 15000 });
    return {
      inviteSent: eventHasAttendee(existing.data, attendee.email),
      reason: eventHasAttendee(existing.data, attendee.email)
        ? ""
        : "Google Calendar event has no patient attendee."
    };
  } catch (err) {
    return { inviteSent: false, reason: googleApiErrorMessage(err) };
  }
}

/**
 * Create a Google Calendar event with a Meet conference for an appointment.
 * Returns { created: false } when credentials are missing; never throws to callers
 * that wrap it, but this function itself throws on API failure so callers can log.
 */
async function createGoogleMeetForAppointment({
  clinicId,
  patientInfo = {},
  clinicName = "",
  summary = "",
  description = "",
  extras = {}
} = {}) {
  const config = await getClinicGoogleConfig(clinicId);
  if (!config) {
    return { created: false, skipped: true, reason: "Google Meet is not configured for this clinic." };
  }

  const { start, end, timeZone } = resolveAppointmentWindow(patientInfo, {
    ...extras,
    timeZone: extras.timeZone || DEFAULT_TIMEZONE
  });
  if (!start || !end) {
    return { created: false, skipped: true, reason: "Appointment date and time are required." };
  }

  // eslint-disable-next-line no-console
  console.log(
    `[GoogleMeet] creating event clinicId=${config.clinicId} via google_client_id=${config.googleClientId.slice(0, 20)}…`
  );

  const patientName = firstNonEmpty(patientInfo.name, extras.patientName) || "Patient";
  const patientEmail = firstNonEmpty(patientInfo.email, extras.patientEmail);
  const accessToken = await getAccessToken(config);
  const hasPatientEmail = isValidEmail(patientEmail) && !isNonPatientEmail(patientEmail);
  const eventSummary =
    firstNonEmpty(summary, extras.summary) ||
    `Appointment · ${patientName} @ ${clinicName || config.clinicName}`;

  const eventDescription = firstNonEmpty(description, extras.description) ||
    [
      `Patient: ${patientName}`,
      patientInfo.phone ? `Phone: ${patientInfo.phone}` : "",
      patientInfo.email ? `Email: ${patientInfo.email}` : "",
      patientInfo.type ? `Patient type: ${patientInfo.type}` : ""
    ]
      .filter(Boolean)
      .join("\n");

  const attendee = hasPatientEmail
    ? {
        email: patientEmail.toLowerCase(),
        displayName: patientName,
        responseStatus: "needsAction",
        optional: false
      }
    : null;

  const payload = {
    summary: eventSummary,
    description: eventDescription,
    start: { dateTime: formatGoogleDateTime(start, timeZone), timeZone },
    end: { dateTime: formatGoogleDateTime(end, timeZone), timeZone },
    status: "confirmed",
    anyoneCanAddSelf: false,
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    guestsCanSeeOtherGuests: false,
    reminders: { useDefault: true }
  };

  if (config.googleCreateMeet) {
    payload.conferenceData = {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: "hangoutsMeet" }
      }
    };
  }

  if (attendee) {
    payload.attendees = [attendee];
  } else {
    // eslint-disable-next-line no-console
    console.error("[GoogleMeet] patient email missing; calendar invitation will not be sent by Google");
  }

  const notifyParams = {
    sendUpdates: attendee ? "all" : "none"
  };
  if (config.googleCreateMeet) {
    notifyParams.conferenceDataVersion = 1;
  }

  const response = await axios.post(CALENDAR_EVENTS_URL, payload, {
    params: notifyParams,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    timeout: 20000
  });

  const eventId = String(response.data?.id || "").trim();
  const meetLink = config.googleCreateMeet ? extractMeetLink(response.data) : "";
  if (config.googleCreateMeet && !meetLink) {
    throw new Error("Google Calendar event was created but no Meet link was returned.");
  }

  let inviteSent = eventHasAttendee(response.data, patientEmail);

  if (attendee && eventId) {
    const notifyResult = await notifyGoogleAttendee({
      accessToken,
      eventId,
      attendee,
      description: [eventDescription, meetLink ? "Join Google Meet:" : "", meetLink]
        .filter(Boolean)
        .join("\n")
    });
    inviteSent = Boolean(notifyResult.inviteSent);
    if (!inviteSent) {
      // eslint-disable-next-line no-console
      console.error(
        `[GoogleMeet] Google did not confirm attendee ${patientEmail} eventId=${eventId}: ${notifyResult.reason || "unknown"}`
      );
    } else {
      // eslint-disable-next-line no-console
      console.log(`[GoogleMeet] calendar invitation sent to ${patientEmail} eventId=${eventId}`);
    }
  }

  return {
    created: true,
    skipped: false,
    meetLink: meetLink || null,
    htmlLink: String(response.data?.htmlLink || "").trim() || null,
    eventId: eventId || null,
    inviteSent,
    inviteEmail: attendee ? attendee.email : null,
    start: start.toISOString(),
    end: end.toISOString()
  };
}

async function tryCreateGoogleMeetForAppointment(params) {
  try {
    return await createGoogleMeetForAppointment(params);
  } catch (err) {
    const reason = googleApiErrorMessage(err);
    // eslint-disable-next-line no-console
    console.error(`[GoogleMeet] failed clinicId=${params?.clinicId || "-"}: ${reason}`);
    return { created: false, skipped: false, reason };
  }
}

async function cancelGoogleCalendarEvent({ clinicId, eventId } = {}) {
  const config = await getClinicGoogleConfig(clinicId);
  if (!config) {
    return { cancelled: false, skipped: true, reason: "Google Meet is not configured for this clinic." };
  }

  const eventIdStr = String(eventId || "").trim();
  if (!eventIdStr) {
    return { cancelled: false, skipped: true, reason: "Google Calendar event id is missing." };
  }

  const accessToken = await getAccessToken(config);
  await axios.delete(`${CALENDAR_EVENTS_URL}/${encodeURIComponent(eventIdStr)}`, {
    params: { sendUpdates: "all" },
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 20000
  });

  // eslint-disable-next-line no-console
  console.log(`[GoogleMeet] cancelled event clinicId=${config.clinicId} eventId=${eventIdStr}`);
  return { cancelled: true, eventId: eventIdStr };
}

async function tryCancelGoogleCalendarEvent(params) {
  try {
    return await cancelGoogleCalendarEvent(params);
  } catch (err) {
    const reason = googleApiErrorMessage(err);
    // eslint-disable-next-line no-console
    console.error(
      `[GoogleMeet] cancel failed clinicId=${params?.clinicId || "-"} eventId=${params?.eventId || "-"}: ${reason}`
    );
    return { cancelled: false, reason };
  }
}

function helpRequestedIncludesAppointment(helpRequested) {
  const items = Array.isArray(helpRequested) ? helpRequested : [];
  return items.some((item) => String(item || "").toLowerCase().includes("appointment"));
}

module.exports = {
  getClinicGoogleConfig,
  createGoogleMeetForAppointment,
  tryCreateGoogleMeetForAppointment,
  cancelGoogleCalendarEvent,
  tryCancelGoogleCalendarEvent,
  helpRequestedIncludesAppointment,
  resolveAppointmentWindow
};
