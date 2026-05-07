const OpenAI = require("openai");
const { toFile } = require("openai/uploads");

const openaiApiKey = process.env.OPENAI_API_KEY || "";
const openaiModel = process.env.OPENAI_MODEL || "gpt-5.4-mini";
const defaultSystemPrompt = process.env.OPENAI_SYSTEM_PROMPT || "You are my medical assistant. Respond clearly with a professional tone, focusing on medical support and service-related questions.";
const voiceSystemPrompt = process.env.OPENAI_SYSTEM_PROMPT || defaultSystemPrompt;
const openaiTranscriptionModel = process.env.OPENAI_TRANSCRIPTION_MODEL || "gpt-5.4-mini-transcribe";
const openaiTtsModel = process.env.OPENAI_TTS_MODEL || "gpt-5.4-mini-tts";
const openaiTtsVoice = process.env.OPENAI_TTS_VOICE || "alloy";
const openaiTtsFormat = process.env.OPENAI_TTS_FORMAT || "mp3";
const openaiMaxCompletionTokens = Number(process.env.OPENAI_MAX_COMPLETION_TOKENS || 700);
const openaiInboundModel = String(process.env.OPENAI_INBOUND_MODEL || "").trim() || openaiModel;
const openaiInboundMaxCompletionTokens = Number(process.env.OPENAI_INBOUND_MAX_COMPLETION_TOKENS || 360);
const inboundLanguageDetectionSystemPrompt = [
  process.env.OPENAI_SYSTEM_PROMPT,
  "You are a language-detection helper for a phone voice assistant.",
  "Your only job: infer the human language of the caller transcript (any script).",
  "Output JSON only, no markdown, exactly this shape:",
  '{"iso_639_1":"en","english_name":"English","twilio_bcp47":"en-US","twilio_voice":"Polly.Joanna-Neural"}',
  "Fields:",
  "- iso_639_1: two-letter ISO 639-1 code.",
  "- english_name: language name in English (e.g. Korean, Japanese).",
  "- twilio_bcp47: one BCP-47 locale for Twilio <Gather language> (single value).",
  "- twilio_voice: one Twilio Amazon Polly voice id matching that locale, e.g.",
  "  en-US Polly.Joanna-Neural, ko-KR Polly.Seoyeon-Neural, ja-JP Polly.Mizuki, zh-CN Polly.Zhiyu,",
  "  es-ES Polly.Lucia-Neural, fr-FR Polly.Lea-Neural, de-DE Polly.Vicki-Neural, pt-BR Polly.Camila-Neural,",
  "  hi-IN Polly.Aditi, ar-AE Polly.Zeina. If unsure, pick the closest supported Polly Neural voice."
].join(" ");

const client = new OpenAI({ apiKey: openaiApiKey });

async function generateAssistantReply(messages, options = {}) {
  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const model = options.model || openaiModel;
  const maxTok =
    typeof options.maxCompletionTokens === "number" && Number.isFinite(options.maxCompletionTokens)
      ? options.maxCompletionTokens
      : openaiMaxCompletionTokens;
  const systemPrompt = defaultSystemPrompt;
  const clinicPrompt = options.clinicPrompt || null;
  const knowledgePrompt = options.knowledgePrompt || null;
  const systemMessages = [
    {
      role: "system",
      content: systemPrompt
    }
  ];
  if (clinicPrompt) {
    systemMessages.push({
      role: "system",
      content: clinicPrompt
    });
  }
  if (knowledgePrompt) {
    systemMessages.push({
      role: "system",
      content: knowledgePrompt
    });
  }
  if (options.languageConstraint) {
    systemMessages.push({
      role: "system",
      content: String(options.languageConstraint)
    });
  }

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    max_completion_tokens: maxTok,
    messages: [
      ...systemMessages,
      ...messages
    ]
  });

  return completion.choices?.[0]?.message?.content || "No response generated.";
}

const inboundMergedJsonPrompt = [
  process.env.OPENAI_SYSTEM_PROMPT,
  "You are answering a live phone caller (PSTN). Be fast and concise.",
  "The conversation messages include the caller's latest utterance.",
  "Output exactly one JSON object (no markdown, no code fences) with keys:",
  "iso_639_1, english_name, twilio_bcp47, twilio_voice, reply, end_call",
  "- iso_639_1: two-letter ISO 639-1 code of the language the caller used in their last message.",
  "- english_name: that language's name in English (e.g. Korean, Spanish).",
  "- twilio_bcp47: one BCP-47 locale for Twilio speech (e.g. en-US, ko-KR, es-ES).",
  "- twilio_voice: one Twilio Amazon Polly Neural voice id matching that locale, e.g.",
  "  en-US Polly.Joanna-Neural, ko-KR Polly.Seoyeon-Neural, ja-JP Polly.Mizuki, zh-CN Polly.Zhiyu,",
  "  es-ES Polly.Lucia-Neural, fr-FR Polly.Lea-Neural, de-DE Polly.Vicki-Neural, pt-BR Polly.Camila-Neural,",
  "  hi-IN Polly.Aditi, ar-AE Polly.Zeina. If unsure, pick closest Polly Neural.",
  "- reply: your helpful answer in the SAME language as the caller. Plain text only.",
  "  Keep reply very short for telephony (1–3 short sentences; max ~400 characters) unless a medical safety detail requires slightly more.",
  "- end_call: boolean. Set true ONLY when the caller clearly wants to finish the call",
  "  (e.g. goodbye, bye, hang up, end call, I'm done, 끊을게요, 통화 종료, 終わります, etc.).",
  "  When end_call is true, set reply to a warm short farewell in the caller's language.",
  "  Otherwise always set end_call to false."
].join("\n");

