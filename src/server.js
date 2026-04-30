const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
require("dotenv").config();
const app = require("./app");
const { processIncomingMessage, resolveConversationOnConnect } = require("./services/chatService");
const { connectDatabase, syncDatabase } = require("./db");

// ─── Config ──────────────────────────────────────────────────────────────────

const configuredWsPath = process.env.WEBSOCKET_CHAT_URL || "/ws/chat";
const websocketPath = configuredWsPath.startsWith("/") ? configuredWsPath : `/${configuredWsPath}`;
const WS_PING_INTERVAL_MS = Number(process.env.WS_PING_INTERVAL_MS) || 25000;
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

// ─── HTTP + WebSocket server ──────────────────────────────────────────────────

const server = http.createServer(app);

const wss = new WebSocketServer({
  server,
  path: websocketPath,
  verifyClient({ origin }, done) {
    if (!origin) return done(true); // non-browser / server-to-server
    if (allowedOrigins.length === 0) return done(true); // unrestricted
    const norm = (s) => s.toLowerCase().replace(/\/$/, "");
    const ok = allowedOrigins.some((a) => norm(origin) === a);
    if (!ok) logErr(`[WS] origin rejected: ${origin}`);
    return done(ok, ok ? undefined : 403, ok ? undefined : "Forbidden");
  }
});

// ─── Heartbeat (app-level ping keeps proxy alive) ─────────────────────────────

const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "ping" }));
    }
  });
}, WS_PING_INTERVAL_MS);

wss.on("close", () => clearInterval(heartbeat));

// ─── HTTP upgrade probe ───────────────────────────────────────────────────────
// Fires before the ws library processes the handshake.
// Lets us confirm that the upgrade request actually reaches Node.js.
server.on("upgrade", (req) => {
  const origin = req.headers?.origin || "no-origin";
  const url    = req.url || "-";
  logInfo(`[WS] ↑ UPGRADE request | origin=${origin} | url=${url}`);
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    logDbg(`send type=${payload.type} status=${payload.status || "-"} cid=${payload.conversationId || "-"}`);
    ws.send(JSON.stringify(payload));
  }
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

wss.on("connection", (ws, req) => {
  seq += 1;
  ws.wsId   = seq;
  ws.origin = req?.headers?.origin || "no-origin";
  ws.path   = req?.url || "-";
  logOk(`[WS] ⬆ CONNECTED  #${ws.wsId} | origin=${ws.origin} | path=${ws.path}`);

  ws.on("pong", () => logDbg(`pong #${ws.wsId}`));

  ws.on("error", (err) => logErr(`[WS] error #${ws.wsId}: ${err.message}`));

  ws.on("close", (code, buf) => {
    const reason = buf?.toString() || "-";
    const msg = `[WS] ⬇ DISCONNECTED #${ws.wsId} | origin=${ws.origin} | code=${code} | reason=${reason}`;
    if (code === 1000 || code === 1001) logInfo(msg);
    else logErr(msg);
  });

  ws.on("message", async (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw.toString());
    } catch {
      return send(ws, makePayload({ type: "connect", status: "error", message: "Invalid JSON." }));
    }

    const { type: msgType } = parsed;
    logDbg(`recv #${ws.wsId} type=${msgType || "-"}`);

    // app-level pong response to our ping — just swallow it
    if (msgType === "pong") return;

    // validate type
    if (!["connect", "chat", "voice"].includes(msgType)) {
      return send(ws, makePayload({ type: "connect", status: "error", message: "Unknown message type." }));
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
        ws.conversationId = conversationId;
        logOk(`[WS] session ready #${ws.wsId} conversationId=${conversationId}`);
        return send(ws, makePayload({ type: "connect", status: "success", conversationId }));
      }

      // ── chat / voice ───────────────────────────────────────────────────────
      const conversationId = Number(parsed.conversationId || ws.conversationId);
      if (!conversationId) {
        return send(ws, makePayload({ type: msgType, status: "error", message: "Send connect first." }));
      }

      const hasChatMessage = typeof parsed.message === "string" && parsed.message.trim().length > 0;
      const hasVoiceAudio  = typeof parsed.audio   === "string" && parsed.audio.trim().length > 0;

      if (msgType === "chat" && !hasChatMessage) {
        return send(ws, makePayload({ type: "chat", status: "error", message: "message field is required." }));
      }
      if (msgType === "voice" && !hasVoiceAudio) {
        return send(ws, makePayload({ type: "voice", status: "error", message: "audio field is required." }));
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
        return send(ws, makePayload({
          type: msgType, status: "error",
          message: result.error || "Processing failed.",
          conversationId: result.conversationId
        }));
      }

      return send(ws, makePayload({
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
      logErr(`[WS] handler error #${ws.wsId}: ${err.message}`);
      return send(ws, makePayload({
        type: ["connect","chat","voice"].includes(msgType) ? msgType : "connect",
        status: "error",
        message: err.message || "Internal error."
      }));
    }
  });
});

wss.on("error", (err) => logErr(`[WS] server error: ${err.message}`));

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
      logOk(`WebSocket ready at ws://localhost:${port}${websocketPath}`);
    });
  })
  .catch((err) => {
    logErr(`Database initialization failed: ${err.message}`);
    process.exit(1);
  });
