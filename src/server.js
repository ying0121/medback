const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
require("dotenv").config();
const app = require("./app");
const { processIncomingMessage, resolveConversationOnConnect } = require("./services/chatService");
const { connectDatabase, syncDatabase } = require("./db");
const configuredWsPath = process.env.WEBSOCKET_CHAT_URL || "/ws/chat";
const websocketPath = configuredWsPath.startsWith("/") ? configuredWsPath : `/${configuredWsPath}`;

const C = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  blue: "\x1b[36m",
  red: "\x1b[31m"
};

function logSuccess(message) {
  // eslint-disable-next-line no-console
  console.log(`${C.green}✅ ${message}${C.reset}`);
}

function logInfo(message) {
  // eslint-disable-next-line no-console
  console.log(`${C.blue}ℹ️  ${message}${C.reset}`);
}

function logError(message) {
  // eslint-disable-next-line no-console
  console.error(`${C.red}❌ ${message}${C.reset}`);
}

const server = http.createServer(app);

const allowedWsOrigins = process.env.ALLOWED_WS_ORIGINS ? process.env.ALLOWED_WS_ORIGINS.split(",").map((o) => o.trim().toLowerCase()) : [];

// Interval in ms between server-side pings to keep the connection alive
// through load balancers and reverse proxies that kill idle connections.
const WS_PING_INTERVAL_MS = Number(process.env.WS_PING_INTERVAL_MS) || 25000;
const WS_MAX_MISSED_PONGS = Number(process.env.WS_MAX_MISSED_PONGS) || 3;

const wss = new WebSocketServer({
  server,
  path: websocketPath,   // native path filter — most reliable, no manual rejection needed
  verifyClient({ origin, req }, done) {
    if (!origin) {
      logInfo(`WebSocket handshake — no origin (server-to-server), allowing. path=${req?.url || "-"}`);
      return done(true);
    }
    if (allowedWsOrigins.length === 0) {
      logInfo(`WebSocket handshake — no origin restriction, allowing: ${origin} path=${req?.url || "-"}`);
      return done(true);
    }
    const normalize = (url) => url.replace(/\/$/, "").toLowerCase();

    const ok = allowedWsOrigins.some(
      (allowed) => normalize(origin) === normalize(allowed)
    );
    if (ok) {
      logInfo(`WebSocket handshake — origin allowed: ${origin}`);
    } else {
      logError(`WebSocket handshake — origin REJECTED: ${origin} (allowed: ${allowedWsOrigins.join(", ")})`);
    }
    return done(ok, ok ? undefined : 403, ok ? undefined : "Origin not allowed");
  }
});

// Application-level heartbeat: sends {"type":"ping"} as a regular JSON data
// frame so the proxy/load balancer sees traffic and does not kill idle connections.
// We do NOT terminate clients that miss pongs — the connection stays alive until
// the OS/proxy closes it naturally. Frontend should respond with {"type":"pong"}.
const heartbeat = setInterval(() => {
  wss.clients.forEach((socket) => {
    if (socket.readyState !== WebSocket.OPEN) return;

    if (socket.isAlive === false) {
      socket.missedPongs += 1;

      if (socket.missedPongs >= WS_MAX_MISSED_PONGS) {
        console.log("Terminating dead socket");
        return socket.terminate();
      }
    }

    socket.isAlive = false;

    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "ping" }));
    }
  });
}, WS_PING_INTERVAL_MS);

