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
 *      the OpenAI Realtime voice pipeline.
 */

const { WebSocketServer } = require("ws");
const { InboundCallSession } = require("../services/inboundCallSession");
const {
  findOrCreateCallBySid,
  finalizeInboundCallRecord
} = require("../services/callPersistenceService");
const configuredStreamPath = String(process.env.TWILIO_STREAM_PATH || "/api/twilio/voice/stream").trim();
const STREAM_PATH = configuredStreamPath.startsWith("/") ? configuredStreamPath : `/${configuredStreamPath}`;

/**
 * Clinic context + call row stored by the HTTP inbound webhook
 * until the WebSocket "start" event fires (usually within ~1 s).
 * callSid → { clinicPrompt, knowledgePrompt, openaiVoice, clinicId, clinicName, call, greetingText }
 */
const pendingInboundSessions = new Map();

/**
 * Store pre-resolved clinic context so the WS handler can retrieve it by callSid.
 * Called from twilioController.inboundVoiceWebhook before sending TwiML.
 */
function registerPendingInboundSession(callSid, sessionData) {
  pendingInboundSessions.set(callSid, sessionData);
  // Allow slow webhook→WS handoff; 30s was too short under load.
  setTimeout(() => pendingInboundSessions.delete(callSid), 120_000);
}

async function ensurePendingCallRecord(callSid, pendingData, startMsg = {}) {
  if (pendingData.call?.id) return pendingData.call;

  const sid = String(callSid || "").trim();
  if (!sid || sid === "unknown") return null;

  const from =
    startMsg.start?.customParameters?.from ||
    startMsg.start?.from ||
    "unknown";

  try {
    const call = await findOrCreateCallBySid({
      callSid: sid,
      from,
      status: "in-progress"
    });
    if (call) {
      pendingData.call = call;
      console.log(
        `[InboundStream] call record loaded from DB id=${call.id} callSid=${sid}`
      );
    }
    return call;
  } catch (err) {
    console.error(
      `[InboundStream] call record DB load failed callSid=${sid}: ${err.message}`
    );
    return null;
  }
}

function finalizeInboundCallHistory(callSid) {
  const sid = String(callSid || "").trim();
  if (!sid || sid === "unknown") return;
  finalizeInboundCallRecord(sid).catch((err) => {
    console.error(
      `[InboundStream] finalize call failed callSid=${sid}: ${err.message}`
    );
  });
}

/**
 * Attach a WebSocketServer to the HTTP server for /api/twilio/voice/stream.
 * Must be called after http.createServer() but before server.listen().
 * @param {import("http").Server} server
 */
function attachInboundStreamWS(server) {
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
              const streamSid = msg.streamSid || msg.start?.streamSid || null;

              console.log(
                `[InboundStream] stream started callSid=${callSid} streamSid=${streamSid}`
              );

              const pendingData = pendingInboundSessions.get(callSid) || {};
              pendingInboundSessions.delete(callSid);

              await ensurePendingCallRecord(callSid, pendingData, msg);

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
              finalizeInboundCallHistory(session.callSid);
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
        finalizeInboundCallHistory(session.callSid);
        session.close();
        session = null;
      }
      console.log(`[InboundStream] Media Stream WS closed code=${code} reason=${reason || "-"}`);
    });

    ws.on("error", (err) => {
      console.error(`[InboundStream] WS error: ${err.message}`);
    });
  });

  console.log(`[InboundStream] Twilio Media Stream WebSocket server attached at ${STREAM_PATH}`);
}

module.exports = { STREAM_PATH, registerPendingInboundSession, attachInboundStreamWS };
