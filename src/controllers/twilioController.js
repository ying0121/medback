/**
 * Twilio voice + telephony controller.
 *
 * Inbound PSTN voice bot uses Twilio Media Streams (live-streaming mode):
 *   1. POST /voice/inbound  – returns <Connect><Stream> TwiML; pre-loads clinic
 *      context and registers it for the WebSocket phase.
 *   2. WS   /api/twilio/voice/stream  – Deepgram STT → LLM → ElevenLabs TTS
 *      pipeline runs in real-time over the Media Stream WebSocket
 *      (see realtime/inboundStreamHandler.js + services/inboundCallSession.js).
 *
 * Outbound (Voice SDK → PSTN) flows remain unchanged.
 */

const twilio = require("twilio");
const {
  initiateCall,
  endCall,
  trackCallStatus,
  setCallMuted,
  generateAccessToken,
  buildOutboundDialTwiml,
  isE164,
  getClinicTwilioConfigByPhoneNumber,
  getClinicTwilioConfigByClinicId,
} = require("../services/twilioService");
const { buildInboundClinicContextBySystemClinicId } = require("../services/contextPromptService");
const {
  findOrCreateCallBySid,
  computeFinalCallSeconds,
} = require("../services/callPersistenceService");
const { getTtsPlaybackBuffer } = require("../services/ttsPlaybackCache");
const { WAIT_TONE_WAV } = require("../services/waitToneService");
const { registerPendingInboundSession } = require("../realtime/inboundStreamHandler");

function normalizeInboundPromptText(rawText, fallbackText) {
  const base = String(rawText || "").trim() || fallbackText;
  return base.replace(/after the tone[:,]?\s*/gi, "");
}

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

function mapLifecycleEvent(statusValue) {
  const status = String(statusValue || "").toLowerCase();
  if (["in-progress", "answered"].includes(status)) return "accepted";
  if (["queued", "initiated", "ringing"].includes(status)) return "ringing";
  if (["completed", "busy", "failed", "no-answer", "canceled"].includes(status)) return "finished";
  return "status_update";
}

