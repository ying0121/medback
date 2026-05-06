const twilio = require("twilio");
const { Clinic } = require("../db");

const twilioCallSessions = new Map(); // callSid -> { callSid, identity, isMuted, status }
const clientCache = new Map(); // accountSid:authToken -> twilio client

function isE164(phone) {
  return /^\+[1-9]\d{6,14}$/.test(String(phone || "").trim());
}

function mapLifecycleEvent(statusValue) {
  const status = String(statusValue || "").toLowerCase();
  if (["in-progress", "answered"].includes(status)) return "accepted";
  if (["queued", "initiated", "ringing"].includes(status)) return "ringing";
  if (["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) return "finished";
  return "status_update";
}

function normalizePhone(phone) {
  const raw = String(phone || "").trim();
  if (!raw) return "";
  const noSpaces = raw.replace(/[\s()-]/g, "");
  if (noSpaces.startsWith("+")) return noSpaces;
  const digits = noSpaces.replace(/[^\d]/g, "");
  return digits ? `+${digits}` : "";
}

async function getClinicTwilioConfigByClinicId(clinicId) {
  const id = Number(clinicId);
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("clinicId is required.");
  }
  const clinic = await Clinic.findByPk(id, {
    attributes: [
      "id",
      "twilioPhoneNumber",
      "twilioAccountSid",
      "twilioAuthToken",
      "twilioApiKeySid",
      "twilioApiKeySecret",
      "twilioTwimlAppSid"
    ]
  });
  if (!clinic) throw new Error("Clinic not found.");

  const cfg = {
    clinicId: Number(clinic.id),
    twilioPhoneNumber: normalizePhone(clinic.twilioPhoneNumber),
    twilioAccountSid: String(clinic.twilioAccountSid || "").trim(),
    twilioAuthToken: String(clinic.twilioAuthToken || "").trim(),
    twilioApiKeySid: String(clinic.twilioApiKeySid || "").trim(),
    twilioApiKeySecret: String(clinic.twilioApiKeySecret || "").trim(),
    twilioTwimlAppSid: String(clinic.twilioTwimlAppSid || "").trim()
  };

  if (!cfg.twilioAccountSid || !cfg.twilioAuthToken || !cfg.twilioPhoneNumber) {
    throw new Error("Clinic Twilio account SID, auth token and phone number are required.");
  }
  return cfg;
}

async function getClinicTwilioConfigByPhoneNumber(phoneNumber) {
  const normalized = normalizePhone(phoneNumber);
  if (!normalized) throw new Error("phoneNumber is required.");
  const clinics = await Clinic.findAll({
    attributes: [
      "id",
      "twilioPhoneNumber",
      "twilioAccountSid",
      "twilioAuthToken",
      "twilioApiKeySid",
      "twilioApiKeySecret",
      "twilioTwimlAppSid"
    ]
  });
  const matched = clinics.find((c) => normalizePhone(c.twilioPhoneNumber) === normalized);
  if (!matched) throw new Error("No clinic found for Twilio phone number.");
  return getClinicTwilioConfigByClinicId(matched.id);
}

function getClient(config) {
  const accountSid = String(config?.twilioAccountSid || "").trim();
  const authToken = String(config?.twilioAuthToken || "").trim();
  if (!accountSid || !authToken) {
    throw new Error("Twilio account SID and auth token are required.");
  }
  const key = `${accountSid}:${authToken}`;
  if (!clientCache.has(key)) {
    clientCache.set(key, twilio(accountSid, authToken));
  }
  return clientCache.get(key);
}

async function sendAlertSms({ body, clinicId, toPhoneNumber }) {
  const cfg = await getClinicTwilioConfigByClinicId(clinicId);
  const to = normalizePhone(toPhoneNumber);
  if (!to) {
    return { sent: false, reason: "Destination phone number is required." };
  }

  const response = await getClient(cfg).messages.create({
    body,
    from: cfg.twilioPhoneNumber,
    to
  });

  return { sent: true, sid: response.sid };
}

async function initiateCall({ toPhoneNumber, patientPhoneNumber, callbackUrl, clinicId }) {
  const cfg = await getClinicTwilioConfigByClinicId(clinicId);
  if (!toPhoneNumber) {
    throw new Error("Doctor phone number is required.");
  }
  if (!patientPhoneNumber) {
    throw new Error("Patient phone number is required.");
  }

  const twiml = new twilio.twiml.VoiceResponse();
  // Strict bridge mode: no auto speech, only doctor <-> patient connection.
  const dial = twiml.dial({ answerOnBridge: true, callerId: cfg.twilioPhoneNumber });
  dial.number(patientPhoneNumber);

  const options = {
    to: toPhoneNumber,
    from: cfg.twilioPhoneNumber,
    twiml: twiml.toString()
  };
  if (callbackUrl) {
    options.statusCallback = callbackUrl;
    options.statusCallbackMethod = "POST";
    options.statusCallbackEvent = ["initiated", "ringing", "answered", "completed"];
  }

  const call = await getClient(cfg).calls.create(options);
  trackCallStatus({
    callSid: call.sid,
    statusCallbackEvent: call.status,
    callStatus: call.status,
    identity: "unknown",
    clinicId: cfg.clinicId,
    twilioPhoneNumber: cfg.twilioPhoneNumber
  });
  return {
    callSid: call.sid,
    status: call.status,
    patientPhoneNumber,
    to: call.to,
    from: call.from,
    direction: call.direction
  };
}

async function getCallStatus(callSid, { clinicId = null } = {}) {
  if (!callSid) {
    throw new Error("callSid is required.");
  }
  const existing = twilioCallSessions.get(callSid) || null;
  const resolvedClinicId = clinicId || existing?.clinicId || null;
  if (!resolvedClinicId) throw new Error("clinicId is required.");
  const cfg = await getClinicTwilioConfigByClinicId(resolvedClinicId);
  const call = await getClient(cfg).calls(callSid).fetch();
  const currentStatus = String(call.status || "").toLowerCase();
  const lifecycle = mapLifecycleEvent(currentStatus);
  const previous = existing;
  const previousStatus = String(previous?.status || "").toLowerCase();

  if (currentStatus && currentStatus !== previousStatus) {
    // eslint-disable-next-line no-console
    console.log(
      `[Twilio][event:${lifecycle}][poll] callSid=${call.sid} status=${currentStatus} from=${call.from || "-"} to=${call.to || "-"}`
    );
  }
  twilioCallSessions.set(callSid, {
    ...(previous || {}),
    callSid: call.sid,
    status: currentStatus || "unknown",
    identity: previous?.identity || "unknown",
    isMuted: previous?.isMuted === true,
    clinicId: resolvedClinicId,
    twilioPhoneNumber: cfg.twilioPhoneNumber
  });

  return {
    callSid: call.sid,
    status: call.status,
    duration: call.duration,
    to: call.to,
    from: call.from,
    answeredBy: call.answeredBy || null,
    queueTime: call.queueTime || null,
    price: call.price || null,
    priceUnit: call.priceUnit || null,
    errorCode: call.errorCode || null,
    errorMessage: call.errorMessage || null,
    startTime: call.startTime,
    endTime: call.endTime
  };
}

async function endCall(callSid, { clinicId = null } = {}) {
  if (!callSid) {
    throw new Error("callSid is required.");
  }
  const existing = twilioCallSessions.get(callSid) || null;
  const resolvedClinicId = clinicId || existing?.clinicId || null;
  if (!resolvedClinicId) throw new Error("clinicId is required.");
  const cfg = await getClinicTwilioConfigByClinicId(resolvedClinicId);
  const call = await getClient(cfg).calls(callSid).update({ status: "completed" });
  const latest = twilioCallSessions.get(callSid);
  if (latest) {
    twilioCallSessions.set(callSid, { ...latest, status: "completed" });
  }
  return { callSid: call.sid, status: call.status };
}

async function startCallRecording({ callSid, recordingStatusCallback, clinicId }) {
  if (!callSid) {
    throw new Error("callSid is required.");
  }
  const cfg = await getClinicTwilioConfigByClinicId(clinicId);
  const payload = {};
  if (recordingStatusCallback) {
    payload.recordingStatusCallback = recordingStatusCallback;
    payload.recordingStatusCallbackMethod = "POST";
    payload.recordingStatusCallbackEvent = ["completed", "absent"];
  }
  const recording = await getClient(cfg).calls(callSid).recordings.create(payload);
  return {
    recordingSid: recording.sid,
    callSid: recording.callSid || callSid,
    status: recording.status || "in-progress"
  };
}

async function generateAccessToken(identity, { clinicId }) {
  const cfg = await getClinicTwilioConfigByClinicId(clinicId);
  const apiKeySid = cfg.twilioApiKeySid;
  const apiKeySecret = cfg.twilioApiKeySecret;
  const twimlAppSid = cfg.twilioTwimlAppSid;
  const twilioAccountSid = cfg.twilioAccountSid;

  if (!twilioAccountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    throw new Error(
      "TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and TWILIO_TWIML_APP_SID are required for browser calling."
    );
  }
  if (!identity) throw new Error("identity is required.");

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;
  const token = new AccessToken(twilioAccountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600
  });
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: false
    })
  );
  return token.toJwt();
}