/**
 * One LLM round-trip: language/Twilio gather hints + assistant reply (faster than detect + reply).
 * @returns {Promise<{ iso_639_1: string, english_name: string, twilio_bcp47: string, twilio_voice: string, reply: string }>}
 */
async function generateInboundMergedTurn(messages, options = {}) {
  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const clinicPrompt = options.clinicPrompt || null;
  const knowledgePrompt = options.knowledgePrompt || null;
  const systemMessages = [
    { role: "system", content: defaultSystemPrompt },
    ...(clinicPrompt ? [{ role: "system", content: clinicPrompt }] : []),
    ...(knowledgePrompt ? [{ role: "system", content: knowledgePrompt }] : []),
    { role: "system", content: inboundMergedJsonPrompt }
  ];

  const completion = await client.chat.completions.create({
    model: openaiInboundModel,
    temperature: 0.3,
    max_completion_tokens: openaiInboundMaxCompletionTokens,
    messages: [...systemMessages, ...messages]
  });

  const raw = String(completion.choices?.[0]?.message?.content || "").trim();
  const fallback = {
    iso_639_1: "en",
    english_name: "English",
    twilio_bcp47: "en-US",
    twilio_voice: "Polly.Joanna-Neural",
    reply: "Sorry, I could not process that. Could you repeat your question?"
  };
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    const reply = String(parsed.reply || parsed.answer || "").trim();
    const twilio_bcp47 = String(parsed.twilio_bcp47 || parsed.twilioBcp47 || "").trim();
    const twilio_voice = String(parsed.twilio_voice || parsed.twilioVoice || "").trim();
    const english_name = String(parsed.english_name || parsed.englishName || "English").trim();
    const iso_639_1 = String(parsed.iso_639_1 || parsed.iso6391 || "en").trim();
    const end_call = parsed.end_call === true;
    if (!reply || !twilio_bcp47 || !twilio_voice) return fallback;
    return { iso_639_1, english_name, twilio_bcp47, twilio_voice, reply, end_call };
  } catch {
    return fallback;
  }
}

/**
 * Detect caller language from transcribed speech (Twilio SpeechResult or any text).
 * Returns Twilio-friendly BCP-47 + Amazon Polly voice for <Say> / <Gather language>.
 */
async function detectInboundSpeechLanguage(userText) {
  const fallback = {
    iso_639_1: "en",
    english_name: "English",
    twilio_bcp47: "en-US",
    twilio_voice: "Polly.Joanna-Neural"
  };
  if (!openaiApiKey || !String(userText || "").trim()) {
    return fallback;
  }

  const completion = await client.chat.completions.create({
    model: openaiModel,
    temperature: 0,
    max_completion_tokens: 200,
    messages: [
      {
        role: "system",
        content: defaultSystemPrompt
      },
      {
        role: "system",
        content: inboundLanguageDetectionSystemPrompt
      },
      { role: "user", content: String(userText).trim().slice(0, 2000) }
    ]
  });

  const raw = String(completion.choices?.[0]?.message?.content || "").trim();
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    const twilio_bcp47 = String(parsed.twilio_bcp47 || parsed.twilioBcp47 || "").trim();
    const twilio_voice = String(parsed.twilio_voice || parsed.twilioVoice || "").trim();
    const english_name = String(parsed.english_name || parsed.englishName || "that language").trim();
    const iso_639_1 = String(parsed.iso_639_1 || parsed.iso6391 || "en").trim();
    if (!twilio_bcp47 || !twilio_voice) return fallback;
    return { iso_639_1, english_name, twilio_bcp47, twilio_voice };
  } catch {
    return fallback;
  }
}

async function detectInboundEndCallIntent({ text, clinicPrompt = null, knowledgePrompt = null }) {
  if (!text || !String(text).trim()) return false;
  if (!openaiApiKey) return false;

  const endCallPrompt = [
    "Classify whether the caller clearly wants to finish the phone call right now.",
    "Return JSON only: {\"end_call\": true|false}.",
    "Set true only for explicit ending intent (goodbye, bye, hang up, end call, I'm done, etc.).",
    "If the user is asking a question, requesting info, or continuing the conversation, set false."
  ].join(" ");

  const completion = await client.chat.completions.create({
    model: openaiInboundModel,
    temperature: 0,
    max_completion_tokens: 16,
    messages: [
      { role: "system", content: endCallPrompt },
      ...(clinicPrompt ? [{ role: "system", content: clinicPrompt }] : []),
      ...(knowledgePrompt ? [{ role: "system", content: knowledgePrompt }] : []),
      { role: "user", content: String(text).trim().slice(0, 1000) }
    ]
  });

  const raw = String(completion.choices?.[0]?.message?.content || "").trim();
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : raw);
    return parsed?.end_call === true;
  } catch {
    const lower = raw.toLowerCase();
    if (/\btrue\b/.test(lower)) return true;
    if (/\bfalse\b/.test(lower)) return false;
    return false;
  }
}

