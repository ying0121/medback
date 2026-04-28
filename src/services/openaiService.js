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

const client = new OpenAI({ apiKey: openaiApiKey });

async function generateAssistantReply(messages, options = {}) {
  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const model = openaiModel;
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

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.4,
    max_completion_tokens: openaiMaxCompletionTokens,
    messages: [
      ...systemMessages,
      ...messages
    ]
  });

  return completion.choices?.[0]?.message?.content || "No response generated.";
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
  generateVoiceReply,
  detectTwilioIntent,
  transcribeAudioBase64,
  generateSpeechFromText
};