// Returns TwiML that dials the doctor's phone when patient's browser calls.
async function buildOutboundDialTwiml({ doctorPhoneNumber, dialActionUrl = null, clinicId }) {
  const cfg = await getClinicTwilioConfigByClinicId(clinicId);
  const target =
    String(doctorPhoneNumber || "").trim() ||
    String(process.env.EXAMPLE_DOCTOR_PHONE_NUMBER || "").trim();
  if (!target) throw new Error("Doctor phone number is required.");
  const twiml = new twilio.twiml.VoiceResponse();
  const dialOptions = {
    callerId: cfg.twilioPhoneNumber || undefined,
    answerOnBridge: true,
    timeout: 30
  };
  if (dialActionUrl) {
    dialOptions.action = dialActionUrl;
    dialOptions.method = "POST";
  }
  const dial = twiml.dial(dialOptions);
  dial.number(target);
  return twiml.toString();
}

function trackCallStatus({ callSid, statusCallbackEvent, callStatus, identity, clinicId = null, twilioPhoneNumber = null }) {
  if (!callSid) return null;
  const status = String(callStatus || statusCallbackEvent || "").toLowerCase() || "unknown";
  const current = twilioCallSessions.get(callSid) || {
    callSid,
    identity: identity || "unknown",
    isMuted: false,
    clinicId: clinicId || null,
    twilioPhoneNumber: twilioPhoneNumber || null
  };
  const next = {
    ...current,
    callSid,
    identity: identity || current.identity || "unknown",
    status,
    clinicId: clinicId || current.clinicId || null,
    twilioPhoneNumber: twilioPhoneNumber || current.twilioPhoneNumber || null
  };
  twilioCallSessions.set(callSid, next);
  return next;
}

function setCallMuted({ callSid, isMuted }) {
  if (!callSid) throw new Error("callSid is required.");
  if (typeof isMuted !== "boolean") throw new Error("isMuted must be boolean.");
  const current = twilioCallSessions.get(callSid) || {
    callSid,
    identity: "unknown",
    status: "unknown",
    isMuted: false,
    clinicId: null,
    twilioPhoneNumber: null
  };
  const next = { ...current, isMuted };
  twilioCallSessions.set(callSid, next);
  return next;
}

module.exports = {
  sendAlertSms,
  initiateCall,
  getCallStatus,
  endCall,
  startCallRecording,
  trackCallStatus,
  setCallMuted,
  generateAccessToken,
  buildOutboundDialTwiml,
  isE164,
  getClinicTwilioConfigByPhoneNumber,
  getClinicTwilioConfigByClinicId
};
