/**
 * Extract text from training uploads and turn it into clinic knowledge copy.
 */

const path = require("path");
const mammoth = require("mammoth");
const { analyzeDocumentForKnowledge } = require("./openaiService");

const MAX_SOURCE_CHARS = 48000;
const MAX_FILE_BYTES = 8 * 1024 * 1024;

const TEXT_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".html",
  ".htm",
  ".xml",
  ".rtf",
  ".log"
]);

function extensionOf(filename = "") {
  return path.extname(String(filename || "")).toLowerCase();
}

function isAllowedTrainingFile(filename = "", mimeType = "") {
  const ext = extensionOf(filename);
  const mime = String(mimeType || "").toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (ext === ".pdf" || mime.includes("pdf")) return true;
  if (ext === ".docx" || mime.includes("wordprocessingml") || mime.includes("msword")) return true;
  if (mime.startsWith("text/")) return true;
  return false;
}

async function extractPdfText(buffer) {
  const { PDFParse } = require("pdf-parse");
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    return String(result?.text || "").trim();
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractDocxText(buffer) {
  const result = await mammoth.extractRawText({ buffer });
  return String(result?.value || "").trim();
}

function extractPlainText(buffer) {
  return Buffer.from(buffer).toString("utf8").replace(/\u0000/g, "").trim();
}

async function extractTextFromUpload({ buffer, filename, mimeType }) {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new Error("Uploaded file is empty.");
  }
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error("File is too large. Maximum size is 8 MB.");
  }
  if (!isAllowedTrainingFile(filename, mimeType)) {
    throw new Error("Unsupported file type. Use TXT, MD, CSV, PDF, or DOCX.");
  }

  const ext = extensionOf(filename);
  const mime = String(mimeType || "").toLowerCase();
  let text = "";

  if (ext === ".pdf" || mime.includes("pdf")) {
    text = await extractPdfText(buffer);
  } else if (ext === ".docx" || mime.includes("wordprocessingml")) {
    text = await extractDocxText(buffer);
  } else if (ext === ".doc" || mime.includes("msword")) {
    throw new Error("Legacy .doc files are not supported. Please upload DOCX or PDF.");
  } else {
    text = extractPlainText(buffer);
  }

  text = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!text) {
    throw new Error("Could not extract readable text from this file.");
  }

  const truncated = text.length > MAX_SOURCE_CHARS;
  return {
    text: truncated ? text.slice(0, MAX_SOURCE_CHARS) : text,
    truncated,
    characterCount: text.length
  };
}

async function analyzeTrainingDocument({ buffer, filename, mimeType, clinicName = "" }) {
  const extracted = await extractTextFromUpload({ buffer, filename, mimeType });
  const knowledge = await analyzeDocumentForKnowledge({
    sourceText: extracted.text,
    filename,
    clinicName
  });

  return {
    knowledge,
    filename: String(filename || "document").trim() || "document",
    truncated: extracted.truncated,
    characterCount: extracted.characterCount
  };
}

module.exports = {
  MAX_FILE_BYTES,
  isAllowedTrainingFile,
  extractTextFromUpload,
  analyzeTrainingDocument
};
