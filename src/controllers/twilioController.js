const {
  generateAccessToken,
  buildDirectDialTwiml,
  initiateCall,
  endCall,
  trackCallStatus,
  setCallMuted
} = require("../services/twilioService");

function normalizeIdentity(value) {
  const identity = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .slice(0, 64);
  if (!identity) return null;
  return identity;
}

function createRandomIdentity(prefix = "voice_user") {
  const token = Math.random().toString(36).slice(2, 12);
  return `${prefix}_${token}`;
}

function getServerUrl(req) {
  if (process.env.SERVER_URL) return process.env.SERVER_URL;
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
}

async function createVoiceToken(req, res, next) {
  try {
    const providedIdentity = normalizeIdentity(req.body?.identity || req.query?.identity);
    const identity = providedIdentity || createRandomIdentity();

    const token = generateAccessToken(identity);
    return res.status(200).json({
      token,
      identity,
      expiresIn: 3600
    });
  } catch (err) {
    return next(err);
  }
}

async function voiceConferenceTwiml(req, res, next) {
  try {
    const toPhoneNumber =
      req.body?.toPhoneNumber || req.body?.doctorPhoneNumber || req.body?.To || req.query?.toPhoneNumber;
    const twiml = buildDirectDialTwiml({ toPhoneNumber });
    res.type("text/xml");
    return res.status(200).send(twiml);
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createVoiceToken,
  voiceConferenceTwiml,
  async startCallSession(req, res, next) {
    try {
      const providedIdentity = normalizeIdentity(req.body?.identity || req.query?.identity);
      const identity = providedIdentity || createRandomIdentity("patient");
      const doctorPhoneNumber =
        req.body?.toPhoneNumber ||
        req.body?.doctorPhoneNumber ||
        req.query?.toPhoneNumber ||
        process.env.EXAMPLE_DOCTOR_PHONE_NUMBER ||
        null;
      const patientPhoneNumber =
        req.body?.patientPhoneNumber ||
        req.body?.fromPhoneNumber ||
        req.query?.patientPhoneNumber ||
        process.env.EXAMPLE_PATIENT_PHONE_NUMBER ||
        null;

      if (!doctorPhoneNumber || !patientPhoneNumber) {
        return res.status(400).json({
          error: "doctor and patient phone numbers are required."
        });
      }

      const callbackUrl =
        process.env.TWILIO_CALL_CALLBACK_URL || `${getServerUrl(req)}/api/twilio/call-status`;

      const call = await initiateCall({
        toPhoneNumber: doctorPhoneNumber,
        patientPhoneNumber,
        callbackUrl
      });

      return res.status(200).json({
        ok: true,
        identity,
        toPhoneNumber: doctorPhoneNumber,
        patientPhoneNumber,
        callSid: call.callSid,
        status: call.status
      });
    } catch (err) {
      return next(err);
    }
  },
  async callStatusWebhook(req, res, next) {
    try {
      const callSid = String(req.body?.CallSid || req.body?.callSid || "").trim();
      const statusCallbackEvent = req.body?.CallStatus || req.body?.CallEvent || null;
      const callStatus = req.body?.CallStatus || null;
      const identity = req.body?.Caller || req.body?.From || "unknown";
      trackCallStatus({ callSid, statusCallbackEvent, callStatus, identity });
      return res.sendStatus(200);
    } catch (err) {
      return next(err);
    }
  },
  async stopCall(req, res, next) {
    try {
      const callSid = String(req.body?.callSid || "").trim();
      if (!callSid) return res.status(400).json({ error: "callSid required." });
      const ended = await endCall(callSid);
      return res.status(200).json({ ok: true, callSid: ended.callSid, status: ended.status });
    } catch (err) {
      return next(err);
    }
  },
  async muteCall(req, res, next) {
    try {
      const callSid = String(req.body?.callSid || "").trim();
      const isMuted = req.body?.isMuted;
      if (!callSid || typeof isMuted !== "boolean") {
        return res.status(400).json({ error: "callSid and boolean isMuted required." });
      }
      const session = setCallMuted({ callSid, isMuted });
      return res.status(200).json({
        ok: true,
        callSid: session.callSid,
        isMuted: session.isMuted,
        status: session.status || "unknown"
      });
    } catch (err) {
      return next(err);
    }
  },
  async voiceTwiml(req, res, next) {
    try {
      const toPhoneNumber =
        req.body?.toPhoneNumber || req.body?.doctorPhoneNumber || req.body?.To || req.query?.toPhoneNumber;
      const twiml = buildDirectDialTwiml({ toPhoneNumber });
      res.type("text/xml");
      return res.status(200).send(twiml);
    } catch (err) {
      return next(err);
    }
  }
};