function sendJson(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function createWsPayload({
  type,
  status,
  callStatus = null,
  twilioIntent = null,
  message = null,
  response = null,
  transcriptText = null,
  audio = null,
  audioMimeType = null,
  conversationId = null,
  callSid = null,
  duration = null
}) {
  return {
    type,
    status,
    callStatus,
    twilioIntent,
    message,
    response,
    transcriptText,
    audio,
    audioMimeType,
    conversationId,
    callSid,
    duration
  };
}

wss.on("connection", (socket, req) => {
  logSuccess(`WebSocket client connected successfully. path=${req?.url || "-"}`);

  socket.isAlive = true;
  socket.missedPongs = 0;

  socket.on("message", async (raw) => {
    let parsed;

    try {
      parsed = JSON.parse(raw.toString());
    } catch (err) {
      logError(`WebSocket JSON parse error: ${err.message}`);
      sendJson(socket, {
        ...createWsPayload({
          type: "connect",
          status: "error",
          message: "Invalid JSON payload."
        })
      });
      return;
    }

    try {
      const methodType = parsed.type;

      const supportedTypes = ["connect", "chat", "voice", "pong"];
      const isVoice = methodType === "voice";
      const isConnect = methodType === "connect";
      const isPong = methodType === "pong";
      const isTopic = parsed.isTopic ? parsed.isTopic : 0;
      const hasChatMessage = typeof parsed.message === "string" && parsed.message.trim().length > 0;
      const hasVoiceAudio = typeof parsed.audio === "string" && parsed.audio.trim().length > 0;

      if (!supportedTypes.includes(methodType)) {
        sendJson(socket, {
          ...createWsPayload({
            type: "connect",
            status: "error",
            message: "Expected type to be connect, chat, or voice."
          })
        });
        return;
      }

      if (isPong) {
        return
      }

      if (isConnect) {
        const clinicId = Number(parsed.clinicId) || null;
        const userInfo = parsed.userInfo ? JSON.stringify(parsed.userInfo) : "";
        const incomingConversationId = parsed.conversationId;
        const conversationId = await resolveConversationOnConnect({
          conversationId: incomingConversationId,
          clinicId,
          userInfo
        });
        socket.conversationId = conversationId;
        sendJson(socket, {
          ...createWsPayload({
            type: "connect",
            status: "success",
            conversationId
          })
        });
        return;
      }

      const conversationId = Number(parsed.conversationId || socket.conversationId);
      if (!conversationId) {
        sendJson(socket, {
          ...createWsPayload({
            type: methodType,
            status: "error",
            message: "Send connect first, or provide a valid conversationId."
          })
        });
        return;
      }

      if (!isVoice && !hasChatMessage) {
        sendJson(socket, {
          ...createWsPayload({
            type: "chat",
            status: "error",
            message: "Chat payload requires a non-empty message field."
          })
        });
        return;
      }

      if (isVoice && !hasVoiceAudio) {
        sendJson(socket, {
          ...createWsPayload({
            type: "voice",
            status: "error",
            message: "Voice payload requires a non-empty audio field (base64)."
          })
        });
        return;
      }

      const result = await processIncomingMessage({
        conversationId,
        type: methodType,
        text: hasChatMessage ? parsed.message : parsed.text,
        audioBase64: parsed.audio || null,
        audioMimeType: parsed.audioMimeType || parsed.mimeType || null,
        isTopic
      });

      if (result.status === "error") {
        sendJson(socket, {
          ...createWsPayload({
            type: methodType,
            status: "error",
            message: result.error || "OpenAI request failed.",
            conversationId: result.conversationId
          })
        });
        return;
      }

      sendJson(socket, {
        ...createWsPayload({
          type: methodType,
          status: "success",
          twilioIntent: result.twilioIntent === true,
          response: result.assistantReply,
          transcriptText: result.transcriptText || null,
          audio: result.audioBase64 || null,
          audioMimeType: result.audioMimeType || null,
          conversationId: result.conversationId
        })
      });
    } catch (err) {
      logError(`WebSocket message processing error: ${err.message}`);
      sendJson(socket, {
        ...createWsPayload({
          type:
            parsed?.type && ["connect", "chat", "voice"].includes(parsed.type)
              ? parsed.type
              : "connect",
          status: "error",
          message: err.message || "Failed to process message."
        })
      });
    }
  });

  socket.on("error", (err) => {
    logError(`WebSocket client error: ${err.message}`);
  });

  socket.on("close", (code, reasonBuffer) => {
    const reason = reasonBuffer?.toString() || "No reason provided";
    const msg = `WebSocket client disconnected (code: ${code}, reason: ${reason})`;
    if (code === 1000 || code === 1001) logInfo(msg);
    else logError(msg);
  });
});

wss.on("error", (err) => {
  logError(`WebSocket server error: ${err.message}`);
});

wss.on("close", () => {
  clearInterval(heartbeat);
});

connectDatabase()
  .then(() => {
    logSuccess("Database connected successfully.");
    return syncDatabase();
  })
  .then(() => {
    const port = Number(process.env.PORT || 4000);
    server.listen(port, () => {
      logInfo(`Server listening on http://localhost:${port}`);
      logSuccess(`WebSocket server is ready at ws://localhost:${port}${websocketPath}`);
    });
  })
  .catch((err) => {
    logError(`Database initialization failed: ${err.message}`);
    process.exit(1);
  });
