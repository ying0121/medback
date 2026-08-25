const http = require("http");
require("dotenv").config();

const app = require("./app");
const { connectDatabase, syncDatabase } = require("./db");
const { attachChatSocket, CHAT_WS_PATH } = require("./realtime/chatSocketHandler");
const { STREAM_PATH, attachInboundStreamWS } = require("./realtime/inboundStreamHandler");
const { logOk, logInfo, logErr } = require("./realtime/socketLogger");
const { ensurePortFree } = require("./utils/ensurePortFree");

const port = Number(process.env.PORT || 4000);

// Free leftover mediback servers from a previous crash / duplicate npm start.
ensurePortFree(port, { log: (msg) => logInfo(msg) });

const server = http.createServer(app);

// Native WebSocket chat (ws) — JSON frames at /ws/chat. Not Socket.IO.
attachChatSocket(server);

// Twilio Media Streams WebSocket — inbound calling logic unchanged.
attachInboundStreamWS(server);

server.on("error", (err) => {
  if (err && err.code === "EADDRINUSE") {
    logErr(`Port ${port} is already in use after cleanup. Another app may own it.`);
    process.exit(1);
  }
  logErr(`HTTP server error: ${err && err.message ? err.message : err}`);
  process.exit(1);
});

connectDatabase()
  .then(() => {
    logOk("Database connected successfully.");
    return syncDatabase();
  })
  .then(() => new Promise((resolve, reject) => {
    server.listen(port, () => resolve());
    server.once("error", reject);
  }))
  .then(() => {
    logInfo(`Server listening on http://localhost:${port}`);
    logOk(`Native WebSocket chat ready at ws://localhost:${port}${CHAT_WS_PATH}`);
    logOk(`Inbound Media Stream ready at ${STREAM_PATH}`);
    // Load after the main API is up. minized-chatbot-server listens on require
    // (it does not export startSignaling), so a busy 8765 cannot block the API.
    try {
      require("./minized-chatbot-server.js");
    } catch (err) {
      logErr(`Signaling server failed to start: ${err.message}`);
    }
  })
  .catch((err) => {
    logErr(`Server startup failed: ${err.message}`);
    process.exit(1);
  });
