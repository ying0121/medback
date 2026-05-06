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
  isE164,
  getClinicTwilioConfigByPhoneNumber,
  getClinicTwilioConfigByClinicId
} = require("../services/twilioService");
const {
  generateAssistantReply,
  generateInboundMergedTurn,
  detectInboundSpeechLanguage,
  generateSpeechFromText
} = require("../services/openaiService");
const { Call, IncomingMessage, Clinic, Knowledge } = require("../db");
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

/**
 * Inbound PSTN only: ElevenLabs credentials from env (no clinic / DB lookup).
 */
async function loadInboundElevenLabsTts() {
  const apiKey = String(process.env.SYSTEM_ELEVEN_LABS_API_KEY || "").trim();
  const voiceId = String(process.env.SYSTEM_ELEVEN_LABS_VOICE_ID || "").trim();
  if (!apiKey || !voiceId) return null;
  return { apiKey, voiceId };
}

/** In-memory session shape for <Say> fallback params when no full gather session exists. */
function minimalInboundSessionForEl(overrides = {}) {
  return {
    speechBcp47: String(process.env.TWILIO_INBOUND_INITIAL_SPEECH_LANGUAGE || "").trim() || "en-US",
    sayVoiceName: String(process.env.TWILIO_INBOUND_DEFAULT_SAY_VOICE || "").trim() || "Polly.Joanna-Neural",
    ...overrides
  };
}

/**
 * Speaks text on the call using ElevenLabs MP3 + <Play> when SYSTEM_ELEVEN_LABS_API_KEY
 * and SYSTEM_ELEVEN_LABS_VOICE_ID are set; otherwise falls back to Twilio <Say>.
 * @returns {Promise<Buffer|null>} MP3 buffer when ElevenLabs was used, else null.
 */