function escapeForXml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildSafeVoiceResponse(message) {
  const escaped = escapeForXml(message);
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${escaped}</Say><Hangup/></Response>`;
}

module.exports = {
  // GET /api/twilio/voice/token?identity=xxx
  // Returns a Twilio Access Token so the browser can use the Voice SDK.
  async getVoiceToken(req, res, next) {
    try {
      const rawIdentity =
        req.query?.identity || req.body?.identity || null;
      const clinicIdRaw = req.query?.clinicId || req.body?.clinicId;
      const clinicId = Number(clinicIdRaw);
      if (!Number.isFinite(clinicId) || clinicId <= 0) {
        return res.status(400).json({ error: "clinicId is required." });
      }
      const identity = rawIdentity
        ? normalizeIdentity(rawIdentity) || createRandomIdentity("patient")
        : createRandomIdentity("patient");
      const jwt = await generateAccessToken(identity, { clinicId });
      // eslint-disable-next-line no-console
      console.log(`[Twilio][token] issued for identity=${identity}`);
      return res.status(200).json({ ok: true, token: jwt, identity });
    } catch (err) {
      return next(err);
    }
  },

  // POST /api/twilio/voice/twiml
  // Twilio calls this (TwiML App Voice URL) when the patient's browser connects.
  // CRITICAL: Must ALWAYS return valid XML. HTTP 5xx causes Twilio to play
  // "An application error has occurred!" and hang up immediately.
  async voiceTwiml(req, res) {
    // When using the Twilio Voice SDK, Twilio POSTs to this URL with:
    //   To   = whatever the frontend passed in device.connect({ params: { To: "..." } })
    //   From = the browser identity string
    // If the frontend did NOT pass a phone number as To (e.g. it passed a
    // TwiML App SID or nothing), we fall back to EXAMPLE_DOCTOR_PHONE_NUMBER.
    const rawTo = String(req.body?.To || req.query?.To || "").trim();
    const clinicId = Number(req.body?.clinicId || req.query?.clinicId || 0);
    const doctorPhoneNumber = isE164(rawTo)
      ? rawTo
      : String(process.env.EXAMPLE_DOCTOR_PHONE_NUMBER || "").trim();

    // eslint-disable-next-line no-console
    console.log(`[Twilio][twiml] rawTo=${rawTo || "-"} resolved doctorPhone=${doctorPhoneNumber || "-"}`);

    if (!doctorPhoneNumber) {
      // eslint-disable-next-line no-console
      console.error("[Twilio][twiml] no valid doctor phone number — check EXAMPLE_DOCTOR_PHONE_NUMBER in .env");
      res.type("text/xml");
      return res.send(buildSafeVoiceResponse("We are sorry, the call could not be connected. Please try again later."));
    }

    try {
      const dialActionUrl = `${getServerUrl(req)}/api/twilio/voice/dial-result`;
      if (!Number.isFinite(clinicId) || clinicId <= 0) {
        throw new Error("clinicId is required.");
      }
      const clinicTwilio = await getClinicTwilioConfigByClinicId(clinicId);
      const twilioNumber = clinicTwilio.twilioPhoneNumber;
      // eslint-disable-next-line no-console
      console.log(`[Twilio][twiml] callerId=${twilioNumber || "MISSING"} dialAction=${dialActionUrl}`);

      const twiml = await buildOutboundDialTwiml({ doctorPhoneNumber, dialActionUrl, clinicId });
      // eslint-disable-next-line no-console
      console.log(`[Twilio][twiml] generated XML: ${twiml}`);
      res.type("text/xml");
      return res.send(twiml);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Twilio][twiml] error: ${err.message}`);
      res.type("text/xml");
      return res.send(buildSafeVoiceResponse("We are sorry, the call could not be connected. Please try again later."));
    }
  },

  // POST /api/twilio/voice/dial-result
  // Twilio posts here after <Dial> ends with DialCallStatus.
  async voiceDialResultTwiml(req, res) {
    const dialStatus    = String(req.body?.DialCallStatus   || "").toLowerCase();
    const dialCallSid   = String(req.body?.DialCallSid      || "").trim();
    const answeredBy    = String(req.body?.AnsweredBy        || "").trim() || "-";
    const dialDuration  = String(req.body?.DialCallDuration || "").trim() || "0";
    const errorCode     = String(req.body?.ErrorCode        || "").trim() || "-";
    const callSid       = String(req.body?.CallSid          || "").trim() || "-";
    const from          = String(req.body?.From             || "").trim() || "-";
    const to            = String(req.body?.To               || "").trim() || "-";

    // eslint-disable-next-line no-console
    console.log(
      `[Twilio][dial:result] callSid=${callSid} dialCallSid=${dialCallSid || "MISSING"} status=${dialStatus || "-"} answeredBy=${answeredBy} duration=${dialDuration}s from=${from} to=${to} errorCode=${errorCode}`
    );
    // Full body for deep debugging — shows every field Twilio sent
    // eslint-disable-next-line no-console
    console.log(`[Twilio][dial:result][body] ${JSON.stringify(req.body || {})}`);

    let message = null;
    if (dialStatus === "busy") {
      message = "The doctor is currently unavailable. Please try again shortly.";
    } else if (dialStatus === "no-answer") {
      message = "The doctor did not answer. Please try again later.";
    } else if (dialStatus === "failed" || dialStatus === "canceled") {
      message = "We could not complete the call. Please try again later.";
    }

    res.type("text/xml");
    if (message) {
      return res.send(buildSafeVoiceResponse(message));
    }
    return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`);
  },

  // POST /api/twilio/voice/inbound
  // Configure your Twilio phone number "A call comes in" → Webhook → this URL (POST).
  // Responds with TwiML <Connect><Stream> to open a bidirectional Media Stream
  // WebSocket. The live pipeline (Deepgram STT → LLM → ElevenLabs TTS) runs
  // entirely over the WebSocket in inboundStreamHandler.js.
  async inboundVoiceWebhook(req, res) {
    try {
      const callSid = String(req.body?.CallSid || "").trim();
      const from    = String(req.body?.From    || "").trim();
      const to      = String(req.body?.To      || "").trim();

      const greetingText = normalizeInboundPromptText(
        process.env.TWILIO_INBOUND_VOICE_GREETING,
        "Hello. This is our automated assistant. How can I help you today?"
      );

      // 1. Create call record — must happen even if clinic lookup fails.
      let call = null;
      if (callSid) {
        call = await findOrCreateCallBySid({
          callSid,
          from,
          status: String(req.body?.CallStatus || "in-progress"),
        }).catch((dbErr) => {
          // eslint-disable-next-line no-console
          console.error(`[Twilio][inbound] call DB create failed callSid=${callSid}: ${dbErr.message}`);
          return null;
        });
      }

      // 2. Load clinic context (prompts + ElevenLabs credentials).
      let clinicContext = { clinicPrompt: null, knowledgePrompt: null, elApiKey: null, elVoiceId: null };
      try {
        const clinicTwilio = await getClinicTwilioConfigByPhoneNumber(to);
        clinicContext = await buildInboundClinicContextBySystemClinicId(clinicTwilio.clinicId);
        // eslint-disable-next-line no-console
        console.log(
          `[Twilio][inbound] clinic loaded clinicId=${clinicTwilio.clinicId} hasElKey=${!!clinicContext.elApiKey} hasElVoice=${!!clinicContext.elVoiceId}`
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[Twilio][inbound] clinic lookup failed callSid=${callSid}: ${err.message}`);
      }

      // 3. Register context so the WebSocket handler can retrieve it when Twilio connects.
      if (callSid) {
        registerPendingInboundSession(callSid, {
          ...clinicContext,
          call,
          greetingText,
        });
      }

      // 4. Return TwiML that opens a Media Stream WebSocket back to this server.
      const wsBaseUrl = String(process.env.TWILIO_STREAM_WSS_URL || "").trim()
        || (process.env.SERVER_URL || `${req.headers["x-forwarded-proto"] || req.protocol}://${req.get("host")}`)
          .replace(/^http/i, "ws");
      const wsUrl = `${wsBaseUrl.replace(/\/$/, "")}/api/twilio/voice/stream`;

      // Twilio Media Streams require secure websocket URL in production.
      if (!/^wss:\/\//i.test(wsUrl)) {
        throw new Error(`invalid stream url (must be wss://): ${wsUrl}`);
      }

      const streamStatusUrl = `${getServerUrl(req)}/api/twilio/voice/stream-status`;
      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${wsUrl}" statusCallback="${streamStatusUrl}" statusCallbackMethod="POST">
      <Parameter name="callSid" value="${callSid}" />
    </Stream>
  </Connect>
