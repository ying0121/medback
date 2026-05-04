const crypto = require("crypto");
const twilio = require("twilio");
const axios = require("axios");
const {
  initiateCall,
  endCall,
  startCallRecording,
  trackCallStatus,
  setCallMuted,
  generateAccessToken,
  buildOutboundDialTwiml,
  isE164
} = require("../services/twilioService");
const {
  generateAssistantReply,
  generateInboundMergedTurn,
  detectInboundSpeechLanguage,
  generateSpeechFromText
} = require("../services/openaiService");
const { Call, IncomingMessage, Clinic } = require("../db");
const { textToSpeechMp3 } = require("../services/elevenlabsService");

/** Per-call OpenAI chat history for inbound PSTN → voice bot (in-memory). */
const inboundVoiceSessions = new Map();
const INBOUND_SESSION_TTL_MS = 35 * 60 * 1000;
const INBOUND_MAX_MESSAGES = 24;

/** Short-lived MP3 blobs for Twilio <Play> (ElevenLabs TTS). */
const ttsPlaybackCache = new Map();

function pruneTtsPlaybackCache() {
  const now = Date.now();
  for (const [k, v] of ttsPlaybackCache.entries()) {
    if (v.expiresAt < now) ttsPlaybackCache.delete(k);
  }
}

function registerTtsPlayback(mp3Buffer) {
  pruneTtsPlaybackCache();
  const token = crypto.randomBytes(32).toString("hex");
  ttsPlaybackCache.set(token, {
    buffer: mp3Buffer,
    expiresAt: Date.now() + 12 * 60 * 1000
  });
  return token;
}

function getTtsPlaybackBuffer(token) {
  const key = String(token || "");
  const v = ttsPlaybackCache.get(key);
  if (!v) return null;
  if (v.expiresAt < Date.now()) {
    ttsPlaybackCache.delete(key);
    return null;
  }
  return v.buffer;
}

function normalizePhoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

async function resolveClinicForInboundTo(toValue) {
  const toDigits = normalizePhoneDigits(toValue);
  if (!toDigits) return null;

  const forcedId = Number(process.env.TWILIO_INBOUND_CLINIC_DB_ID || "");
  if (Number.isFinite(forcedId) && forcedId > 0) {
    const c = await Clinic.findByPk(forcedId);
    if (c) return c;
  }

  const clinics = await Clinic.findAll({
    attributes: ["id", "phone", "elevenlabsApiKey", "elevenlabsVoiceId"]
  });
  for (const c of clinics) {
    const p = normalizePhoneDigits(c.phone);
    if (!p) continue;
    if (toDigits === p) return c;
    if (p.length >= 10 && toDigits.length >= 10) {
      if (toDigits.slice(-10) === p.slice(-10)) return c;
    }
  }
  return null;
}

async function loadClinicElevenLabsTts(clinicDbId) {
  if (!clinicDbId) return null;
  const c = await Clinic.findByPk(clinicDbId, {
    attributes: ["id", "elevenlabsApiKey", "elevenlabsVoiceId"]
  });
  if (!c?.elevenlabsApiKey || !c?.elevenlabsVoiceId) return null;
  return { apiKey: c.elevenlabsApiKey, voiceId: c.elevenlabsVoiceId };
}

/**
 * Speaks text on the call using ElevenLabs MP3 + <Play> when the clinic is configured;
 * otherwise falls back to Twilio <Say>.
 * @returns {Promise<Buffer|null>} MP3 buffer when ElevenLabs was used, else null.
 */
