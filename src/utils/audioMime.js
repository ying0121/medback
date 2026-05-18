/**
 * Detect audio MIME from raw base64 (used by admin call history playback).
 * @param {string|null|undefined} rawBase64
 * @returns {string}
 */
function detectAudioMimeFromBase64(rawBase64) {
  try {
    if (!rawBase64) return "audio/wav";
    const clean = String(rawBase64)
      .replace(/\s+/g, "")
      .replace(/-/g, "+")
      .replace(/_/g, "/");
    const padded = clean.padEnd(clean.length + ((4 - (clean.length % 4)) % 4), "=");
    const head = Buffer.from(padded.slice(0, 96), "base64");
    if (head.length >= 3 && head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
      return "audio/mpeg";
    }
    if (head.length >= 2 && head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
      return "audio/mpeg";
    }
    if (
      head.length >= 4 &&
      head[0] === 0x4f &&
      head[1] === 0x67 &&
      head[2] === 0x67 &&
      head[3] === 0x53
    ) {
      return "audio/ogg";
    }
    if (
      head.length >= 12 &&
      head[0] === 0x52 &&
      head[1] === 0x49 &&
      head[2] === 0x46 &&
      head[3] === 0x46 &&
      head[8] === 0x57 &&
      head[9] === 0x41 &&
      head[10] === 0x56 &&
      head[11] === 0x45
    ) {
      return "audio/wav";
    }
    return "audio/wav";
  } catch {
    return "audio/wav";
  }
}

module.exports = { detectAudioMimeFromBase64 };
