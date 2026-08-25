const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const KNOWLEDGE_UPLOAD_DIR = path.resolve(__dirname, "../../uploads/knowledge");

function ensureKnowledgeUploadDir() {
  fs.mkdirSync(KNOWLEDGE_UPLOAD_DIR, { recursive: true });
  return KNOWLEDGE_UPLOAD_DIR;
}

function sanitizeFilename(name = "") {
  const base = path.basename(String(name || "document")).replace(/[^\w.\-()+\s]/g, "_");
  return base.slice(0, 180) || "document";
}

/**
 * Persist an uploaded training document to disk.
 * @returns {{ documentName, documentPath, documentMime, documentSize }}
 */
function saveKnowledgeDocumentFile({ buffer, filename, mimeType }) {
  if (!buffer || !Buffer.isBuffer(buffer) || !buffer.length) {
    throw new Error("Uploaded file is empty.");
  }
  ensureKnowledgeUploadDir();
  const safeName = sanitizeFilename(filename);
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safeName}`;
  const absolute = path.join(KNOWLEDGE_UPLOAD_DIR, storedName);
  fs.writeFileSync(absolute, buffer);

  return {
    documentName: safeName,
    documentPath: storedName,
    documentMime: String(mimeType || "").slice(0, 128) || null,
    documentSize: buffer.length
  };
}

function resolveKnowledgeDocumentAbsolute(documentPath) {
  const name = path.basename(String(documentPath || ""));
  if (!name || name !== String(documentPath || "").replace(/^.*[\\/]/, "")) {
    return null;
  }
  const absolute = path.join(KNOWLEDGE_UPLOAD_DIR, name);
  if (!absolute.startsWith(KNOWLEDGE_UPLOAD_DIR)) return null;
  if (!fs.existsSync(absolute)) return null;
  return absolute;
}

function deleteKnowledgeDocumentFile(documentPath) {
  const absolute = resolveKnowledgeDocumentAbsolute(documentPath);
  if (!absolute) return false;
  try {
    fs.unlinkSync(absolute);
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  KNOWLEDGE_UPLOAD_DIR,
  ensureKnowledgeUploadDir,
  saveKnowledgeDocumentFile,
  resolveKnowledgeDocumentAbsolute,
  deleteKnowledgeDocumentFile
};
