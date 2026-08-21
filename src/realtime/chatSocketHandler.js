/**
 * Native WebSocket handler for the user-facing chat channel.
 *
 * Wire protocol: JSON text frames (same payload shapes as before).
 *   - `connect`     : establish/restore a Conversation row; returns conversationId,
 *                     clinicName, clinicAcronym, chat greeting, themeColor, avatar
 *   - `chat`        : a text turn, returns assistant reply
 *   - `voice`       : an audio turn, returns transcript + assistant reply + TTS
 *   - `appointment` : client submits booking details after bot signals intent;
 *                     server emails staff and replies as a chat or voice turn
 *   - `pong`        : application-level keepalive (silently ignored)
 *
 * Clients connect with: `new WebSocket("ws(s)://HOST/ws/chat")`
 * and send/receive JSON objects (no Socket.IO event wrapper).
 *
 * This module owns ONLY the per-socket lifecycle. Bootstrap stays in `server.js`.
 */

const { WebSocketServer, WebSocket } = require("ws");
const {
  processIncomingMessage,
  processAppointmentRequest,
  resolveConversationOnConnect,
  getClinicConnectInfoByBusinessClinicId
} = require("../services/chatService");
const { Conversation } = require("../db");
const { logOk, logInfo, logErr, logDbg } = require("./socketLogger");

const configuredChatPath = String(process.env.WEBSOCKET_CHAT_URL || "/ws/chat").trim();
const CHAT_WS_PATH = configuredChatPath.startsWith("/") ? configuredChatPath : `/${configuredChatPath}`;
const PING_INTERVAL_MS = Number(process.env.WS_PING_INTERVAL_MS) || 25000;
const MAX_MISSED_PONGS = Number(process.env.WS_MAX_MISSED_PONGS) || 3;

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
    duration:       fields.duration       ?? null,
    missingFields:  fields.missingFields  ?? null
  };
}

function send(ws, payload) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  logDbg(`send type=${payload.type} status=${payload.status || "-"} cid=${payload.conversationId || "-"}`);
  ws.send(JSON.stringify(payload));
}

/**
 * Parse an incoming WebSocket frame: JSON string (typical) or already-parsed object.
 */
function coerceFrame(raw) {
  if (Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString("utf8"));
    } catch {
      return null;
    }
  }
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (raw && typeof raw === "object") return raw;
  return null;
}

function isOriginAllowed(origin) {
  const allowedOrigins = process.env.ALLOWED_WS_ORIGINS
    ? process.env.ALLOWED_WS_ORIGINS.split(",").map((o) => o.trim().toLowerCase().replace(/\/$/, ""))
    : [];
  if (!origin || allowedOrigins.length === 0) return true;
  const normalizedOrigin = String(origin).toLowerCase().replace(/\/$/, "");
  return allowedOrigins.includes(normalizedOrigin);
}

/**
 * Handle the initial `connect` handshake — resolves or creates a Conversation
 * row and stores its id on the socket so subsequent chat/voice frames can
 * reference it implicitly.
 */
