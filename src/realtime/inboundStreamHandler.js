/**
 * Inbound Media Stream WebSocket handler.
 *
 * Attaches a WebSocketServer to the existing HTTP server for the path
 * /api/twilio/voice/stream — the URL that Twilio Media Streams connects to
 * after receiving the <Connect><Stream> TwiML from the inbound webhook.
 *
 * Two-phase handshake:
 *   1. POST /api/twilio/voice/inbound  — HTTP webhook stores clinic context
 *      + call row in `pendingInboundSessions` keyed by CallSid.
 *   2. WS   /api/twilio/voice/stream   — Media Stream connects, "start" event
 *      retrieves the pending context, creates an InboundCallSession, and starts
 *      the Deepgram → LLM → ElevenLabs pipeline.
 */

const { WebSocketServer } = require("ws");
const { InboundCallSession } = require("../services/inboundCallSession");

/**
 * Clinic context + call row stored by the HTTP inbound webhook
 * until the WebSocket "start" event fires (usually within ~1 s).
 * callSid → { clinicPrompt, knowledgePrompt, elApiKey, elVoiceId, call, greetingText }
 */
const pendingInboundSessions = new Map();

/**
 * Store pre-resolved clinic context so the WS handler can retrieve it by callSid.
 * Called from twilioController.inboundVoiceWebhook before sending TwiML.
 */
function registerPendingInboundSession(callSid, sessionData) {
  pendingInboundSessions.set(callSid, sessionData);
  setTimeout(() => pendingInboundSessions.delete(callSid), 30_000);
}

/**
 * Attach a WebSocketServer to the HTTP server for /api/twilio/voice/stream.
 * Must be called after http.createServer() but before server.listen().
 * @param {import("http").Server} server
 */
function attachInboundStreamWS(server) {
  const STREAM_PATH = "/api/twilio/voice/stream";
  const wss = new WebSocketServer({ server, path: STREAM_PATH });

  wss.on("connection", (ws) => {
    let session = null;
    let firstFrameLogged = false;
    console.log("[InboundStream] Media Stream WS connected");

    ws.on("message", async (raw) => {
      try {
        const text = Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
        if (!firstFrameLogged) {
          firstFrameLogged = true;
          console.log(`[InboundStream] first frame: ${text.slice(0, 200)}`);
        }
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          // Be tolerant: ignore non-JSON frames instead of closing the stream.
          console.warn(`[InboundStream] non-JSON frame ignored: ${text.slice(0, 120)}`);
          return;
        }

        switch (msg.event) {
          case "connected":
            console.log(
              `[InboundStream] stream connected event protocol=${msg.protocol || "-"} version=${msg.version || "-"}`
            );
            break;

          case "start": {
            try {
              const callSid =
                msg.start?.customParameters?.callSid ??
                msg.start?.callSid ??
                "unknown";
              const streamSid = msg.streamSid;

              console.log(
                `[InboundStream] stream started callSid=${callSid} streamSid=${streamSid}`
              );

              const pendingData = pendingInboundSessions.get(callSid) || {};
              pendingInboundSessions.delete(callSid);

              session = new InboundCallSession(callSid, ws, pendingData);
              session.setStreamSid(streamSid);
              await session.start();
            } catch (err) {
              // Do not force-close the Twilio socket on startup failure; log and keep alive.
              console.error(`[InboundStream] start handling error: ${err.message}`);
            }
            break;
          }

          case "media": {
            if (!session) break;
            const audioBuffer = Buffer.from(msg.media.payload, "base64");
            session.sendAudio(audioBuffer);
            break;
          }

          case "stop": {
            console.log(`[InboundStream] stream stopped callSid=${session?.callSid || "-"}`);
            if (session) {
              session.close();
              session = null;
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error(`[InboundStream] message handling error: ${err.message}`);
      }
    });

    ws.on("close", (code, reasonBuffer) => {
      const reason = Buffer.isBuffer(reasonBuffer)
        ? reasonBuffer.toString("utf8")
        : String(reasonBuffer || "");
      if (session) {
        session.close();
        session = null;
      }
      console.log(`[InboundStream] Media Stream WS closed code=${code} reason=${reason || "-"}`);
    });

    ws.on("error", (err) => {
      console.error(`[InboundStream] WS error: ${err.message}`);
    });
  });

  console.log("[InboundStream] Twilio Media Stream WebSocket server attached at /api/twilio/voice/stream");
}

module.exports = { registerPendingInboundSession, attachInboundStreamWS };
