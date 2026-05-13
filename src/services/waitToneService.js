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
 *
 * For Media Streams (outbound μ-law over WebSocket), use {@link pcm16LeWavToMulaw}
 * on {@link WAIT_TONE_WAV} to get {@link WAIT_TONE_MULAW}.
 */

/**
 * ITU-T G.711 μ-law encode of one PCM16 sample.
 * @param {number} sample signed int16
 * @returns {number} 0–255
 */
function encodeMuLawSample(sample) {
  const MULAW_MAX = 0x1fff;
  const MULAW_BIAS = 33;
  let sign = (sample >> 8) & 0x80;
  if (sign !== 0) sample = -sample;
  if (sample > MULAW_MAX) sample = MULAW_MAX;
  sample += MULAW_BIAS;
  let exponent = 7;
  for (let expMask = 0x4000; (sample & expMask) === 0 && exponent > 0; exponent--, expMask >>= 1) {
    /* find segment */
  }
  const mantissa = (sample >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

/**
 * Convert mono PCM16 LE WAV (canonical 44-byte header) to raw μ-law @ 8 kHz.
 * @param {Buffer} wavBuffer
 * @returns {Buffer}
 */
function pcm16LeWavToMulaw(wavBuffer) {
  if (!Buffer.isBuffer(wavBuffer) || wavBuffer.length < 44) return Buffer.alloc(0);
  const dataOffset = 44;
  const byteLen = wavBuffer.length - dataOffset;
  const n = Math.floor(byteLen / 2);
  const out = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    out[i] = encodeMuLawSample(wavBuffer.readInt16LE(dataOffset + i * 2));
  }
  return out;
}

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

/** Same tone as raw μ-law 8 kHz for Twilio Media Stream `media` outbound payloads. */
const WAIT_TONE_MULAW = pcm16LeWavToMulaw(WAIT_TONE_WAV);

module.exports = {
  buildGentleWaitToneWav,
  WAIT_TONE_WAV,
  pcm16LeWavToMulaw,
  encodeMuLawSample,
  WAIT_TONE_MULAW
};