async function twimlPlayElevenLabsOrSay(vr, req, session, callSid, text) {
  const saySession = session || minimalInboundSessionForEl();
  const cfg = await loadInboundElevenLabsTts();
  const spoken = truncateForPhoneSay(text, 2500);
  if (!cfg) {
    vr.say(sayParamsForInbound(saySession), spoken);
    return null;
  }
  try {
    const inboundElModel = String(process.env.ELEVENLABS_INBOUND_TTS_MODEL || process.env.ELEVENLABS_TTS_MODEL || "").trim() || "eleven_turbo_v2_5";
    const mp3 = await textToSpeechMp3(cfg.apiKey, cfg.voiceId, spoken, { modelId: inboundElModel });
    const token = registerTtsPlayback(mp3);
    const url = `${getServerUrl(req)}/api/twilio/voice/tts/${token}`;
    vr.play(url);
    return mp3;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Twilio][elevenlabs] TTS failed callSid=${callSid}: ${err.message}`);
    vr.say(sayParamsForInbound(saySession), spoken);
    return null;
  }
}

/** Inbound-only: speak message + Hangup using EL when system env credentials are set (else <Say>). */
async function buildInboundErrorTwimlXml(req, message, { callSid = "" } = {}) {
  const sid = String(callSid || "").trim();
  const sessionForSay = minimalInboundSessionForEl();
  const vr = new twilio.twiml.VoiceResponse();
  await twimlPlayElevenLabsOrSay(vr, req, sessionForSay, sid || "-", message);
  vr.hangup();
  return vr.toString();
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
      inboundAwaitingReply: false
    };
    inboundVoiceSessions.set(callSid, s);
  }
  s.expiresAt = now + INBOUND_SESSION_TTL_MS;
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

async function buildInboundClinicContextBySystemClinicId(systemClinicId) {
  const id = Number(systemClinicId);
  if (!Number.isFinite(id) || id <= 0) return { clinicPrompt: null, knowledgePrompt: null };

  const clinic = await Clinic.findByPk(id);
  if (!clinic) return { clinicPrompt: null, knowledgePrompt: null };

  const clinicBusinessId = Number(clinic.clinicId);
  const knowledgeRows = Number.isFinite(clinicBusinessId) && clinicBusinessId > 0
    ? await Knowledge.findAll({
        where: { clinicId: clinicBusinessId, status: "active" },
        order: [["id", "DESC"]]
      })
    : [];

  const clinicPrompt = [
    "Clinic Information (But do not share any contact information including clinic id, phone, fax or tel number, email, address, web and portal URL):",
    `- Clinic ID: ${clinic.clinicId || clinic.id}`,
    `- Name: ${clinic.name || ""}`,
    `- Acronym: ${clinic.acronym || ""}`,
    `- Address: ${[clinic.address1, clinic.address2, clinic.city, clinic.state, clinic.zip].filter(Boolean).join(", ")}`,
    `- Phone: ${clinic.phone || ""}`,
    `- Email: ${clinic.email || ""}`,
    `- Web: ${clinic.web || ""}`,
    `- Portal: ${clinic.portal || ""}`
  ].join("\n");

  const knowledgeText = knowledgeRows
    .map((row, idx) => `${idx + 1}. ${String(row.knowledge || "").trim()}`)
    .filter(Boolean)
    .join("\n");
  const knowledgePrompt = knowledgeText ? `Product Knowledge:\n${knowledgeText}` : null;

  return { clinicPrompt, knowledgePrompt };
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
  const n = Number(process.env.TWILIO_INBOUND_WAIT_AUDIO_LOOPS || 4);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(20, Math.floor(n));
}

function getInboundWaitSfxUrl() {
  return String(process.env.TWILIO_INBOUND_WAIT_SFX_URL || "").trim();
}

function getInboundWaitSfxLoopCount() {
  const n = Number(process.env.TWILIO_INBOUND_WAIT_SFX_LOOPS || 15);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(1000, Math.floor(n));
}

function isHttpsOrHttpUrl(value) {
  const s = String(value || "").trim();
  return s.startsWith("https://") || s.startsWith("http://");
}

/** callSid → Promise of buildInboundAssistantAudioResult (LLM+TTS) started while Twilio plays wait audio. */
const inboundAssistantJobs = new Map();

async function synthesizeInboundAssistantMp3(session, callSid, spoken) {
  const cfg = await loadInboundElevenLabsTts();
  if (!cfg) return { mp3Buf: null, ttsToken: null };
  const text = truncateForPhoneSay(spoken, 2500);
  try {
    const inboundElModel =
      String(process.env.ELEVENLABS_INBOUND_TTS_MODEL || process.env.ELEVENLABS_TTS_MODEL || "").trim() ||
      "eleven_turbo_v2_5";
    const mp3 = await textToSpeechMp3(cfg.apiKey, cfg.voiceId, text, { modelId: inboundElModel });
    const ttsToken = registerTtsPlayback(mp3);
    return { mp3Buf: mp3, ttsToken };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[Twilio][inbound] ElevenLabs TTS failed callSid=${callSid}: ${err.message}`);
    return { mp3Buf: null, ttsToken: null };
  }
}

/**
 * LLM + TTS only (no TwiML). Used on the reply webhook and optionally started in parallel during wait audio.
 * @returns {Promise<{ spoken: string, ttsToken: string|null, mp3Buf: Buffer|null, botAudioBase64: string|null } | { error: string }>}
 */
