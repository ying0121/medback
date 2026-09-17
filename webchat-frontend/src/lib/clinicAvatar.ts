import { getEmbedConfig } from "@/lib/embedConfig";

/** Default avatar served from the CDN static folder (`/cdn/medi-bot.png`). */
export const getDefaultClinicAvatarUrl = (): string => {
  const { cdnBaseUrl } = getEmbedConfig();
  return `${cdnBaseUrl.replace(/\/+$/, "")}/medi-bot.png`;
};

export const DEFAULT_CLINIC_AVATAR_URL = "/cdn/medi-bot.png";

const pickField = (parsed: Record<string, unknown>, keys: string[]): unknown => {
  for (const key of keys) {
    const topLevel = parsed[key];
    if (topLevel !== undefined && topLevel !== null && topLevel !== "") {
      return topLevel;
    }
    const nested = parsed.data;
    if (nested && typeof nested === "object") {
      const nestedValue = (nested as Record<string, unknown>)[key];
      if (nestedValue !== undefined && nestedValue !== null && nestedValue !== "") {
        return nestedValue;
      }
    }
  }
  return undefined;
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

/** Builds a displayable image URL from backend avatar fields (base64, data URL, or http URL). */
export const resolveClinicAvatarUrl = (rawPayload: unknown): string | null => {
  if (!rawPayload || typeof rawPayload !== "object") return null;

  const parsed = rawPayload as Record<string, unknown>;
  const directUrl = pickField(parsed, ["avatarUrl", "avatar_url", "avatarURL", "imageUrl", "image_url"]);
  if (typeof directUrl === "string") {
    const trimmed = directUrl.trim();
    if (isHttpUrl(trimmed) || trimmed.startsWith("data:image/")) {
      return trimmed;
    }
  }

  const imageData = pickField(parsed, [
    "avatar",
    "avatarBase64",
    "avatar_base64",
    "image",
    "imageData",
    "image_data",
    "avatarImage",
    "avatar_image",
  ]);
  if (typeof imageData !== "string" || !imageData.trim()) {
    return null;
  }

  const raw = imageData.trim();
  if (raw.startsWith("data:image/")) {
    return raw;
  }
  if (isHttpUrl(raw)) {
    return raw;
  }

  const mime =
    (pickField(parsed, ["avatarMimeType", "avatar_mime_type", "imageMimeType", "image_mime_type", "mimeType", "mime_type"]) as
      | string
      | undefined) ?? "image/png";

  const normalizedMime = mime.includes("/") ? mime : `image/${mime}`;
  const base64 = raw.replace(/^data:.*;base64,/, "");
  return `data:${normalizedMime};base64,${base64}`;
};

export const getClinicAvatarDisplayUrl = (avatarUrl: string | null | undefined): string => {
  return avatarUrl?.trim() || getDefaultClinicAvatarUrl();
};
