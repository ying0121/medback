/**
 * Call lifecycle persistence helpers (database-side concerns only).
 *
 * Centralises logic that was previously scattered across the Twilio controller:
 *   - locating / creating the `calls` row keyed by Twilio CallSid,
 *   - normalising the caller phone string,
 *   - keeping `calls.seconds` up-to-date both during the call (inbound session
 *     "heartbeat") and at the completed status callback,
 *   - persisting `incoming_messages` rows.
 *
 * Why centralise: inbound numbers without a configured StatusCallback URL
 * never POST `completed` to /call-status, so we must update seconds during
 * the call as well. Two code paths previously did this independently and
 * occasionally drifted.
 */

const { Call, IncomingMessage } = require("../db");

/**
 * Convert a raw Twilio `From` value into something safe to store on the row.
 * Twilio Voice SDK browser callers come through as `client:<identity>`; we
 * strip the prefix so reports show only the meaningful identifier.
 */
function normalizePhoneForCallRow(fromValue) {
  const raw = String(fromValue || "").trim();
  if (!raw) return "unknown";
  if (raw.startsWith("client:")) return raw.slice(7) || "unknown";
  return raw;
}

/**
 * Look up the `calls` row for this CallSid, creating one with seconds=0 if it
 * does not yet exist. Safe to call from any inbound webhook handler.
 */
async function findOrCreateCallBySid({ callSid, from, status = null }) {
  if (!callSid) return null;

  let call = await Call.findOne({ where: { callSid } });
  if (!call) {
    call = await Call.create({
      callSid,
      phone:   normalizePhoneForCallRow(from),
      seconds: 0,
      status:  status || null
    });
  }
  return call;
}

/**
 * Increase `calls.seconds` to match elapsed time since the inbound session
 * was opened. Never decreases; safe to call repeatedly throughout the call.
 *
 * The `session` argument is expected to carry `session.startedAt` (epoch ms),
 * which is set when the very first inbound webhook fires for the CallSid.
 */
async function touchCallSecondsFromSession(callSid, session) {
  const sid = String(callSid || "").trim();
  if (!sid || !session) return;

  const startedAt = Number(session.startedAt || 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0) return;

  const elapsedSec = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  if (elapsedSec <= 0) return;

  const call = await Call.findOne({ where: { callSid: sid } });
  if (!call) return;

  const current = Number(call.seconds || 0);
  if (elapsedSec > current) {
    await call.update({ seconds: elapsedSec });
    // eslint-disable-next-line no-console
    console.log(`[Twilio][inbound] touch seconds callSid=${sid} seconds=${elapsedSec}`);
  }
}

/**
 * Compute the final `seconds` value to persist when a call completes.
 *
 * Priority:
 *   1. Twilio-reported `CallDuration` (exact billing duration, always preferred).
 *   2. Elapsed time computed from the row's `created_at` — used when Twilio
 *      omits `CallDuration` (which happens when the phone number lacks a
 *      proper StatusCallback configuration in the Twilio console).
 *
 * Returns null when neither source provides a positive duration; caller should
 * leave the existing value untouched in that case.
 */
function computeFinalCallSeconds({ callDurationFromTwilio, isCompleted, callRow }) {
  const reported = Number(callDurationFromTwilio);
  if (Number.isFinite(reported) && reported > 0) return reported;

  if (!isCompleted || !callRow) return null;

  const recordCreatedAt =
    callRow.dataValues?.created_at ||
    callRow.dataValues?.createdAt  ||
    callRow.createdAt;
  if (!recordCreatedAt) return null;

  const elapsedSec = Math.max(0, Math.round(
    (Date.now() - new Date(recordCreatedAt).getTime()) / 1000
  ));
  return elapsedSec > 0 ? elapsedSec : null;
}

/**
 * Insert an `incoming_messages` row associated with an inbound call.
 * Tolerates a missing callId by no-op (we log the call body higher up).
 */
async function saveIncomingMessageRow({
  callId,
  audio = null,
  transcription = null,
  userType,
  status = "success"
}) {
  if (!callId) return null;
  return IncomingMessage.create({
    callId,
    audio,
    transcription,
    userType,
    status
  });
}

module.exports = {
  normalizePhoneForCallRow,
  findOrCreateCallBySid,
  touchCallSecondsFromSession,
  computeFinalCallSeconds,
  saveIncomingMessageRow
};
