const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const app = require("./app");
const { connectDatabase, syncDatabase } = require("./db");
const { attachChatSocket } = require("./realtime/chatSocketHandler");
const { attachInboundStreamWS } = require("./realtime/inboundStreamHandler");
const { logOk, logInfo, logErr } = require("./realtime/socketLogger");

// ─── Config ──────────────────────────────────────────────────────────────────

const configuredSocketPath = process.env.WEBSOCKET_CHAT_URL || "/ws/chat";
const socketPath = configuredSocketPath.startsWith("/") ? configuredSocketPath : `/${configuredSocketPath}`;
const SOCKET_IO_PING_INTERVAL_MS = Number(process.env.WS_PING_INTERVAL_MS) || 25000;
const SOCKET_IO_PING_TIMEOUT_MS  = Number(process.env.WS_PING_TIMEOUT_MS) || 60000;

// Comma-separated list, normalised to lowercase + no trailing slash for fast comparison.
const allowedOrigins = process.env.ALLOWED_WS_ORIGINS
  ? process.env.ALLOWED_WS_ORIGINS.split(",").map((o) => o.trim().toLowerCase().replace(/\/$/, ""))
  : [];

// ─── HTTP + Socket.IO server ─────────────────────────────────────────────────

const server = http.createServer(app);

const io = new Server(server, {
  path: socketPath,
  transports: ["polling", "websocket"],
  pingInterval: SOCKET_IO_PING_INTERVAL_MS,
  pingTimeout:  SOCKET_IO_PING_TIMEOUT_MS,
  cors: {
    // Allow listed origins only; an empty allow-list is treated as "open" so
    // local development still works without configuring ALLOWED_WS_ORIGINS.
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

// All per-socket message handling is encapsulated in the realtime module so
// this file remains a thin bootstrap.
attachChatSocket(io);

// Twilio Media Streams WebSocket for inbound PSTN voice bot (path: /api/twilio/voice/stream)
attachInboundStreamWS(server);

// ─── Start ───────────────────────────────────────────────────────────────────

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
