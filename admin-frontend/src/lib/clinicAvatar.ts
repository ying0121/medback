/** Stored avatar is scaled to fit within this box. */
const AVATAR_MAX_PX = 250;
/** Uploads larger than this (either side) are rejected. */
const AVATAR_MAX_UPLOAD_PX = 300;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not read image file."));
    img.src = src;
  });
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.readAsDataURL(file);
  });
}

/**
 * Resize image to fit within 250×250 and return a JPEG data URL for storage.
 */
export async function processClinicAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error("Image file is too large (max 5 MB before resize).");
  }

  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  if (img.width > AVATAR_MAX_UPLOAD_PX || img.height > AVATAR_MAX_UPLOAD_PX) {
    throw new Error(
      `Image is too large (${img.width}×${img.height}). Maximum allowed size is ${AVATAR_MAX_UPLOAD_PX}×${AVATAR_MAX_UPLOAD_PX} pixels.`
    );
  }

  const scale = Math.min(1, AVATAR_MAX_PX / img.width, AVATAR_MAX_PX / img.height);
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process image.");

  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL("image/jpeg", 0.88);
}

export const CLINIC_AVATAR_MAX_PX = AVATAR_MAX_PX;
export const CLINIC_AVATAR_MAX_UPLOAD_PX = AVATAR_MAX_UPLOAD_PX;
