const crypto = require("crypto");

function rotl(x, n) {
  return ((x << n) | (x >>> (32 - n))) >>> 0;
}

function toUtf8Bytes(input) {
  return Buffer.from(input, "utf8");
}

function md4Hex(input) {
  const message = toUtf8Bytes(input);
  const bitLen = message.length * 8;
  const withOne = message.length + 1;
  const padLen = (56 - (withOne % 64) + 64) % 64;
  const totalLen = withOne + padLen + 8;
  const buffer = Buffer.alloc(totalLen, 0);

  message.copy(buffer, 0);
  buffer[message.length] = 0x80;
  buffer.writeUInt32LE(bitLen >>> 0, totalLen - 8);
  buffer.writeUInt32LE(Math.floor(bitLen / 0x100000000), totalLen - 4);

  let a = 0x67452301;
  let b = 0xefcdab89;
  let c = 0x98badcfe;
  let d = 0x10325476;

  const f = (x, y, z) => (x & y) | (~x & z);
  const g = (x, y, z) => (x & y) | (x & z) | (y & z);
  const h = (x, y, z) => x ^ y ^ z;

  for (let i = 0; i < totalLen; i += 64) {
    const x = new Array(16);
    for (let j = 0; j < 16; j += 1) {
      x[j] = buffer.readUInt32LE(i + j * 4);
    }

    const aa = a;
    const bb = b;
    const cc = c;
    const dd = d;

    a = rotl((a + f(b, c, d) + x[0]) >>> 0, 3);
    d = rotl((d + f(a, b, c) + x[1]) >>> 0, 7);
    c = rotl((c + f(d, a, b) + x[2]) >>> 0, 11);
    b = rotl((b + f(c, d, a) + x[3]) >>> 0, 19);
    a = rotl((a + f(b, c, d) + x[4]) >>> 0, 3);
    d = rotl((d + f(a, b, c) + x[5]) >>> 0, 7);
    c = rotl((c + f(d, a, b) + x[6]) >>> 0, 11);
    b = rotl((b + f(c, d, a) + x[7]) >>> 0, 19);
    a = rotl((a + f(b, c, d) + x[8]) >>> 0, 3);
    d = rotl((d + f(a, b, c) + x[9]) >>> 0, 7);
    c = rotl((c + f(d, a, b) + x[10]) >>> 0, 11);
    b = rotl((b + f(c, d, a) + x[11]) >>> 0, 19);
    a = rotl((a + f(b, c, d) + x[12]) >>> 0, 3);
    d = rotl((d + f(a, b, c) + x[13]) >>> 0, 7);
    c = rotl((c + f(d, a, b) + x[14]) >>> 0, 11);
    b = rotl((b + f(c, d, a) + x[15]) >>> 0, 19);

    a = rotl((a + g(b, c, d) + x[0] + 0x5a827999) >>> 0, 3);
    d = rotl((d + g(a, b, c) + x[4] + 0x5a827999) >>> 0, 5);
    c = rotl((c + g(d, a, b) + x[8] + 0x5a827999) >>> 0, 9);
    b = rotl((b + g(c, d, a) + x[12] + 0x5a827999) >>> 0, 13);
    a = rotl((a + g(b, c, d) + x[1] + 0x5a827999) >>> 0, 3);
    d = rotl((d + g(a, b, c) + x[5] + 0x5a827999) >>> 0, 5);
    c = rotl((c + g(d, a, b) + x[9] + 0x5a827999) >>> 0, 9);
    b = rotl((b + g(c, d, a) + x[13] + 0x5a827999) >>> 0, 13);
    a = rotl((a + g(b, c, d) + x[2] + 0x5a827999) >>> 0, 3);
    d = rotl((d + g(a, b, c) + x[6] + 0x5a827999) >>> 0, 5);
    c = rotl((c + g(d, a, b) + x[10] + 0x5a827999) >>> 0, 9);
    b = rotl((b + g(c, d, a) + x[14] + 0x5a827999) >>> 0, 13);
    a = rotl((a + g(b, c, d) + x[3] + 0x5a827999) >>> 0, 3);
    d = rotl((d + g(a, b, c) + x[7] + 0x5a827999) >>> 0, 5);
    c = rotl((c + g(d, a, b) + x[11] + 0x5a827999) >>> 0, 9);
    b = rotl((b + g(c, d, a) + x[15] + 0x5a827999) >>> 0, 13);

    a = rotl((a + h(b, c, d) + x[0] + 0x6ed9eba1) >>> 0, 3);
    d = rotl((d + h(a, b, c) + x[8] + 0x6ed9eba1) >>> 0, 9);
    c = rotl((c + h(d, a, b) + x[4] + 0x6ed9eba1) >>> 0, 11);
    b = rotl((b + h(c, d, a) + x[12] + 0x6ed9eba1) >>> 0, 15);
    a = rotl((a + h(b, c, d) + x[2] + 0x6ed9eba1) >>> 0, 3);
    d = rotl((d + h(a, b, c) + x[10] + 0x6ed9eba1) >>> 0, 9);
    c = rotl((c + h(d, a, b) + x[6] + 0x6ed9eba1) >>> 0, 11);
    b = rotl((b + h(c, d, a) + x[14] + 0x6ed9eba1) >>> 0, 15);
    a = rotl((a + h(b, c, d) + x[1] + 0x6ed9eba1) >>> 0, 3);
    d = rotl((d + h(a, b, c) + x[9] + 0x6ed9eba1) >>> 0, 9);
    c = rotl((c + h(d, a, b) + x[5] + 0x6ed9eba1) >>> 0, 11);
    b = rotl((b + h(c, d, a) + x[13] + 0x6ed9eba1) >>> 0, 15);
    a = rotl((a + h(b, c, d) + x[3] + 0x6ed9eba1) >>> 0, 3);
    d = rotl((d + h(a, b, c) + x[11] + 0x6ed9eba1) >>> 0, 9);
    c = rotl((c + h(d, a, b) + x[7] + 0x6ed9eba1) >>> 0, 11);
    b = rotl((b + h(c, d, a) + x[15] + 0x6ed9eba1) >>> 0, 15);

    a = (a + aa) >>> 0;
    b = (b + bb) >>> 0;
    c = (c + cc) >>> 0;
    d = (d + dd) >>> 0;
  }

  const out = Buffer.alloc(16);
  out.writeUInt32LE(a, 0);
  out.writeUInt32LE(b, 4);
  out.writeUInt32LE(c, 8);
  out.writeUInt32LE(d, 12);
  return out.toString("hex");
}

function encodePassword(rawPassword) {
  const input = String(rawPassword ?? "");
  const md4Hash = md4Hex(input);
  const md5Hash = crypto.createHash("md5").update(md4Hash).digest("hex");
  const sha256Hash = crypto.createHash("sha256").update(md5Hash).digest("hex");
  return sha256Hash;
}

module.exports = { encodePassword };