</Response>`;

      // eslint-disable-next-line no-console
      console.log(`[Twilio][inbound] returning Media Stream TwiML callSid=${callSid} wsUrl=${wsUrl}`);
      res.type("text/xml");
      return res.send(twiml);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Twilio][inbound] failed to build TwiML: ${err.message}`);
      res.type("text/xml");
      return res.send(buildSafeVoiceResponse("We are unable to connect your call right now. Please try again later."));
    }
  },

  // POST /api/twilio/message/twiml
  // Twilio calls this for inbound message webhooks and expects TwiML XML.
  async messageTwiml(req, res, next) {
    try {
      const incomingBody = String(req.body?.Body || "").trim();
      const fallbackReply = process.env.TWILIO_DEFAULT_SMS_REPLY || "Thanks! We received your message.";
      const safeIncomingText = escapeForXml(incomingBody);
      const replyText = safeIncomingText
        ? `We received: ${safeIncomingText}`
        : escapeForXml(fallbackReply);

      // eslint-disable-next-line no-console
      console.log(`[Twilio][message:twiml] from=${req.body?.From || "-"} bodyLength=${incomingBody.length}`);
      res.type("text/xml");
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${replyText}</Message></Response>`);
    } catch (err) {
      return next(err);
    }
  },

  // POST /api/twilio/voice/stream-status
  // Twilio Media Streams lifecycle callback (connected/start/stop/error).
  async inboundVoiceStreamStatus(req, res) {
    const callSid = String(req.body?.CallSid || "").trim() || "-";
    const streamSid = String(req.body?.StreamSid || "").trim() || "-";
    const streamEvent = String(req.body?.StreamEvent || "").trim() || "-";
    const streamError = String(req.body?.StreamError || "").trim() || "-";
    // eslint-disable-next-line no-console
    console.log(
      `[Twilio][stream-status] callSid=${callSid} streamSid=${streamSid} event=${streamEvent} error=${streamError}`
    );
    return res.sendStatus(200);
  },

  // POST /api/twilio/voice/fallback
  // Fallback webhook when Twilio cannot execute the primary Voice URL.
  async voiceFallbackTwiml(req, res, next) {
    try {
      const message = String(
        process.env.TWILIO_VOICE_FALLBACK_MESSAGE || "We are unable to connect your call right now. Please try again later."
      );
      // eslint-disable-next-line no-console
      console.log(`[Twilio][voice:fallback] callSid=${req.body?.CallSid || "-"} from=${req.body?.From || "-"}`);
      res.type("text/xml");
      return res.send(buildSafeVoiceResponse(message));
    } catch (err) {
      return next(err);
    }
  },

  // POST /api/twilio/message/fallback
  // Fallback webhook when Twilio cannot execute the primary Messaging URL.
  async messageFallbackTwiml(req, res, next) {
    try {
      const message = escapeForXml(
        process.env.TWILIO_MESSAGE_FALLBACK_REPLY || "Sorry, we could not process your message. Please try again shortly."
      );
      // eslint-disable-next-line no-console
      console.log(`[Twilio][message:fallback] messageSid=${req.body?.MessageSid || "-"} from=${req.body?.From || "-"}`);
      res.type("text/xml");
      return res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Message>${message}</Message></Response>`);
    } catch (err) {
      return next(err);
    }
  },

  // POST /api/twilio/message/status-callback
  // Delivery status callback for outbound SMS/MMS.
  async messageStatusCallback(req, res, next) {
    try {
      const messageSid = String(req.body?.MessageSid || req.body?.SmsSid || "").trim();
      const messageStatus = String(req.body?.MessageStatus || req.body?.SmsStatus || "unknown").trim();
      const errorCode = String(req.body?.ErrorCode || "").trim() || "-";
      const to = req.body?.To || "-";
      const from = req.body?.From || "-";

      // eslint-disable-next-line no-console
      console.log(
        `[Twilio][message:status] messageSid=${messageSid || "-"} status=${messageStatus} errorCode=${errorCode} from=${from} to=${to}`
      );
      return res.sendStatus(200);
    } catch (err) {
      return next(err);
    }
  },

  async startCallSession(req, res, next) {
    try {
      const providedIdentity = normalizeIdentity(req.body?.identity || req.query?.identity);
      const identity = providedIdentity || createRandomIdentity("patient");
      const clinicId = Number(req.body?.clinicId || req.query?.clinicId || 0);
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

      if (!Number.isFinite(clinicId) || clinicId <= 0) {
        return res.status(400).json({ error: "clinicId is required." });
      }
      if (!doctorPhoneNumber || !patientPhoneNumber) {
        return res.status(400).json({
          error: "doctor and patient phone numbers are required."
        });
      }

      const callbackUrl = process.env.TWILIO_CALL_CALLBACK_URL || `${getServerUrl(req)}/api/twilio/call-status`;

      const call = await initiateCall({
        toPhoneNumber: doctorPhoneNumber,
        patientPhoneNumber,
        callbackUrl: callbackUrl,
        clinicId
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
      const callDuration = Number(req.body?.CallDuration || 0);
      let clinicTwilio = null;
      try {
        clinicTwilio = await getClinicTwilioConfigByPhoneNumber(req.body?.To || "");
      } catch {
        clinicTwilio = null;
      }
      trackCallStatus({
        callSid,
        statusCallbackEvent,
        callStatus,
        identity,
        clinicId: clinicTwilio?.clinicId || null,
        twilioPhoneNumber: clinicTwilio?.twilioPhoneNumber || null
      });
      const lifecycle = mapLifecycleEvent(callStatus || statusCallbackEvent);

      // Persist inbound call status and duration when available.
      if (callSid) {
        const persistedCall = await findOrCreateCallBySid({
          callSid,
          from: req.body?.From || req.body?.Caller || "unknown",
          status: String(callStatus || statusCallbackEvent || "").toLowerCase() || null
        });
        if (persistedCall) {
          const normalizedStatus = String(callStatus || statusCallbackEvent || "").toLowerCase();
          const isCompleted = normalizedStatus === "completed";

          const updates = {
            status: normalizedStatus || persistedCall.status
          };

          const finalSeconds = computeFinalCallSeconds({
            callDurationFromTwilio: callDuration,
            isCompleted,
            callRow: persistedCall
          });
          if (finalSeconds !== null) {
            updates.seconds = finalSeconds;
            if (!(Number.isFinite(callDuration) && callDuration > 0)) {
              // eslint-disable-next-line no-console
              console.log(
                `[Twilio][call-status] callSid=${callSid} CallDuration absent — estimated ${finalSeconds}s from createdAt`
              );
            }
          }

          await persistedCall.update(updates);
        }
      }

      // eslint-disable-next-line no-console
      console.log(
        `[Twilio][event:${lifecycle}] callSid=${callSid || "-"} status=${String(callStatus || statusCallbackEvent || "-")} duration=${Number.isFinite(callDuration) ? callDuration : "-"} from=${req.body?.From || "-"} to=${req.body?.To || "-"} direction=${req.body?.Direction || "-"} parentCallSid=${req.body?.ParentCallSid || "-"} errorCode=${req.body?.ErrorCode || "-"}`
      );

      return res.sendStatus(200);
    } catch (err) {
      return next(err);
    }
  },
  async stopCall(req, res, next) {
    try {
      const callSid = String(req.body?.callSid || "").trim();
      const clinicId = Number(req.body?.clinicId || req.query?.clinicId || 0);
      if (!callSid) return res.status(400).json({ error: "callSid required." });
      if (!Number.isFinite(clinicId) || clinicId <= 0) return res.status(400).json({ error: "clinicId required." });
      const ended = await endCall(callSid, { clinicId });
      // eslint-disable-next-line no-console
      console.log(`[Twilio][stop] callSid=${ended.callSid} status=${ended.status}`);
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
      // eslint-disable-next-line no-console
      console.log(`[Twilio][mute] callSid=${session.callSid} isMuted=${session.isMuted}`);
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

  // GET /api/twilio/voice/tts/:token
  // Twilio <Play> fetches this URL (short-lived ElevenLabs MP3).
  async ttsPlaybackAudio(req, res) {
    const buf = getTtsPlaybackBuffer(req.params.token);
    if (!buf) return res.sendStatus(404);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    return res.send(buf);
  },

  // GET /api/twilio/voice/wait-tone.wav
  // Serves the pre-built gentle 440 Hz wait tone so Twilio <Play> can loop it
  // while the background LLM + ElevenLabs job is running.
  waitToneAudio(req, res) {
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(WAIT_TONE_WAV);
  }
};
