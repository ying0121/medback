const MAX_AVATAR_DATA_URL_LENGTH = 500_000;

/**
 * Parse avatar from admin clinic create/update body.
 * @returns {string|null|undefined} undefined = omit from update payload
 */
function parseClinicAvatar(body) {
  if (!body || !Object.prototype.hasOwnProperty.call(body, "avatar")) {
    return undefined;
  }

  const raw = body.avatar;
  if (raw === null || raw === undefined || raw === "") {
    return null;
  }

  const value = String(raw).trim();
  if (!value) return null;

  if (!/^data:image\/(jpeg|jpg|png|gif|webp);base64,/i.test(value)) {
    throw new Error("avatar must be a JPEG, PNG, GIF, or WebP data URL.");
  }

  if (value.length > MAX_AVATAR_DATA_URL_LENGTH) {
    throw new Error("avatar image is too large (max 250×250 recommended).");
  }

  return value;
}

module.exports = { parseClinicAvatar, MAX_AVATAR_DATA_URL_LENGTH };