async function handleConnect(ws, parsed) {
  const clinicId = Number(parsed.clinicId) || null;
  const requestedId = parsed.conversationId ?? parsed.conversation_id;
  const conversationId = await resolveConversationOnConnect({
    conversationId: requestedId,
    clinicId,
    userInfo: parsed.userInfo || parsed.user || "",
    patientInfo: parsed.patientInfo || parsed.patient || parsed.form || null
  });
  ws.conversationId = conversationId;
  ws.lastTurnType = null;
  if (parsed.userInfo) ws.userInfo = parsed.userInfo;
  if (parsed.patientInfo || parsed.patient || parsed.form) {
    ws.patientInfo = parsed.patientInfo || parsed.patient || parsed.form;
  }

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
    `[WS] session ready #${ws.wsId} conversationId=${conversationId} clinic=${clinicName || "-"} theme=${themeColor || "-"}`
  );
  const incomingKeys = Object.keys(parsed || {}).join(",");
  const userInfoKeys =
    parsed.userInfo && typeof parsed.userInfo === "object"
      ? Object.keys(parsed.userInfo).join(",")
      : typeof parsed.userInfo;
  const patientInfoKeys =
    parsed.patientInfo && typeof parsed.patientInfo === "object"
      ? Object.keys(parsed.patientInfo).join(",")
      : typeof parsed.patientInfo;
  logOk(
    `[WS] connect payload keys=${incomingKeys || "-"} userInfoKeys=${userInfoKeys || "-"} patientInfoKeys=${patientInfoKeys || "-"}`
  );
  return send(ws, makePayload({
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

function resolveReplyType(parsed, ws) {
  if (parsed.replyType === "chat" || parsed.replyType === "voice") return parsed.replyType;
  if (parsed.messageType === "chat" || parsed.messageType === "voice") return parsed.messageType;
  if (ws.lastTurnType === "chat" || ws.lastTurnType === "voice") return ws.lastTurnType;
  return "chat";
}

/**
 * Handle either a chat or voice turn; the only difference is which payload
 * field is required (`message` vs `audio`).
 */
async function handleTurn(ws, parsed, msgType) {
  const conversationId = Number(parsed.conversationId || ws.conversationId);
  if (!conversationId) {
    return send(ws, makePayload({
      type: msgType, status: "error", message: "Send connect first."
    }));
  }

  const hasChatMessage = typeof parsed.message === "string" && parsed.message.trim().length > 0;
  const hasVoiceAudio  = typeof parsed.audio   === "string" && parsed.audio.trim().length > 0;

  if (msgType === "chat" && !hasChatMessage) {
    return send(ws, makePayload({ type: "chat", status: "error", message: "message field is required." }));
  }
  if (msgType === "voice" && !hasVoiceAudio) {
    return send(ws, makePayload({ type: "voice", status: "error", message: "audio field is required." }));
  }

  if (parsed.userInfo) ws.userInfo = parsed.userInfo;
  if (parsed.patientInfo || parsed.patient || parsed.form) {
    ws.patientInfo = parsed.patientInfo || parsed.patient || parsed.form;
  }

  const result = await processIncomingMessage({
    conversationId,
    type:          msgType,
    text:          hasChatMessage ? parsed.message : (parsed.text || ""),
    audioBase64:   parsed.audio    || null,
    audioMimeType: parsed.audioMimeType || parsed.mimeType || null,
    isTopic:       parsed.isTopic  || 0,
    userInfo:      parsed.userInfo || parsed.user || ws.userInfo || null,
    patientInfo:   parsed.patientInfo || parsed.patient || parsed.form || ws.patientInfo || null
  });

  if (result.status === "error") {
    return send(ws, makePayload({
      type: msgType,
      status: "error",
      message: result.error || "Processing failed.",
      conversationId: result.conversationId
    }));
  }

  const isAppointment = result.responseType === "appointment";
  if (isAppointment) ws.lastTurnType = msgType;

  return send(ws, makePayload({
    type:           result.responseType || msgType,
    status:         "success",
    twilioIntent:   result.twilioIntent === true,
    response:       result.assistantReply || result.confirmationMessage || null,
    transcriptText: result.transcriptText  || null,
    audio:          result.audioBase64 || null,
    audioMimeType:  result.audioMimeType || null,
    conversationId: result.conversationId,
    missingFields:  result.missingFields || null
  }));
}

/**
 * Handle a direct appointment submission from the client (after the bot
 * signals appointment intent). Sends staff notification email and replies
 * with a normal chat or voice turn containing the confirmation message.
 */
async function handleAppointment(ws, parsed) {
  const replyType = resolveReplyType(parsed, ws);
  const conversationId = Number(
    parsed.conversationId || parsed.conversation_id || ws.conversationId
  );
  if (!conversationId) {
    return send(ws, makePayload({
      type: replyType, status: "error", message: "Send connect first."
    }));
  }

  const patientInfo = parsed.patientInfo || parsed.patient || parsed.form || parsed.userInfo;
  if (!patientInfo || typeof patientInfo !== "object") {
    return send(ws, makePayload({
      type: replyType, status: "error", message: "patientInfo is required."
    }));
  }
  ws.patientInfo = patientInfo;
  if (parsed.userInfo) ws.userInfo = parsed.userInfo;

  const result = await processAppointmentRequest({
    conversationId,
    clinicId: parsed.clinicId,
    patientInfo,
    userInfo: parsed.userInfo || null,
    isTopic: parsed.isTopic || 0,
    replyType
  });

  const responseType = result.responseType || result.replyType || replyType;

  if (result.status === "error") {
    return send(ws, makePayload({
      type: responseType,
      status: "error",
      message: result.error || "Appointment request failed.",
      conversationId: result.conversationId
    }));
  }

  return send(ws, makePayload({
    type: responseType,
    status: "success",
    response: result.confirmationMessage || null,
    audio: result.audioBase64 || null,
    audioMimeType: result.audioMimeType || null,
    conversationId: result.conversationId,
    missingFields: result.missingFields || null
  }));
}

/** Per-socket message dispatcher. */
async function dispatchMessage(ws, raw) {
  const parsed = coerceFrame(raw);
  if (!parsed) {
    return send(ws, makePayload({
      type: "connect", status: "error", message: "Invalid payload."
    }));
  }

  const msgType = parsed.type;
  logDbg(`recv #${ws.wsId} type=${msgType || "-"}`);
  if (msgType === "pong") return;

  if (!HANDLED_TYPES.includes(msgType)) {
    return send(ws, makePayload({
      type: "connect", status: "error", message: "Unknown message type."
    }));
  }

  try {
    if (msgType === "connect") return await handleConnect(ws, parsed);
    if (msgType === "appointment") return await handleAppointment(ws, parsed);
    return await handleTurn(ws, parsed, msgType);
  } catch (err) {
    logErr(`[WS] handler error #${ws.wsId}: ${err.message}`);
    return send(ws, makePayload({
      type: HANDLED_TYPES.includes(msgType) ? msgType : "connect",
      status: "error",
      message: err.message || "Internal error."
    }));
  }
}

/**
 * Attach a native WebSocketServer for web chat (`/ws/chat` by default).
 *
 * Uses `noServer: true` + an explicit HTTP `upgrade` router so this path is
 * unambiguously raw WebSocket JSON (not Socket.IO). Non-matching upgrades are
 * left alone for other handlers.
 *
 * @param {import("http").Server} server
 */
function attachChatSocket(server) {
  let connectionSeq = 0;

  const wss = new WebSocketServer({ noServer: true });

  const pingTimer = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState !== WebSocket.OPEN) continue;
      if (client.isAlive === false) {
        client.missedPongs = (client.missedPongs || 0) + 1;
        if (client.missedPongs >= MAX_MISSED_PONGS) {
          logErr(`[WS] ping timeout #${client.wsId || "-"} — terminating`);
          client.terminate();
          continue;
        }
      } else {
        client.missedPongs = 0;
      }
      client.isAlive = false;
      try {
        client.ping();
      } catch {
        /* ignore */
      }
    }
  }, PING_INTERVAL_MS);
  if (typeof pingTimer.unref === "function") pingTimer.unref();

  wss.on("connection", (ws, req) => {
    connectionSeq += 1;
    ws.wsId = connectionSeq;
    ws.origin = req?.headers?.origin || "no-origin";
    ws.path = req?.url || CHAT_WS_PATH;
    ws.isAlive = true;
    ws.missedPongs = 0;

    logOk(`[WS] ⬆ CONNECTED #${ws.wsId} | origin=${ws.origin} | path=${ws.path}`);

    ws.on("pong", () => {
      ws.isAlive = true;
      ws.missedPongs = 0;
    });

    ws.on("error", (err) => {
      logErr(`[WS] error #${ws.wsId}: ${err.message}`);
    });

    ws.on("close", (code, reasonBuffer) => {
      const reason = reasonBuffer?.toString?.() || String(code);
      const msg = `[WS] ⬇ DISCONNECTED #${ws.wsId} | origin=${ws.origin} | code=${code} | reason=${reason}`;
      const isClean = code === 1000 || code === 1001;
      if (isClean) logInfo(msg);
      else logErr(msg);
    });

    ws.on("message", (raw) => {
      void dispatchMessage(ws, raw);
    });
  });

  wss.on("error", (err) => {
    logErr(`[WS] server error: ${err.message}`);
  });

  server.on("upgrade", (req, socket, head) => {
    let pathname = "/";
    try {
      pathname = new URL(req.url || "/", "http://localhost").pathname;
    } catch {
      pathname = String(req.url || "/").split("?")[0] || "/";
    }
    // Normalize trailing slash so /ws/chat and /ws/chat/ both match.
    if (pathname.length > 1 && pathname.endsWith("/")) {
      pathname = pathname.slice(0, -1);
    }
    const chatPath =
      CHAT_WS_PATH.length > 1 && CHAT_WS_PATH.endsWith("/")
        ? CHAT_WS_PATH.slice(0, -1)
        : CHAT_WS_PATH;

    // Only claim the chat path. Leave all other upgrades alone.
    if (pathname !== chatPath) return;

    const origin = req.headers?.origin || "";
    if (!isOriginAllowed(origin)) {
      logErr(`[WS] origin rejected on upgrade: ${origin || "no-origin"}`);
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }

    logOk(`[WS] upgrade accepted path=${pathname} origin=${origin || "no-origin"}`);
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  });

  return wss;
}

module.exports = { attachChatSocket, CHAT_WS_PATH };
