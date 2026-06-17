/**
 * Socket.IO handler for the user-facing chat channel.
 *
 * The wire protocol is a single `message` event carrying a typed JSON object:
 *   - `connect`     : establish/restore a Conversation row; returns conversationId,
 *                     clinicName, clinicAcronym, chat greeting, themeColor, avatar
 *   - `chat`        : a text turn, returns assistant reply
 *   - `voice`       : an audio turn, returns transcript + assistant reply + TTS
 *   - `appointment` : client submits booking details after bot signals intent;
 *                     server emails staff and replies as a chat or voice turn
 *   - `pong`        : keepalive (silently ignored)
 *
 * Responses are emitted with the helper-built payload shape so all client
 * branches see the same field set regardless of which sub-message they used.
 *
 * This module owns ONLY the per-socket lifecycle. Connection-pool concerns
 * (CORS, ping intervals, transports) stay in `server.js` because they are
 * tied to the HTTP server bootstrap.
 */

const {
  processIncomingMessage,
  processAppointmentRequest,
  resolveConversationOnConnect,
  getClinicConnectInfoByBusinessClinicId
} = require("../services/chatService");
const { Conversation } = require("../db");
const { logOk, logInfo, logErr, logDbg } = require("./socketLogger");

/** Allowed top-level message types from clients. `pong` is keepalive only. */
const HANDLED_TYPES = ["connect", "chat", "voice", "appointment"];

/**
 * Build a uniform response payload. Centralising this prevents the client
 * from having to handle missing/optional fields differently per message type.
 */
function makePayload(fields) {
  return {
    type:           fields.type,
    status:         fields.status         ?? null,
    callStatus:     fields.callStatus     ?? null,
    twilioIntent:   fields.twilioIntent   ?? null,
    message:        fields.message        ?? null,
    response:       fields.response       ?? null,
    transcriptText: fields.transcriptText ?? null,
    audio:          fields.audio          ?? null,
    audioMimeType:  fields.audioMimeType  ?? null,
    conversationId: fields.conversationId ?? null,
    clinicName:     fields.clinicName     ?? null,
    clinicAcronym:  fields.clinicAcronym  ?? null,
    greeting:       fields.greeting       ?? null,
    themeColor:     fields.themeColor     ?? null,
    avatar:         fields.avatar         ?? null,
    callSid:        fields.callSid        ?? null,
    duration:       fields.duration       ?? null
  };
}

function send(socket, payload) {
  logDbg(`send type=${payload.type} status=${payload.status || "-"} cid=${payload.conversationId || "-"}`);
  socket.emit("message", payload);
}

/**
 * Parse incoming Socket.IO frame: the client may emit a JSON string OR a
 * pre-parsed object (depending on the socket.io-client version). Returns
 * either the parsed object or null when the payload is unusable.
 */
function coerceFrame(parsed) {
  if (typeof parsed === "string") {
    try { return JSON.parse(parsed); } catch { return null; }
  }
  if (parsed && typeof parsed === "object") return parsed;
  return null;
}

/**
 * Handle the initial `connect` handshake — resolves or creates a Conversation
 * row and stores its id on the socket so subsequent chat/voice frames can
 * reference it implicitly.
 */
async function handleConnect(socket, parsed) {
  const clinicId = Number(parsed.clinicId) || null;
  const userInfo = parsed.userInfo ? JSON.stringify(parsed.userInfo) : "";
  const conversationId = await resolveConversationOnConnect({
    conversationId: parsed.conversationId,
    clinicId,
    userInfo
  });
  socket.conversationId = conversationId;

  let businessClinicId = clinicId;
  if (!businessClinicId) {
    const conversation = await Conversation.findByPk(conversationId, {
      attributes: ["clinicId"]
    });
    businessClinicId = conversation?.clinicId || null;
  }

  const { clinicName, clinicAcronym, greeting, themeColor, avatar } =
    await getClinicConnectInfoByBusinessClinicId(businessClinicId);

  logOk(
    `[SOCKET.IO] session ready #${socket.wsId} conversationId=${conversationId} clinic=${clinicName || "-"} theme=${themeColor || "-"}`
  );
  return send(socket, makePayload({
    type: "connect",
    status: "success",
    conversationId,
    clinicName,
    clinicAcronym,
    greeting,
    themeColor,
    avatar
  }));
}

function resolveReplyType(parsed, socket) {
  if (parsed.replyType === "chat" || parsed.replyType === "voice") return parsed.replyType;
  if (parsed.messageType === "chat" || parsed.messageType === "voice") return parsed.messageType;
  if (socket.lastTurnType === "chat" || socket.lastTurnType === "voice") return socket.lastTurnType;
  return "chat";
}

/**
 * Handle either a chat or voice turn; the only difference is which payload
 * field is required (`message` vs `audio`).
 */