async function buildInboundAssistantAudioResult({
  session,
  callSid,
  maxReplyChars,
  useMerged,
  inboundModel,
  inboundMaxTokens
}) {
  const last = session.messages[session.messages.length - 1];
  const speechResult = last?.role === "user" ? String(last.content || "").trim() : "";
  if (!speechResult) {
    return { error: "no_user_message" };
  }

  let spoken = "";

  try {
    if (useMerged) {
      try {
        const contextOpts = {
          clinicPrompt: session.clinicPrompt || null,
          knowledgePrompt: session.knowledgePrompt || null
        };
        const merged = await generateInboundMergedTurn(session.messages, contextOpts);
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
          clinicPrompt: session.clinicPrompt || null,
          knowledgePrompt: session.knowledgePrompt || null,
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
        clinicPrompt: session.clinicPrompt || null,
        knowledgePrompt: session.knowledgePrompt || null,
        languageConstraint,
        ...(inboundModel ? { model: inboundModel } : {}),
        maxCompletionTokens: inboundMaxTokens
      });
      spoken = truncateForPhoneSay(reply, maxReplyChars);
    }

    pushInboundVoiceMessage(callSid, "assistant", spoken);
    const { mp3Buf, ttsToken } = await synthesizeInboundAssistantMp3(session, callSid, spoken);
    let botAudioBase64 = null;
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
    return { spoken, ttsToken, mp3Buf, botAudioBase64 };
  } catch (e) {
    return { error: e.message || String(e) };
  }
}

function startInboundAssistantBackgroundJob({
  callSid,
  session,
  maxReplyChars,
  useMerged,
  inboundModel,
  inboundMaxTokens
}) {
  const p = buildInboundAssistantAudioResult({
    session,
    callSid,
    maxReplyChars,
    useMerged,
    inboundModel,
    inboundMaxTokens
  });
  inboundAssistantJobs.set(callSid, p);
  return p;
}

async function finalizeInboundAssistantTwiml({
  vr,
  req,
  session,
  callSid,
  call,
  persistQueue,
  gatherUrl,
  result
}) {
  if (result.error) {
    // eslint-disable-next-line no-console
    console.error(`[Twilio][inbound] assistant pipeline error: ${result.error}`);
    await twimlPlayElevenLabsOrSay(
      vr,
      req,
      session,
      callSid,
      "Sorry, I could not complete that. Please try again."
    );
    vr.gather(gatherOptsInbound(session, gatherUrl));
    await twimlPlayElevenLabsOrSay(vr, req, session, callSid, "Thank you for calling. Goodbye.");
    vr.hangup();
    return;
  }

  const { spoken, ttsToken, botAudioBase64 } = result;
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

  if (ttsToken) {
    vr.play(`${getServerUrl(req)}/api/twilio/voice/tts/${ttsToken}`);
  } else {
    await twimlPlayElevenLabsOrSay(vr, req, session, callSid, spoken);
  }
  vr.gather(gatherOptsInbound(session, gatherUrl));
  await twimlPlayElevenLabsOrSay(vr, req, session, callSid, "Thank you for calling. Goodbye.");
  vr.hangup();
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
  const result = await buildInboundAssistantAudioResult({
    session,
    callSid,
    maxReplyChars,
    useMerged,
    inboundModel,
    inboundMaxTokens
  });
  await finalizeInboundAssistantTwiml({
    vr,
    req,
    session,
    callSid,
    call,
    persistQueue,
    gatherUrl,
    result
  });
}

