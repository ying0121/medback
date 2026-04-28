const http = require("http");
const { WebSocketServer, WebSocket } = require("ws");
require("dotenv").config();
const app = require("./app");
const {
  processIncomingMessage,
  resolveConversationOnConnect
} = require("./services/chatService");
const { connectDatabase, syncDatabase } = require("./db");
const configuredWsPath = process.env.WEBSOCKET_CHAT_URL || "/ws";
const websocketPath = configuredWsPath.startsWith("/")
  ? configuredWsPath
  : `/${configuredWsPath}`;

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
const wss = new WebSocketServer({ server, path: websocketPath });

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

wss.on("connection", (socket) => {
  logSuccess("WebSocket client connected successfully.");

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
      const supportedTypes = ["connect", "chat", "voice"];
      const isVoice = methodType === "voice";
      const isConnect = methodType === "connect";
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
    logInfo(`WebSocket client disconnected (code: ${code}, reason: ${reason})`);
  });
});

wss.on("error", (err) => {
  logError(`WebSocket server error: ${err.message}`);
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