async function twimlPlayElevenLabsOrSay(vr, req, session, callSid, text) {
  const cfg = await loadClinicElevenLabsTts(session?.inboundClinicDbId);
  const spoken = truncateForPhoneSay(text, 2500);
  if (!cfg) {
    vr.say(sayParamsForInbound(session), spoken);
    return null;
  }
  try {
    const inboundElModel =
      String(process.env.ELEVENLABS_INBOUND_TTS_MODEL || process.env.ELEVENLABS_TTS_MODEL || "").trim() ||
      "eleven_turbo_v2_5";
    const mp3 = await textToSpeechMp3(cfg.apiKey, cfg.voiceId, spoken, { modelId: inboundElModel });
    const token = registerTtsPlayback(mp3);
    const url = `${getServerUrl(req)}/api/twilio/voice/tts/${token}`;
    vr.play(url);
    return mp3;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Twilio][elevenlabs] TTS failed callSid=${callSid}: ${err.message}`);
    vr.say(sayParamsForInbound(session), spoken);
    return null;
  }
}

function getInboundVoiceSession(callSid) {
  const now = Date.now();
  let s = inboundVoiceSessions.get(callSid);
  if (!s || s.expiresAt < now) {
    s = {
      messages: [],
      expiresAt: now + INBOUND_SESSION_TTL_MS,
      speechBcp47:
        String(process.env.TWILIO_INBOUND_INITIAL_SPEECH_LANGUAGE || "").trim() || "en-US",
      sayVoiceName:
        String(process.env.TWILIO_INBOUND_DEFAULT_SAY_VOICE || "").trim() || "Polly.Joanna-Neural",
      recordingStarted: false,
      inboundClinicDbId: null,
      inboundAwaitingReply: false
    };
    inboundVoiceSessions.set(callSid, s);
  }
  s.expiresAt = now + INBOUND_SESSION_TTL_MS;
  if (s.inboundClinicDbId === undefined) s.inboundClinicDbId = null;
  if (s.inboundAwaitingReply === undefined) s.inboundAwaitingReply = false;
  return s;
}

function pushInboundVoiceMessage(callSid, role, content) {
  const s = getInboundVoiceSession(callSid);
  s.messages.push({ role, content });
  if (s.messages.length > INBOUND_MAX_MESSAGES) {
    s.messages.splice(0, s.messages.length - INBOUND_MAX_MESSAGES);
  }
}

function sayVoice() {
  return process.env.TWILIO_SAY_VOICE || "alice";
}

/** Twilio <Say> options: Polly/Google voices need language for multilingual TTS. */
function sayParamsForInbound(session) {
  const voice = session?.sayVoiceName || "Polly.Joanna-Neural";
  const v = String(voice).toLowerCase();
  const opts = { voice };
  if (v.startsWith("polly.") || v.startsWith("google.")) {
    opts.language = session?.speechBcp47 || "en-US";
  }
  return opts;
}

function gatherOptsInbound(session, gatherUrl) {
  const opts = {
    input: "speech",
    action: gatherUrl,
    method: "POST",
    speechTimeout: process.env.TWILIO_INBOUND_SPEECH_TIMEOUT || "auto",
    language: session?.speechBcp47 || "en-US",
    speechModel: process.env.TWILIO_INBOUND_SPEECH_MODEL || "phone_call",
    profanityFilter: "false"
  };
  const hints = String(process.env.TWILIO_INBOUND_SPEECH_HINTS || "").trim();
  if (hints) opts.hints = hints;
  return opts;
}

function truncateForPhoneSay(text, maxChars) {
  const s = String(text || "").trim();
  if (!s) return "I could not generate a reply.";
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 3))}...`;
}

function normalizePhoneForCallRow(fromValue) {
  const raw = String(fromValue || "").trim();
  if (!raw) return "unknown";
  // Twilio client identity (browser) comes as "client:xxx". Keep only caller id.
  if (raw.startsWith("client:")) return raw.slice(7) || "unknown";
  return raw;
}

async function findOrCreateCallBySid({ callSid, from, status = null }) {
  if (!callSid) return null;
  let call = await Call.findOne({ where: { callSid } });
  if (!call) {
    call = await Call.create({
      callSid,
      phone: normalizePhoneForCallRow(from),
      seconds: 0,
      status: status || null
    });
  }
  return call;
}

async function saveIncomingMessageRow({
  callId,
  audio = null,
  transcription = null,
  userType,
  status = "success"
}) {
  if (!callId) return null;
  return IncomingMessage.create({
    callId,
    audio,
    transcription,
    userType,
    status
  });
}