async function handleTurn(socket, parsed, msgType) {
  const conversationId = Number(parsed.conversationId || socket.conversationId);
  if (!conversationId) {
    return send(socket, makePayload({
      type: msgType, status: "error", message: "Send connect first."
    }));
  }

  const hasChatMessage = typeof parsed.message === "string" && parsed.message.trim().length > 0;
  const hasVoiceAudio  = typeof parsed.audio   === "string" && parsed.audio.trim().length > 0;

  if (msgType === "chat" && !hasChatMessage) {
    return send(socket, makePayload({ type: "chat", status: "error", message: "message field is required." }));
  }
  if (msgType === "voice" && !hasVoiceAudio) {
    return send(socket, makePayload({ type: "voice", status: "error", message: "audio field is required." }));
  }

  const result = await processIncomingMessage({
    conversationId,
    type:          msgType,
    text:          hasChatMessage ? parsed.message : (parsed.text || ""),
    audioBase64:   parsed.audio    || null,
    audioMimeType: parsed.audioMimeType || parsed.mimeType || null,
    isTopic:       parsed.isTopic  || 0
  });

  if (result.status === "error") {
    return send(socket, makePayload({
      type: msgType,
      status: "error",
      message: result.error || "Processing failed.",
      conversationId: result.conversationId
    }));
  }

  const isAppointment = result.responseType === "appointment";
  if (isAppointment) socket.lastTurnType = msgType;

  return send(socket, makePayload({
    type:           result.responseType || msgType,
    status:         "success",
    twilioIntent:   result.twilioIntent === true,
    response:       isAppointment ? null : (result.assistantReply || null),
    transcriptText: result.transcriptText  || null,
    audio:          isAppointment ? null : (result.audioBase64 || null),
    audioMimeType:  isAppointment ? null : (result.audioMimeType || null),
    conversationId: result.conversationId
  }));
}

/**
 * Handle a direct appointment submission from the client (after the bot
 * signals appointment intent). Sends staff notification email and replies
 * with a normal chat or voice turn containing the confirmation message.
 */
async function handleAppointment(socket, parsed) {
  const replyType = resolveReplyType(parsed, socket);
  const conversationId = Number(
    parsed.conversationId || parsed.conversation_id || socket.conversationId
  );
  if (!conversationId) {
    return send(socket, makePayload({
      type: replyType, status: "error", message: "Send connect first."
    }));
  }

  const patientInfo = parsed.patientInfo;
  if (!patientInfo || typeof patientInfo !== "object") {
    return send(socket, makePayload({
      type: replyType, status: "error", message: "patientInfo is required."
    }));
  }

  const result = await processAppointmentRequest({
    conversationId,
    clinicId: parsed.clinicId,
    patientInfo,
    userInfo: parsed.userInfo || null,
    isTopic: parsed.isTopic || 0,
    replyType
  });

  const responseType = result.replyType || replyType;

  if (result.status === "error") {
    return send(socket, makePayload({
      type: responseType,
      status: "error",
      message: result.error || "Appointment request failed.",
      conversationId: result.conversationId
    }));
  }

  return send(socket, makePayload({
    type: responseType,
    status: "success",
    response: result.confirmationMessage || null,
    audio: result.audioBase64 || null,
    audioMimeType: result.audioMimeType || null,
    conversationId: result.conversationId
  }));
}

/** Per-socket message dispatcher. */
async function dispatchMessage(socket, raw) {
  const parsed = coerceFrame(raw);
  if (!parsed) {
    return send(socket, makePayload({
      type: "connect", status: "error", message: "Invalid payload."
    }));
  }

  const msgType = parsed.type;
  logDbg(`recv #${socket.wsId} type=${msgType || "-"}`);
  if (msgType === "pong") return;

  if (!HANDLED_TYPES.includes(msgType)) {
    return send(socket, makePayload({
      type: "connect", status: "error", message: "Unknown message type."
    }));
  }

  try {
    if (msgType === "connect") return await handleConnect(socket, parsed);
    if (msgType === "appointment") return await handleAppointment(socket, parsed);
    return await handleTurn(socket, parsed, msgType);
  } catch (err) {
    logErr(`[SOCKET.IO] handler error #${socket.wsId}: ${err.message}`);
    return send(socket, makePayload({
      type: HANDLED_TYPES.includes(msgType) ? msgType : "connect",
      status: "error",
      message: err.message || "Internal error."
    }));
  }
}

/**
 * Wire up Socket.IO `connection` events on the supplied server.
 * Returns the same `io` instance for chaining.
 */
function attachChatSocket(io) {
  let connectionSeq = 0;

  io.on("connection", (socket) => {
    connectionSeq += 1;
    socket.wsId   = connectionSeq;
    socket.origin = socket.handshake?.headers?.origin || "no-origin";
    socket.path   = socket.handshake?.url || "-";
    logOk(`[SOCKET.IO] ⬆ CONNECTED #${socket.wsId} | origin=${socket.origin} | path=${socket.path} | sid=${socket.id}`);

    socket.on("error", (err) => {
      logErr(`[SOCKET.IO] error #${socket.wsId}: ${err.message}`);
    });

    socket.on("disconnect", (reason) => {
      const msg = `[SOCKET.IO] ⬇ DISCONNECTED #${socket.wsId} | origin=${socket.origin} | sid=${socket.id} | reason=${reason}`;
      const isClean = reason === "client namespace disconnect" || reason === "server namespace disconnect";
      if (isClean) logInfo(msg);
      else         logErr(msg);
    });

    socket.on("message", (raw) => dispatchMessage(socket, raw));
  });

  io.engine.on("connection_error", (err) => {
    const origin = err?.req?.headers?.origin || "no-origin";
    const url    = err?.req?.url || "-";
    const code   = err?.code ?? "-";
    const ctx    = err?.context ? JSON.stringify(err.context) : "-";
    logErr(
      `[SOCKET.IO] connection error origin=${origin} url=${url} code=${code} message=${err.message} context=${ctx}`
    );
  });

  return io;
}

module.exports = { attachChatSocket };
