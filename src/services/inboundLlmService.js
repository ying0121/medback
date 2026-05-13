/**
 * InboundLlmService
 *
 * Streams GPT responses sentence-by-sentence so TTS can start playing
 * the first sentence while the rest is still being generated.
 *
 * System prompt is assembled from:
 *   1. BOT_SYSTEM_PROMPT env var (or a sensible default)
 *   2. Clinic info block (from contextPromptService)
 *   3. Knowledge base block (from contextPromptService)
 *
 * Maintains multi-turn conversation history per call.
 */

const OpenAI = require("openai");

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
   * Stream a reply to userText, yielding one complete sentence at a time.
   * @param {string} userText
   * @returns {AsyncGenerator<string>}
   */
  async *streamReply(userText) {
    if (!userText?.trim()) return;

    this.history.push({ role: "user", content: userText });

    console.log(`[InboundLLM] streamReply start callSid=${this.callSid} text="${userText.slice(0, 80)}"`);

    const model =
      String(process.env.OPENAI_INBOUND_MODEL || process.env.OPENAI_MODEL || "").trim() ||
      "gpt-4o-mini";
    const maxTokens = parseInt(process.env.OPENAI_INBOUND_MAX_COMPLETION_TOKENS || "200");

    const stream = await this.client.chat.completions.create({
      model,
      stream: true,
      messages: [
        { role: "system", content: this.systemPrompt },
        ...this.history,
      ],
      temperature: 0.7,
      // gpt-5.x and other newer chat models reject max_tokens; use max_completion_tokens (same as openaiService.js).
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

        const sentences = splitIntoSentences(buffer);
        if (sentences.length > 1) {
          for (let i = 0; i < sentences.length - 1; i++) {
            const sentence = sentences[i].trim();
            if (sentence) {
              console.log(`[InboundLLM] yielding sentence callSid=${this.callSid} text="${sentence.slice(0, 80)}"`);
              yield sentence;
            }
          }
          buffer = sentences[sentences.length - 1];
        }
      }

      if (buffer.trim()) {
        console.log(`[InboundLLM] yielding final chunk callSid=${this.callSid} text="${buffer.trim().slice(0, 80)}"`);
        yield buffer.trim();
      }
    } finally {
      // Always push to history — even when the consumer breaks early (pipeline
      // cancelled).  Without this, the next turn has two consecutive user
      // messages which confuses the model.  A partial reply is better than
      // a missing one.
      if (fullReply.trim()) {
        this.history.push({ role: "assistant", content: fullReply });
      }
      console.log(`[InboundLLM] callSid=${this.callSid} reply="${fullReply.slice(0, 80)}" totalChars=${fullReply.length}`);
    }
  }

  clearHistory() {
    this.history = [];
  }
}

function splitIntoSentences(text) {
  return text.split(/(?<=[.!?])\s+/);
}

module.exports = { InboundLlmService };