async function fetchRecordingBase64(recordingUrl, { accountSid, authToken }) {
  const sid = String(accountSid || "").trim();
  const token = String(authToken || "").trim();
  if (!recordingUrl || !sid || !token) return null;
  const mediaUrl = String(recordingUrl).endsWith(".mp3") ? String(recordingUrl) : `${recordingUrl}.mp3`;
  const response = await axios.get(mediaUrl, {
    auth: { username: sid, password: token },
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
  // Greets the caller and collects speech; each utterance is sent to OpenAI.
  async inboundVoiceWebhook(req, res) {
    const gatherUrl = `${getServerUrl(req)}/api/twilio/voice/inbound-gather`;
    const greeting = process.env.TWILIO_INBOUND_VOICE_GREETING || "Hello. This is our automated assistant. You may speak in any language. Please ask me your question.";
    const callSid = String(req.body?.CallSid || "").trim();
    const from = String(req.body?.From || "").trim();
    const to = String(req.body?.To || "").trim();
    const session = callSid ? getInboundVoiceSession(callSid) : null;
    try {
      const clinicTwilio = await getClinicTwilioConfigByPhoneNumber(to);
      const inboundContext = await buildInboundClinicContextBySystemClinicId(clinicTwilio.clinicId);
      if (callSid) {
        if (session) {
          session.clinicId = clinicTwilio.clinicId;
          session.clinicPrompt = inboundContext.clinicPrompt;
          session.knowledgePrompt = inboundContext.knowledgePrompt;
        }
        await findOrCreateCallBySid({
          callSid,
          from,
          status: String(req.body?.CallStatus || "in-progress")
        });
        if (session && session.recordingStarted !== true) {
          try {
            const recordingStatusCallback = `${getServerUrl(req)}/api/twilio/voice/recording-status`;
            const recording = await startCallRecording({
              callSid,
              recordingStatusCallback,
              clinicId: clinicTwilio.clinicId
            });
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
      const sessionForTts = session || minimalInboundSessionForEl();
      await twimlPlayElevenLabsOrSay(vr, req, sessionForTts, callSid || "-", greeting);
      const gatherConfig = session
        ? gatherOptsInbound(session, gatherUrl)
        : {
            input: "speech",
            action: gatherUrl,
            method: "POST",
            speechTimeout: process.env.TWILIO_INBOUND_SPEECH_TIMEOUT || "auto",
            language: String(process.env.TWILIO_INBOUND_INITIAL_SPEECH_LANGUAGE || "").trim() || "en-US",
            speechModel: process.env.TWILIO_INBOUND_SPEECH_MODEL || "phone_call",
            profanityFilter: "false"
          };
      vr.gather(gatherConfig);
      await twimlPlayElevenLabsOrSay(
        vr,
        req,
        sessionForTts,
        callSid || "-",
        "I did not hear anything. Goodbye."
      );
      vr.hangup();
      res.type("text/xml");
      return res.send(vr.toString());
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[Twilio][inbound] greeting error: ${err.message}`);
      res.type("text/xml");
      const xml = await buildInboundErrorTwimlXml(req, "Sorry, we could not start the call. Goodbye.", {
        callSid
      });
      return res.send(xml);
    }
  },

  // POST /api/twilio/voice/inbound-gather
  // Twilio posts here after speech recognition (Gather input=speech).
  // When wait-before-reply is on, LLM+TTS starts in parallel with spoken cue + optional SFX <Play> loops, then redirect.
  async inboundVoiceGather(req, res) {
    const callSid = String(req.body?.CallSid || "").trim();
    const from = String(req.body?.From || "").trim();
    const to = String(req.body?.To || "").trim();
    const speechResult = String(req.body?.SpeechResult || "").trim();
    const gatherUrl = `${getServerUrl(req)}/api/twilio/voice/inbound-gather`;
    const maxReplyChars = Number(process.env.TWILIO_INBOUND_MAX_REPLY_CHARS) || 800;

    if (!callSid) {
      res.type("text/xml");
      const xml = await buildInboundErrorTwimlXml(req, "Goodbye.");
      return res.send(xml);
    }

    const session = getInboundVoiceSession(callSid);

    try {
      if (!session.clinicPrompt || !session.knowledgePrompt) {
        try {
          const clinicTwilio = await getClinicTwilioConfigByPhoneNumber(to);
          session.clinicId = clinicTwilio.clinicId;
          const inboundContext = await buildInboundClinicContextBySystemClinicId(clinicTwilio.clinicId);
          session.clinicPrompt = inboundContext.clinicPrompt;
          session.knowledgePrompt = inboundContext.knowledgePrompt;
        } catch {
          /* continue without clinic context */
        }
      }
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
          startInboundAssistantBackgroundJob({
            callSid,
            session,
            maxReplyChars,
            useMerged,
            inboundModel,
            inboundMaxTokens
          });
          const waitSay =
            String(process.env.TWILIO_INBOUND_WAIT_SAY_TEXT || "").trim() || "One moment please.";
          await twimlPlayElevenLabsOrSay(vr, req, session, callSid, waitSay);
          const sfxUrl = getInboundWaitSfxUrl();
          const holdUrl = getInboundWaitAudioUrl();
          if (isHttpsOrHttpUrl(sfxUrl)) {
            vr.play({ loop: getInboundWaitSfxLoopCount() }, sfxUrl);
          } else if (isHttpsOrHttpUrl(holdUrl)) {
            vr.play({ loop: getInboundWaitPlayLoopCount() }, holdUrl);
          } else {
            vr.pause({ length: 2 });
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
      inboundAssistantJobs.delete(callSid);
      // eslint-disable-next-line no-console
      console.error(`[Twilio][inbound-gather] error: ${err.message}`);
      res.type("text/xml");
      const xml = await buildInboundErrorTwimlXml(req, "Sorry, something went wrong. Goodbye.", {
        callSid
      });
      return res.send(xml);
    }
  },

  // POST /api/twilio/voice/inbound-reply
  // After wait cue + SFX/hold audio, Twilio follows redirect here. Consumes background LLM+TTS job when present.
  async inboundGatherReply(req, res) {
    const callSid = String(req.body?.CallSid || "").trim();
    const from = String(req.body?.From || "").trim();
    const to = String(req.body?.To || "").trim();
    const gatherUrl = `${getServerUrl(req)}/api/twilio/voice/inbound-gather`;
    const maxReplyChars = Number(process.env.TWILIO_INBOUND_MAX_REPLY_CHARS) || 800;

    if (!callSid) {
      res.type("text/xml");
      const xml = await buildInboundErrorTwimlXml(req, "Goodbye.");
      return res.send(xml);
    }

    const session = getInboundVoiceSession(callSid);

    try {
      if (!session.clinicPrompt || !session.knowledgePrompt) {
        try {
          const clinicTwilio = await getClinicTwilioConfigByPhoneNumber(to);
          session.clinicId = clinicTwilio.clinicId;
          const inboundContext = await buildInboundClinicContextBySystemClinicId(clinicTwilio.clinicId);
          session.clinicPrompt = inboundContext.clinicPrompt;
          session.knowledgePrompt = inboundContext.knowledgePrompt;
        } catch {
          /* continue without clinic context */
        }
      }
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
        const xml = await buildInboundErrorTwimlXml(req, "Sorry, please try again.", { callSid });
        return res.send(xml);
      }

      let resultPromise = inboundAssistantJobs.get(callSid);
      let result;
      if (resultPromise) {
        result = await resultPromise;
        inboundAssistantJobs.delete(callSid);
      } else {
        result = await buildInboundAssistantAudioResult({
          session,
          callSid,
          maxReplyChars,
          useMerged,
          inboundModel,
          inboundMaxTokens
        });
      }
      await finalizeInboundAssistantTwiml({
        vr,
        req,
        session,
        callSid,
        call,
        persistQueue,
        gatherUrl,
        result
      });

      const xml = vr.toString();
      res.type("text/xml");
      res.send(xml);
      flushInboundPersistQueue(persistQueue);
      return;
    } catch (err) {
      session.inboundAwaitingReply = false;
      inboundAssistantJobs.delete(callSid);
      // eslint-disable-next-line no-console
      console.error(`[Twilio][inbound-reply] error: ${err.message}`);
      res.type("text/xml");
      const xml = await buildInboundErrorTwimlXml(req, "Sorry, something went wrong. Goodbye.", {
        callSid
      });
      return res.send(xml);
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
      const to = String(req.body?.To || "").trim();

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
          const clinicTwilio = await getClinicTwilioConfigByPhoneNumber(to);
          audioBase64 = await fetchRecordingBase64(recordingUrl, {
            accountSid: clinicTwilio.twilioAccountSid,
            authToken: clinicTwilio.twilioAuthToken
          });
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
  }
};
