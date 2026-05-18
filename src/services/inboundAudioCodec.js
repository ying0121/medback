/**
 * μ-law (G.711) helpers for inbound Media Streams.
 * Twilio sends 8 kHz μ-law; we decode to PCM and wrap as WAV for DB playback.
 */

const SAMPLE_RATE = 8000;

/** @type {Int16Array} ITU-T G.711 μ-law → linear PCM */
const MULAW_DECODE_TABLE = (() => {
  const table = new Int16Array(256);
  for (let i = 0; i < 256; i++) {
    let mu = ~i;
    const sign = mu & 0x80;
    const exponent = (mu >> 4) & 0x07;
    const mantissa = mu & 0x0f;
    let sample = ((mantissa << 3) + 0x84) << exponent;
    sample -= 0x84;
    table[i] = sign ? -sample : sample;
  }
  return table;
})();

/**
 * @param {Buffer|Uint8Array|null|undefined} mulawBuf
 * @returns {Buffer|null} 16-bit LE PCM
 */
function mulawToPcm(mulawBuf) {
  if (!mulawBuf?.length) return null;
  const pcm = Buffer.alloc(mulawBuf.length * 2);
  for (let i = 0; i < mulawBuf.length; i++) {
    pcm.writeInt16LE(MULAW_DECODE_TABLE[mulawBuf[i]], i * 2);
  }
  return pcm;
}

/**
 * @param {Buffer} pcm 16-bit LE mono
 * @param {number} sampleRate
 * @returns {Buffer}
 */
function pcmToWav(pcm, sampleRate = SAMPLE_RATE) {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * channels * (bitsPerSample / 8);
  const blockAlign = channels * (bitsPerSample / 8);
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * @param {Buffer|Uint8Array|null|undefined} mulawBuf
 * @returns {string|null} base64 WAV (no data: prefix)
 */
function mulawToWavBase64(mulawBuf) {
  const pcm = mulawToPcm(mulawBuf);
  if (!pcm) return null;
  return pcmToWav(pcm).toString("base64");
}

module.exports = {
  mulawToPcm,
  mulawToWavBase64
};
