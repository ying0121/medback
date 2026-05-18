/**
 * Short-lived in-memory cache for ElevenLabs MP3 buffers served via Twilio <Play>.
 *
 * Twilio dials the URL we hand it within a few seconds, so a 12-minute TTL is
 * plenty and the cache stays small. Entries are pruned lazily (on every
 * register) and on-demand read; no background timer is needed.
 *
 * Tokens are random 32-byte hex strings — unguessable so the URLs are safe to
 * expose publicly while the audio is in flight to Twilio.
 */

const crypto = require("crypto");

const TTL_MS = 12 * 60 * 1000;

const cache = new Map(); // token -> { buffer, expiresAt }

function pruneExpired() {
  const now = Date.now();
  for (const [token, entry] of cache.entries()) {
    if (entry.expiresAt < now) cache.delete(token);
  }
}

/** Store an MP3 buffer and return a URL-safe token to retrieve it later. */
function registerTtsPlayback(mp3Buffer) {
  pruneExpired();
  const token = crypto.randomBytes(32).toString("hex");
  cache.set(token, {
    buffer: mp3Buffer,
    expiresAt: Date.now() + TTL_MS
  });
  return token;
}

/** Look up a previously registered buffer by token. Returns null when missing/expired. */
function getTtsPlaybackBuffer(token) {
  const key = String(token || "");
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.buffer;
}

module.exports = {
  registerTtsPlayback,
  getTtsPlaybackBuffer
};
