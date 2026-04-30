const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();
const app = require("./app");
const { processIncomingMessage, resolveConversationOnConnect } = require("./services/chatService");
const { connectDatabase, syncDatabase } = require("./db");

// ─── Config ──────────────────────────────────────────────────────────────────

const configuredSocketPath = process.env.SOCKET_IO_PATH || process.env.WEBSOCKET_CHAT_URL || "/ws/chat";
const socketPath = configuredSocketPath.startsWith("/") ? configuredSocketPath : `/${configuredSocketPath}`;
const SOCKET_IO_PING_INTERVAL_MS = Number(process.env.SOCKET_IO_PING_INTERVAL_MS || process.env.WS_PING_INTERVAL_MS) || 25000;
const SOCKET_IO_PING_TIMEOUT_MS = Number(process.env.SOCKET_IO_PING_TIMEOUT_MS) || 60000;
const WS_DEBUG = String(process.env.WS_DEBUG_LOGS || "").toLowerCase() === "true";

const allowedOrigins = process.env.ALLOWED_WS_ORIGINS
  ? process.env.ALLOWED_WS_ORIGINS.split(",").map((o) => o.trim().toLowerCase().replace(/\/$/, ""))
  : [];

// ─── Logging ─────────────────────────────────────────────────────────────────

const C = { reset: "\x1b[0m", green: "\x1b[32m", blue: "\x1b[36m", red: "\x1b[31m" };
// eslint-disable-next-line no-console
const logOk  = (m) => console.log(`${C.green}✅ ${m}${C.reset}`);
// eslint-disable-next-line no-console
const logInfo = (m) => console.log(`${C.blue}ℹ️  ${m}${C.reset}`);
// eslint-disable-next-line no-console
const logErr  = (m) => console.error(`${C.red}❌ ${m}${C.reset}`);
const logDbg  = (m) => { if (WS_DEBUG) logInfo(`[WS] ${m}`); };

// ─── HTTP + Socket.IO server ──────────────────────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
  path: socketPath,
  transports: ["polling", "websocket"],
  pingInterval: SOCKET_IO_PING_INTERVAL_MS,
  pingTimeout: SOCKET_IO_PING_TIMEOUT_MS,
  cors: {
    origin(origin, callback) {
      if (!origin || allowedOrigins.length === 0) return callback(null, true);
      const normalizedOrigin = String(origin).toLowerCase().replace(/\/$/, "");
      const ok = allowedOrigins.includes(normalizedOrigin);
      if (!ok) logErr(`[SOCKET.IO] origin rejected: ${origin}`);
      return callback(ok ? null : new Error("Origin not allowed"), ok);
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

io.engine.on("initial_headers", (_headers, req) => {
  const origin = req.headers?.origin || "no-origin";
  const url = req.url || "-";
  logDbg(`engine initial request origin=${origin} url=${url}`);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(socket, payload) {
  logDbg(`send type=${payload.type} status=${payload.status || "-"} cid=${payload.conversationId || "-"}`);
  socket.emit("message", payload);
}

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
    callSid:        fields.callSid        ?? null,
    duration:       fields.duration       ?? null,
  };
}

// ─── Connection handler ───────────────────────────────────────────────────────

let seq = 0;

io.on("connection", (socket) => {
  seq += 1;
  socket.wsId = seq;
  socket.origin = socket.handshake?.headers?.origin || "no-origin";
  socket.path = socket.handshake?.url || "-";
  logOk(`[SOCKET.IO] ⬆ CONNECTED #${socket.wsId} | origin=${socket.origin} | path=${socket.path} | sid=${socket.id}`);

  socket.on("error", (err) => logErr(`[SOCKET.IO] error #${socket.wsId}: ${err.message}`));

  socket.on("disconnect", (reason) => {
    const msg = `[SOCKET.IO] ⬇ DISCONNECTED #${socket.wsId} | origin=${socket.origin} | sid=${socket.id} | reason=${reason}`;
    if (reason === "client namespace disconnect" || reason === "server namespace disconnect") logInfo(msg);
    else logErr(msg);
  });

  socket.on("message", async (parsed) => {
    if (typeof parsed === "string") {
      try {
        parsed = JSON.parse(parsed);
      } catch {
        return send(socket, makePayload({ type: "connect", status: "error", message: "Invalid JSON." }));
      }
    }
    if (!parsed || typeof parsed !== "object") {
      return send(socket, makePayload({ type: "connect", status: "error", message: "Invalid payload." }));
    }

    const { type: msgType } = parsed;
    logDbg(`recv #${socket.wsId} type=${msgType || "-"}`);

    if (msgType === "pong") return;

    // validate type
    if (!["connect", "chat", "voice"].includes(msgType)) {
      return send(socket, makePayload({ type: "connect", status: "error", message: "Unknown message type." }));
    }

    try {
      // ── connect handshake ──────────────────────────────────────────────────
      if (msgType === "connect") {
        const clinicId = Number(parsed.clinicId) || null;
        const userInfo = parsed.userInfo ? JSON.stringify(parsed.userInfo) : "";
        const conversationId = await resolveConversationOnConnect({
          conversationId: parsed.conversationId,
          clinicId,
          userInfo
        });
        socket.conversationId = conversationId;
        logOk(`[SOCKET.IO] session ready #${socket.wsId} conversationId=${conversationId}`);
        return send(socket, makePayload({ type: "connect", status: "success", conversationId }));
      }

      // ── chat / voice ───────────────────────────────────────────────────────
      const conversationId = Number(parsed.conversationId || socket.conversationId);
      if (!conversationId) {
        return send(socket, makePayload({ type: msgType, status: "error", message: "Send connect first." }));
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
          type: msgType, status: "error",
          message: result.error || "Processing failed.",
          conversationId: result.conversationId
        }));
      }

      return send(socket, makePayload({
        type:           msgType,
        status:         "success",
        twilioIntent:   result.twilioIntent === true,
        response:       result.assistantReply       || null,
        transcriptText: result.transcriptText        || null,
        audio:          result.audioBase64           || null,
        audioMimeType:  result.audioMimeType         || null,
        conversationId: result.conversationId
      }));

    } catch (err) {
      logErr(`[SOCKET.IO] handler error #${socket.wsId}: ${err.message}`);
      return send(socket, makePayload({
        type: ["connect","chat","voice"].includes(msgType) ? msgType : "connect",
        status: "error",
        message: err.message || "Internal error."
      }));
    }
  });
});

io.engine.on("connection_error", (err) => {
  const origin = err?.req?.headers?.origin || "no-origin";
  const url = err?.req?.url || "-";
  logErr(`[SOCKET.IO] connection error origin=${origin} url=${url} message=${err.message}`);
});

// ─── Start ────────────────────────────────────────────────────────────────────

connectDatabase()
  .then(() => {
    logOk("Database connected successfully.");
    return syncDatabase();
  })
  .then(() => {
    const port = Number(process.env.PORT || 4000);
    server.listen(port, () => {
      logInfo(`Server listening on http://localhost:${port}`);
      logOk(`Socket.IO ready at http://localhost:${port}${socketPath}`);
    });
  })
  .catch((err) => {
    logErr(`Database initialization failed: ${err.message}`);
    process.exit(1);
  });
