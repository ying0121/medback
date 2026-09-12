/**
 * Lightweight IP privacy hints (VPN / proxy / hosting).
 * Uses ip-api.com free endpoint with an in-memory cache.
 * This flags the *seen* IP — it cannot recover a user's IP behind a VPN.
 */

const http = require("http");

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const LOOKUP_TIMEOUT_MS = 1500;
const cache = new Map();

function cacheGet(ip) {
  const hit = cache.get(ip);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(ip);
    return null;
  }
  return hit.value;
}

function cacheSet(ip, value) {
  cache.set(ip, { at: Date.now(), value });
  if (cache.size > 5000) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function emptyFlags() {
  return { ipIsProxy: false, ipIsHosting: false, ipPrivacySource: null };
}

/**
 * @param {string|null} ip
 * @returns {Promise<{ ipIsProxy: boolean, ipIsHosting: boolean, ipPrivacySource: string|null }>}
 */
async function lookupIpPrivacy(ip) {
  const address = String(ip || "").trim();
  if (!address) return emptyFlags();
  if (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "localhost" ||
    /^10\./.test(address) ||
    /^192\.168\./.test(address) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(address)
  ) {
    return emptyFlags();
  }

  const cached = cacheGet(address);
  if (cached) return cached;

  const result = await new Promise((resolve) => {
    const url = `http://ip-api.com/json/${encodeURIComponent(address)}?fields=status,proxy,hosting,query`;
    const req = http.get(url, { timeout: LOOKUP_TIMEOUT_MS }, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
        if (body.length > 4000) {
          req.destroy();
          resolve(emptyFlags());
        }
      });
      res.on("end", () => {
        try {
          const data = JSON.parse(body);
          if (data?.status !== "success") {
            resolve(emptyFlags());
            return;
          }
          resolve({
            ipIsProxy: Boolean(data.proxy),
            ipIsHosting: Boolean(data.hosting),
            ipPrivacySource: "ip-api"
          });
        } catch {
          resolve(emptyFlags());
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(emptyFlags());
    });
    req.on("error", () => resolve(emptyFlags()));
  });

  cacheSet(address, result);
  return result;
}

module.exports = {
  lookupIpPrivacy
};
