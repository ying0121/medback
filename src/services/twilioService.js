const twilio = require("twilio");

const twilioAccountSid = process.env.TWILIO_ACCOUNT_SID || "";
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || "";
const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || "";
const alertPhoneNumber = process.env.ALERT_PHONE_NUMBER || "";
const twilioCallSessions = new Map(); // callSid -> { callSid, identity, isMuted, status }
let client = null;

function getClient() {
  if (!client) {
    if (!twilioAccountSid || !twilioAuthToken) {
      throw new Error(
        "Twilio credentials are not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
      );
    }
    client = twilio(twilioAccountSid, twilioAuthToken);
  }
  return client;
}

async function sendAlertSms(body) {
  if (!twilioAccountSid || !twilioAuthToken || !twilioPhoneNumber || !alertPhoneNumber) {
    return { sent: false, reason: "Twilio is not configured." };
  }

  const response = await getClient().messages.create({
    body,
    from: twilioPhoneNumber,
    to: alertPhoneNumber
  });

  return { sent: true, sid: response.sid };
}

async function initiateCall({ toPhoneNumber, patientPhoneNumber, callbackUrl }) {
  if (!twilioPhoneNumber) {
    throw new Error("TWILIO_PHONE_NUMBER is not configured.");
  }
  if (!toPhoneNumber) {
    throw new Error("Doctor phone number is required.");
  }
  if (!patientPhoneNumber) {
    throw new Error("Patient phone number is required.");
  }

  const twiml = new twilio.twiml.VoiceResponse();
  // Strict bridge mode: no auto speech, only doctor <-> patient connection.
  const dial = twiml.dial({ answerOnBridge: true, callerId: twilioPhoneNumber });
  dial.number(patientPhoneNumber);

  const options = {
    to: toPhoneNumber,
    from: twilioPhoneNumber,
    twiml: twiml.toString()
  };
  if (callbackUrl) {
    options.statusCallback = callbackUrl;
    options.statusCallbackMethod = "POST";
    options.statusCallbackEvent = ["initiated", "ringing", "answered", "completed"];
  }

  const call = await getClient().calls.create(options);
  return {
    callSid: call.sid,
    status: call.status,
    patientPhoneNumber,
    to: call.to,
    from: call.from,
    direction: call.direction
  };
}

async function getCallStatus(callSid) {
  if (!callSid) {
    throw new Error("callSid is required.");
  }
  const call = await getClient().calls(callSid).fetch();
  return {
    callSid: call.sid,
    status: call.status,
    duration: call.duration,
    to: call.to,
    from: call.from,
    startTime: call.startTime,
    endTime: call.endTime
  };
}

async function endCall(callSid) {
  if (!callSid) {
    throw new Error("callSid is required.");
  }
  const call = await getClient().calls(callSid).update({ status: "completed" });
  const existing = twilioCallSessions.get(callSid);
  if (existing) {
    twilioCallSessions.set(callSid, { ...existing, status: "completed" });
  }
  return { callSid: call.sid, status: call.status };
}

function generateAccessToken(identity) {
  const apiKeySid = process.env.TWILIO_API_KEY_SID || process.env.TWILIO_API_KEY || "";
  const apiKeySecret = process.env.TWILIO_API_KEY_SECRET || process.env.TWILIO_API_SECRET || "";
  const twimlAppSid = process.env.TWILIO_TWIML_APP_SID || "";

  if (!twilioAccountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    throw new Error(
      "TWILIO_ACCOUNT_SID, TWILIO_API_KEY_SID, TWILIO_API_KEY_SECRET and TWILIO_TWIML_APP_SID are required."
    );
  }
  if (!identity) {
    throw new Error("identity is required.");
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VoiceGrant = AccessToken.VoiceGrant;

  const token = new AccessToken(twilioAccountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600
  });
  token.addGrant(
    new VoiceGrant({
      outgoingApplicationSid: twimlAppSid,
      incomingAllow: true
    })
  );

  return token.toJwt();
}

function buildDirectDialTwiml({ toPhoneNumber }) {
  const doctorPhoneNumber =
    String(toPhoneNumber || "").trim() || String(process.env.EXAMPLE_DOCTOR_PHONE_NUMBER || "").trim();
  if (!doctorPhoneNumber) {
    throw new Error("Doctor phone number is required.");
  }
  const twiml = new twilio.twiml.VoiceResponse();
  const dial = twiml.dial({
    answerOnBridge: true,
    callerId: twilioPhoneNumber || undefined
  });
  dial.number(doctorPhoneNumber);
  return twiml.toString();
}

function trackCallStatus({ callSid, statusCallbackEvent, callStatus, identity }) {
  if (!callSid) return null;
  const status = String(callStatus || statusCallbackEvent || "").toLowerCase() || "unknown";
  const current = twilioCallSessions.get(callSid) || {
    callSid,
    identity: identity || "unknown",
    isMuted: false
  };
  const next = {
    ...current,
    callSid,
    identity: identity || current.identity || "unknown",
    status
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
    isMuted: false
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
  generateAccessToken,
  buildDirectDialTwiml,
  trackCallStatus,
  setCallMuted
};
