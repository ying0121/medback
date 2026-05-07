/**
 * Generates a gentle 440 Hz wait tone WAV buffer used while the inbound voice
 * bot is processing a caller's question.
 *
 * Why local generation instead of a static asset:
 *   - No external file dependency to deploy/manage.
 *   - We can tune the envelope, amplitude, and length in code.
 *   - Twilio fetches the buffer over HTTP from our own /wait-tone.wav endpoint.
 *
 * The encoded WAV is mono PCM 16-bit at 8 kHz — Twilio's narrowband phone
 * audio rate, so no resampling happens on Twilio's side and audio remains
 * artefact-free at low CPU cost.
 */

/**
 * @param {number} [durationSec=3]
 * @returns {Buffer} Mono PCM16 WAV with header.
 */
function buildGentleWaitToneWav(durationSec = 3) {
  const sampleRate = 8000;
  const numSamples = Math.ceil(sampleRate * durationSec);
  const dataBytes  = numSamples * 2;
  const buf = Buffer.alloc(44 + dataBytes);

  // RIFF/WAVE header (canonical PCM, mono, 16-bit, 8 kHz)
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16);                 // fmt chunk size
  buf.writeUInt16LE(1,  20);                 // PCM
  buf.writeUInt16LE(1,  22);                 // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);     // byte rate
  buf.writeUInt16LE(2,  32);                 // block align
  buf.writeUInt16LE(16, 34);                 // bits per sample
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(dataBytes, 40);

  // Tone shaping: A4 sine, gentle amplitude, soft ramps to avoid clicks.
  const FREQ      = 440;   // A4
  const AMP       = 0.22;  // headroom; never approaches 0 dBFS
  const FADE_IN   = 0.10;  // s
  const FADE_OUT  = 0.30;  // s

  for (let i = 0; i < numSamples; i++) {
    const t       = i / sampleRate;
    const fadeIn  = t < FADE_IN  ? t / FADE_IN  : 1.0;
    const fadeOut = t > durationSec - FADE_OUT ? (durationSec - t) / FADE_OUT : 1.0;
    const env     = Math.max(0, fadeIn * fadeOut) * AMP;
    const sample  = Math.round(Math.max(-32768, Math.min(32767,
      Math.sin(2 * Math.PI * FREQ * t) * env * 32767
    )));
    buf.writeInt16LE(sample, 44 + i * 2);
  }
  return buf;
}

/** Pre-built buffer reused across all inbound calls. */
const WAIT_TONE_WAV = buildGentleWaitToneWav(3);

module.exports = {
  buildGentleWaitToneWav,
  WAIT_TONE_WAV
};