/** Run after TwiML is sent so Twilio is not blocked on DB writes. */
function flushInboundPersistQueue(queue) {
  if (!queue || queue.length === 0) return;
  const tasks = queue.splice(0, queue.length);
  setImmediate(() => {
    (async () => {
      for (const fn of tasks) {
        try {
          await fn();
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error(`[Twilio][inbound] deferred persist failed: ${e.message}`);
        }
      }
    })();
  });
}

function useInboundWaitBeforeReply() {
  return String(process.env.TWILIO_INBOUND_WAIT_BEFORE_REPLY || "true").toLowerCase() !== "false";
}

function getInboundWaitAudioUrl() {
  return String(process.env.TWILIO_INBOUND_WAIT_AUDIO_URL || "").trim();
}

function getInboundWaitPlayLoopCount() {
  const n = Number(process.env.TWILIO_INBOUND_WAIT_AUDIO_LOOPS || 2);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(20, Math.floor(n));
}

/**
 * LLM + assistant TTS + next Gather + closing line (shared by gather and inbound-reply).
 */
async function runInboundAssistantTwiMl({
  vr,
  req,
  session,
  callSid,
  call,
  persistQueue,
  maxReplyChars,
  gatherUrl,
  useMerged,
  inboundModel,
  inboundMaxTokens
}) {
  const last = session.messages[session.messages.length - 1];
  const speechResult = last?.role === "user" ? String(last.content || "").trim() : "";

  let spoken = "";

  if (useMerged) {
    try {
      const merged = await generateInboundMergedTurn(session.messages, {});
      session.speechBcp47 = merged.twilio_bcp47;
      session.sayVoiceName = merged.twilio_voice;
      spoken = truncateForPhoneSay(merged.reply, maxReplyChars);
    } catch (mergeErr) {
      // eslint-disable-next-line no-console
      console.error(`[Twilio][inbound] merged LLM failed, using two-step: ${mergeErr.message}`);
      const detected = await detectInboundSpeechLanguage(speechResult);
      session.speechBcp47 = detected.twilio_bcp47;
      session.sayVoiceName = detected.twilio_voice;
      const languageConstraint = [
        `The caller is speaking ${detected.english_name} (BCP-47 ${detected.twilio_bcp47}, ISO ${detected.iso_639_1}).`,
        "You MUST answer ONLY in that same language.",
        "Use natural wording and the appropriate writing system for speech (no unnecessary English)."
      ].join(" ");
      const reply = await generateAssistantReply(session.messages, {
        languageConstraint,
        ...(inboundModel ? { model: inboundModel } : {}),
        maxCompletionTokens: inboundMaxTokens
      });
      spoken = truncateForPhoneSay(reply, maxReplyChars);
    }
  } else {
    const detected = await detectInboundSpeechLanguage(speechResult);
    session.speechBcp47 = detected.twilio_bcp47;
    session.sayVoiceName = detected.twilio_voice;
    const languageConstraint = [
      `The caller is speaking ${detected.english_name} (BCP-47 ${detected.twilio_bcp47}, ISO ${detected.iso_639_1}).`,
      "You MUST answer ONLY in that same language.",
      "Use natural wording and the appropriate writing system for speech (no unnecessary English)."
    ].join(" ");
    const reply = await generateAssistantReply(session.messages, {
      languageConstraint,
      ...(inboundModel ? { model: inboundModel } : {}),
      maxCompletionTokens: inboundMaxTokens
    });
    spoken = truncateForPhoneSay(reply, maxReplyChars);
  }

  pushInboundVoiceMessage(callSid, "assistant", spoken);
  let botAudioBase64 = null;
  const mp3Buf = await twimlPlayElevenLabsOrSay(vr, req, session, callSid, spoken);
  if (mp3Buf) {
    botAudioBase64 = mp3Buf.toString("base64");
  } else {
    try {
      const botSpeech = await generateSpeechFromText({ text: spoken });
      botAudioBase64 = botSpeech.audioBase64 || null;
    } catch (audioErr) {
      // eslint-disable-next-line no-console
      console.error(`[Twilio][inbound] bot audio generation failed: ${audioErr.message}`);
    }
  }
  // eslint-disable-next-line no-console
  console.log(
    `[Twilio][inbound] callSid=${callSid} lang=${session.speechBcp47} merged=${useMerged} userLen=${speechResult.length} replyLen=${spoken.length}`
  );
  if (call) {
    persistQueue.push(() =>
      saveIncomingMessageRow({
        callId: call.id,
        audio: botAudioBase64,
        transcription: spoken,
        userType: "bot",
        status: botAudioBase64 ? "success" : "success-no-audio"
      })
    );
  }

  vr.gather(gatherOptsInbound(session, gatherUrl));
  await twimlPlayElevenLabsOrSay(vr, req, session, callSid, "Thank you for calling. Goodbye.");
  vr.hangup();
}

