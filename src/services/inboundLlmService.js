/**
 * InboundLlmService
 *
 * Streams GPT responses in small speakable segments so TTS can start before
 * the model finishes the full reply (lower time-to-first-audio).
 *
 * System prompt is assembled from:
 *   1. BOT_SYSTEM_PROMPT env var (or a sensible default)
 *   2. Clinic info block (from contextPromptService)
 *   3. Knowledge base block (from contextPromptService)
 *
 * Maintains multi-turn conversation history per call.
 */

const OpenAI = require("openai");

const MIN_TTS_CHARS = Math.max(
  12,
  parseInt(process.env.INBOUND_TTS_MIN_CHARS || "28", 10)
);
const MAX_TTS_CHARS = Math.max(
  MIN_TTS_CHARS + 10,
  parseInt(process.env.INBOUND_TTS_MAX_CHARS || "100", 10)
);

class InboundLlmService {
  /**
   * @param {string} callSid
   * @param {{ clinicPrompt: string|null, knowledgePrompt: string|null }} context
   */
  constructor(callSid, { clinicPrompt, knowledgePrompt } = {}) {
    this.callSid = callSid;
    this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.history = [];

    const base =
      String(process.env.BOT_SYSTEM_PROMPT || "").trim() ||
      "You are a friendly, concise medical office voice assistant. " +
        "Keep replies under 3 sentences. Speak naturally — no markdown, no lists, no special characters.";

    const parts = [base];
    if (clinicPrompt) parts.push(clinicPrompt);
    if (knowledgePrompt) parts.push(knowledgePrompt);
    this.systemPrompt = parts.join("\n\n");
  }

  /**
   * Stream a reply to userText, yielding speakable segments (phrases / sentences).
   * @param {string} userText
   * @returns {AsyncGenerator<string>}
   */
  async *streamReply(userText) {
    if (!userText?.trim()) return;

    this.history.push({ role: "user", content: userText });

    const model =
      String(process.env.OPENAI_INBOUND_MODEL || process.env.OPENAI_MODEL || "").trim() ||
      "gpt-4o-mini";
    const maxTokens = parseInt(process.env.OPENAI_INBOUND_MAX_COMPLETION_TOKENS || "150", 10);
    const temperature = Number(process.env.OPENAI_INBOUND_TEMPERATURE || "0.6");

    const stream = await this.client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: "system", content: this.systemPrompt },
        ...this.history,
      ],
      temperature: Number.isFinite(temperature) ? temperature : 0.6,
      max_completion_tokens: maxTokens,
    });

    let buffer = "";
    let fullReply = "";

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? "";
        if (!delta) continue;

        buffer += delta;
        fullReply += delta;

        let cut;
        while ((cut = findTtsChunkCut(buffer))) {
          const { chunk: segment, rest } = cut;
          buffer = rest;
          if (segment) {
            yield segment;
          }
        }
      }

      const tail = findTtsChunkCut(buffer, true);
      if (tail?.chunk) {
        yield tail.chunk;
      }
    } finally {
      if (fullReply.trim()) {
        this.history.push({ role: "assistant", content: fullReply });
      }
    }
  }

  clearHistory() {
    this.history = [];
  }
}

/**
 * Find the next speakable chunk in the LLM buffer (word/phrase boundaries, not
 * only full sentences) so ElevenLabs can start sooner.
 * @param {string} buffer
 * @param {boolean} [forceEnd]
 * @returns {{ chunk: string, rest: string }|null}
 */
function findTtsChunkCut(buffer, forceEnd = false) {
  const trimmed = buffer.trimStart();
  if (!trimmed) return null;

  if (!forceEnd && trimmed.length < MIN_TTS_CHARS) return null;

  const sentenceMatch = trimmed.match(/^(.+?[.!?])(?:\s+|$)/s);
  if (sentenceMatch && sentenceMatch[1].trim().length >= MIN_TTS_CHARS) {
    return {
      chunk: sentenceMatch[1].trim(),
      rest: trimmed.slice(sentenceMatch[0].length),
    };
  }

  if (trimmed.length >= MAX_TTS_CHARS) {
    const window = trimmed.slice(0, MAX_TTS_CHARS);
    let space = window.lastIndexOf(" ");
    if (space < MIN_TTS_CHARS) space = MAX_TTS_CHARS;
    return {
      chunk: trimmed.slice(0, space).trim(),
      rest: trimmed.slice(space).trimStart(),
    };
  }

  if (!forceEnd && trimmed.length >= MIN_TTS_CHARS) {
    const window = trimmed.slice(0, Math.min(trimmed.length, MAX_TTS_CHARS));
    const space = window.lastIndexOf(" ");
    if (space >= MIN_TTS_CHARS - 1) {
      return {
        chunk: window.slice(0, space).trim(),
        rest: trimmed.slice(space).trimStart(),
      };
    }
  }

  if (forceEnd) {
    return { chunk: trimmed.trim(), rest: "" };
  }

  return null;
}

module.exports = { InboundLlmService, findTtsChunkCut, MIN_TTS_CHARS, MAX_TTS_CHARS };