async function detectTwilioIntent({ text, clinicPrompt = null, knowledgePrompt = null }) {
  if (!text || !String(text).trim()) return false;
  if (!openaiApiKey) return false;

  const intentPrompt = [
    "Classify if the user is asking for a live phone call.",
    "Reply with exactly one word: twilio or normal.",
    "Choose twilio only when user explicitly asks to call, phone call, ring me, talk by phone, or similar."
  ].join(" ");

  const completion = await client.chat.completions.create({
    model: openaiModel,
    temperature: 0,
    max_completion_tokens: 8,
    messages: [
      { role: "system", content: intentPrompt },
      ...(clinicPrompt ? [{ role: "system", content: clinicPrompt }] : []),
      ...(knowledgePrompt ? [{ role: "system", content: knowledgePrompt }] : []),
      { role: "user", content: String(text).trim() }
    ]
  });

  const result = String(completion.choices?.[0]?.message?.content || "")
    .trim()
    .toLowerCase();
  return result.includes("twilio");
}

function parseMimeType(mimeType) {
  if (!mimeType || typeof mimeType !== "string") {
    return { extension: "webm" };
  }

  const mime = mimeType.toLowerCase();
  if (mime.includes("mpeg") || mime.includes("mp3")) {
    return { extension: "mp3" };
  }
  if (mime.includes("wav")) {
    return { extension: "wav" };
  }
  if (mime.includes("ogg")) {
    return { extension: "ogg" };
  }
  if (mime.includes("m4a") || mime.includes("mp4")) {
    return { extension: "m4a" };
  }
  return { extension: "webm" };
}

async function generateVoiceReply({
  messages,
  audioBase64,
  audioMimeType,
  clinicPrompt = null,
  knowledgePrompt = null,
  voice = openaiTtsVoice
}) {
  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  if (!audioBase64) {
    throw new Error("Missing voice audio data.");
  }

  const { extension } = parseMimeType(audioMimeType);
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const audioFile = await toFile(audioBuffer, `voice-input.${extension}`);

  const transcriptResult = await client.audio.transcriptions.create({
    file: audioFile,
    model: openaiTranscriptionModel
  });
  const transcriptText = transcriptResult?.text?.trim();

  if (!transcriptText) {
    throw new Error("Failed to transcribe incoming audio.");
  }

  const assistantText = await generateAssistantReply(
    [...messages, { role: "user", content: transcriptText }],
    {
      systemPrompt: voiceSystemPrompt,
      clinicPrompt,
      knowledgePrompt
    }
  );

  const speechResponse = await client.audio.speech.create({
    model: openaiTtsModel,
    voice,
    format: openaiTtsFormat,
    input: assistantText
  });
  const speechArrayBuffer = await speechResponse.arrayBuffer();
  const generatedAudioBase64 = Buffer.from(speechArrayBuffer).toString("base64");

  return {
    transcriptText,
    assistantText,
    audioBase64: generatedAudioBase64,
    audioMimeType: `audio/${openaiTtsFormat}`
  };
}

async function transcribeAudioBase64({ audioBase64, audioMimeType }) {
  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  if (!audioBase64) {
    throw new Error("Missing voice audio data.");
  }

  const { extension } = parseMimeType(audioMimeType);
  const audioBuffer = Buffer.from(audioBase64, "base64");
  const audioFile = await toFile(audioBuffer, `voice-input.${extension}`);
  const transcriptResult = await client.audio.transcriptions.create({
    file: audioFile,
    model: openaiTranscriptionModel
  });
  const transcriptText = transcriptResult?.text?.trim();
  if (!transcriptText) {
    throw new Error("Failed to transcribe incoming audio.");
  }
  return transcriptText;
}

async function generateSpeechFromText({ text, voice = openaiTtsVoice }) {
  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const speechResponse = await client.audio.speech.create({
    model: openaiTtsModel,
    voice,
    format: openaiTtsFormat,
    input: text
  });
  const speechArrayBuffer = await speechResponse.arrayBuffer();
  return {
    audioBase64: Buffer.from(speechArrayBuffer).toString("base64"),
    audioMimeType: `audio/${openaiTtsFormat}`
  };
}

module.exports = {
  generateAssistantReply,
  generateInboundMergedTurn,
  generateVoiceReply,
  detectTwilioIntent,
  detectInboundSpeechLanguage,
  detectInboundEndCallIntent,
  transcribeAudioBase64,
  generateSpeechFromText
};