async function fetchRecordingBase64(recordingUrl) {
  const accountSid = String(process.env.TWILIO_ACCOUNT_SID || "").trim();
  const authToken = String(process.env.TWILIO_AUTH_TOKEN || "").trim();
  if (!recordingUrl || !accountSid || !authToken) return null;
  const mediaUrl = String(recordingUrl).endsWith(".mp3") ? String(recordingUrl) : `${recordingUrl}.mp3`;
  const response = await axios.get(mediaUrl, {
    auth: { username: accountSid, password: authToken },
    responseType: "arraybuffer",
    timeout: 20000
  });
  return Buffer.from(response.data).toString("base64");
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
      const identity = rawIdentity
        ? normalizeIdentity(rawIdentity) || createRandomIdentity("patient")
        : createRandomIdentity("patient");
      const jwt = generateAccessToken(identity);
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
      const twilioNumber = String(process.env.TWILIO_PHONE_NUMBER || "").trim();
      // eslint-disable-next-line no-console
      console.log(`[Twilio][twiml] callerId=${twilioNumber || "MISSING"} dialAction=${dialActionUrl}`);

      const twiml = buildOutboundDialTwiml({ doctorPhoneNumber, dialActionUrl });
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
  // Greets the caller and collects speech; each utterance is sent to OpenAI.
  async inboundVoiceWebhook(req, res) {
    const gatherUrl = `${getServerUrl(req)}/api/twilio/voice/inbound-gather`;
    const greeting =
      process.env.TWILIO_INBOUND_VOICE_GREETING ||
      "Hello. This is our automated assistant. You may speak in any language. After the tone, ask your question.";
    const callSid = String(req.body?.CallSid || "").trim();
    const from = String(req.body?.From || "").trim();
    const session = callSid ? getInboundVoiceSession(callSid) : null;
    try {
      if (callSid) {
        await findOrCreateCallBySid({
          callSid,
          from,
          status: String(req.body?.CallStatus || "in-progress")
        });
        if (session && session.recordingStarted !== true) {
          try {
            const recordingStatusCallback = `${getServerUrl(req)}/api/twilio/voice/recording-status`;
            const recording = await startCallRecording({ callSid, recordingStatusCallback });
            session.recordingStarted = true;
            // eslint-disable-next-line no-console
            console.log(
              `[Twilio][recording:start] callSid=${callSid} recordingSid=${recording.recordingSid} status=${recording.status}`
            );
          } catch (recordErr) {
            // eslint-disable-next-line no-console
            console.error(`[Twilio][recording:start] callSid=${callSid} error=${recordErr.message}`);
          }
        }
      }
      const vr = new twilio.twiml.VoiceResponse();
      if (session) {
        const to = String(req.body?.To || "").trim();
        const clinic = await resolveClinicForInboundTo(to);
        session.inboundClinicDbId = clinic?.id || null;
        await twimlPlayElevenLabsOrSay(vr, req, session, callSid, greeting);
        vr.gather(gatherOptsInbound(session, gatherUrl));
      } else {
        vr.say({ voice: sayVoice() }, greeting);
        vr.gather({
          input: "speech",
          action: gatherUrl,
          method: "POST",
          speechTimeout: process.env.TWILIO_INBOUND_SPEECH_TIMEOUT || "auto",
          language: "en-US",
          speechModel: process.env.TWILIO_INBOUND_SPEECH_MODEL || "phone_call",
          profanityFilter: "false"
        });
      }
      if (session) {
        await twimlPlayElevenLabsOrSay(vr, req, session, callSid, "I did not hear anything. Goodbye.");
      } else {
        vr.say({ voice: sayVoice() }, "I did not hear anything. Goodbye.");
      }
      vr.hangup();
      res.type("text/xml");
      return res.send(vr.toString());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Twilio][inbound] greeting error: ${err.message}`);
      res.type("text/xml");
      return res.send(buildSafeVoiceResponse("Sorry, we could not start the call. Goodbye."));
    }
  },

  // POST /api/twilio/voice/inbound-gather
  // Twilio posts here after speech recognition (Gather input=speech).
  // Latency note: TwiML+Gather is bounded by LLM + full TTS + Twilio fetching <Play> audio. For streaming
  // sub-second audio, Twilio Media Streams (bidirectional WebSocket) would be required — not implemented here.
  async inboundVoiceGather(req, res) {
    const callSid = String(req.body?.CallSid || "").trim();
    const from = String(req.body?.From || "").trim();
    const speechResult = String(req.body?.SpeechResult || "").trim();
    const gatherUrl = `${getServerUrl(req)}/api/twilio/voice/inbound-gather`;
    const maxReplyChars = Number(process.env.TWILIO_INBOUND_MAX_REPLY_CHARS) || 800;

    if (!callSid) {
      res.type("text/xml");
      return res.send(buildSafeVoiceResponse("Goodbye."));
    }

    const session = getInboundVoiceSession(callSid);
    const to = String(req.body?.To || "").trim();
    if (!session.inboundClinicDbId && to) {
      const clinic = await resolveClinicForInboundTo(to);
      session.inboundClinicDbId = clinic?.id || null;
    }

    try {
      const call = await findOrCreateCallBySid({
        callSid,
        from,
        status: String(req.body?.CallStatus || "in-progress")
      });
      const persistQueue = [];
      const vr = new twilio.twiml.VoiceResponse();

      const inboundMaxTokens = Number(process.env.OPENAI_INBOUND_MAX_COMPLETION_TOKENS || 450);
      const inboundModel = String(process.env.OPENAI_INBOUND_MODEL || "").trim() || null;
      const useMerged = String(process.env.TWILIO_INBOUND_MERGED_LLM || "true").toLowerCase() !== "false";

      if (!speechResult) {
        await twimlPlayElevenLabsOrSay(
          vr,
          req,
          session,
          callSid,
          "Sorry, I did not catch that. Please try again."
        );
        if (call) {
          persistQueue.push(() =>
            saveIncomingMessageRow({
              callId: call.id,
              transcription: null,
              userType: "user",
              status: "no-speech-no-audio"
            })
          );
        }
        vr.gather(gatherOptsInbound(session, gatherUrl));
        await twimlPlayElevenLabsOrSay(vr, req, session, callSid, "Thank you for calling. Goodbye.");
        vr.hangup();
      } else {
        if (call) {
          persistQueue.push(() =>
            saveIncomingMessageRow({
              callId: call.id,
              audio: null, // Twilio <Gather input=\"speech\"> does not provide raw caller audio.
              transcription: speechResult,
              userType: "user",
              status: "success-no-audio"
            })
          );
        }

        pushInboundVoiceMessage(callSid, "user", speechResult);

        if (useInboundWaitBeforeReply()) {
          session.inboundAwaitingReply = true;
          const waitUrl = getInboundWaitAudioUrl();
          if (waitUrl.startsWith("http://") || waitUrl.startsWith("https://")) {
            vr.play({ loop: getInboundWaitPlayLoopCount() }, waitUrl);
          } else {
            const waitSay =
              String(process.env.TWILIO_INBOUND_WAIT_SAY_TEXT || "").trim() || "One moment please.";
            vr.say(sayParamsForInbound(session), waitSay);
          }
          const replyUrl = `${getServerUrl(req)}/api/twilio/voice/inbound-reply`;
          vr.redirect({ method: "POST" }, replyUrl);
        } else {
          await runInboundAssistantTwiMl({
            vr,
            req,
            session,
            callSid,
            call,
            persistQueue,
            maxReplyChars,
            gatherUrl,
            useMerged,
            inboundModel,
            inboundMaxTokens
          });
        }
      }

      const xml = vr.toString();
      res.type("text/xml");
      res.send(xml);
      flushInboundPersistQueue(persistQueue);
      return;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Twilio][inbound-gather] error: ${err.message}`);
      res.type("text/xml");
      return res.send(buildSafeVoiceResponse("Sorry, something went wrong. Goodbye."));
    }
  },

  // POST /api/twilio/voice/inbound-reply
  // After wait/hold audio, Twilio follows redirect here to run LLM + TTS (SpeechResult is not re-posted).
  async inboundGatherReply(req, res) {
    const callSid = String(req.body?.CallSid || "").trim();
    const from = String(req.body?.From || "").trim();
    const gatherUrl = `${getServerUrl(req)}/api/twilio/voice/inbound-gather`;
    const maxReplyChars = Number(process.env.TWILIO_INBOUND_MAX_REPLY_CHARS) || 800;

    if (!callSid) {
      res.type("text/xml");
      return res.send(buildSafeVoiceResponse("Goodbye."));
    }

    const session = getInboundVoiceSession(callSid);
    const to = String(req.body?.To || "").trim();
    if (!session.inboundClinicDbId && to) {
      const clinic = await resolveClinicForInboundTo(to);
      session.inboundClinicDbId = clinic?.id || null;
    }

    try {
      if (!session.inboundAwaitingReply) {
        const vr = new twilio.twiml.VoiceResponse();
        vr.gather(gatherOptsInbound(session, gatherUrl));
        await twimlPlayElevenLabsOrSay(vr, req, session, callSid, "Thank you for calling. Goodbye.");
        vr.hangup();
        res.type("text/xml");
        return res.send(vr.toString());
      }
      session.inboundAwaitingReply = false;

      const call = await findOrCreateCallBySid({
        callSid,
        from,
        status: String(req.body?.CallStatus || "in-progress")
      });
      const persistQueue = [];
      const vr = new twilio.twiml.VoiceResponse();
      const inboundMaxTokens = Number(process.env.OPENAI_INBOUND_MAX_COMPLETION_TOKENS || 450);
      const inboundModel = String(process.env.OPENAI_INBOUND_MODEL || "").trim() || null;
      const useMerged = String(process.env.TWILIO_INBOUND_MERGED_LLM || "true").toLowerCase() !== "false";

      const last = session.messages[session.messages.length - 1];
      if (!last || last.role !== "user") {
        res.type("text/xml");
        return res.send(buildSafeVoiceResponse("Sorry, please try again."));
      }

      await runInboundAssistantTwiMl({
        vr,
        req,
        session,
        callSid,
        call,
        persistQueue,
        maxReplyChars,
        gatherUrl,
        useMerged,
        inboundModel,
        inboundMaxTokens
      });

      const xml = vr.toString();
      res.type("text/xml");
      res.send(xml);
      flushInboundPersistQueue(persistQueue);
      return;
    } catch (err) {
      session.inboundAwaitingReply = false;
      // eslint-disable-next-line no-console
      console.error(`[Twilio][inbound-reply] error: ${err.message}`);
      res.type("text/xml");
      return res.send(buildSafeVoiceResponse("Sorry, something went wrong. Goodbye."));
    }
  },

  // POST /api/twilio/voice/recording-status
  // Twilio recording callback for inbound calls; persists caller audio as base64.
  async inboundVoiceRecordingStatus(req, res, next) {
    try {
      const callSid = String(req.body?.CallSid || "").trim();
      const recordingSid = String(req.body?.RecordingSid || "").trim();
      const recordingUrl = String(req.body?.RecordingUrl || "").trim();
      const recordingStatus = String(req.body?.RecordingStatus || "").trim().toLowerCase();
      const recordingDuration = Number(req.body?.RecordingDuration || 0);
      const from = String(req.body?.From || "").trim();

      // eslint-disable-next-line no-console
      console.log(
        `[Twilio][recording:status] callSid=${callSid || "-"} recordingSid=${recordingSid || "-"} status=${recordingStatus || "-"} duration=${Number.isFinite(recordingDuration) ? recordingDuration : "-"}s`
      );

      if (!callSid || !recordingSid) return res.sendStatus(200);

      const call = await findOrCreateCallBySid({
        callSid,
        from,
        status: recordingStatus || null
      });
      if (!call) return res.sendStatus(200);

      const existing = await IncomingMessage.findOne({
        where: {
          callId: call.id,
          userType: "user",
          status: `recording-${recordingSid}`
        }
      });
      if (existing) return res.sendStatus(200);

      let audioBase64 = null;
      if (recordingStatus === "completed" && recordingUrl) {
        try {
          audioBase64 = await fetchRecordingBase64(recordingUrl);
        } catch (downloadErr) {
          // eslint-disable-next-line no-console
          console.error(`[Twilio][recording:download] sid=${recordingSid} error=${downloadErr.message}`);
        }
      }

      await saveIncomingMessageRow({
        callId: call.id,
        audio: audioBase64,
        transcription: `Twilio recording ${recordingSid}${Number.isFinite(recordingDuration) ? ` (${recordingDuration}s)` : ""}`,
        userType: "user",
        status: `recording-${recordingSid}`
      });

      if (Number.isFinite(recordingDuration) && recordingDuration >= 0) {
        await call.update({
          seconds: recordingDuration > Number(call.seconds || 0) ? recordingDuration : Number(call.seconds || 0)
        });
      }

      return res.sendStatus(200);
    } catch (err) {
      return next(err);
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

  // POST /api/twilio/voice/fallback
  // Fallback webhook when Twilio cannot execute the primary Voice URL.
  async voiceFallbackTwiml(req, res, next) {
    try {
      const message = escapeForXml(
        process.env.TWILIO_VOICE_FALLBACK_MESSAGE || "We are unable to connect your call right now. Please try again later."
      );
      // eslint-disable-next-line no-console
      console.log(`[Twilio][voice:fallback] callSid=${req.body?.CallSid || "-"} from=${req.body?.From || "-"}`);
      res.type("text/xml");
      return res.send(
        `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="alice">${message}</Say><Hangup/></Response>`
      );
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

      const callbackUrl = process.env.TWILIO_CALL_CALLBACK_URL || `${getServerUrl(req)}/api/twilio/call-status`;

      const call = await initiateCall({
        toPhoneNumber: doctorPhoneNumber,
        patientPhoneNumber,
        callbackUrl: callbackUrl
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
      trackCallStatus({ callSid, statusCallbackEvent, callStatus, identity });
      const lifecycle = mapLifecycleEvent(callStatus || statusCallbackEvent);

      // Persist inbound call status and duration when available.
      if (callSid) {
        const persistedCall = await findOrCreateCallBySid({
          callSid,
          from: req.body?.From || req.body?.Caller || "unknown",
          status: String(callStatus || statusCallbackEvent || "").toLowerCase() || null
        });
        if (persistedCall) {
          const updates = {
            status: String(callStatus || statusCallbackEvent || "").toLowerCase() || persistedCall.status
          };
          if (Number.isFinite(callDuration) && callDuration >= 0) {
            updates.seconds = callDuration;
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
      if (!callSid) return res.status(400).json({ error: "callSid required." });
      const ended = await endCall(callSid);
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
  }
};
