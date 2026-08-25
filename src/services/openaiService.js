/**
 * OpenAI service — single point of contact for the OpenAI SDK.
 *
 * Functions in this file ONLY format prompts and call OpenAI; pure parsing of
 * structured JSON responses lives in `openaiParseService` so callers can use
 * the same fallback logic without depending on this file's network code.
 *
 * Conventions:
 *   - All returned text is trimmed, never null.
 *   - Detection helpers return safe fallbacks instead of throwing so that the
 *     calling controller never has to wrap them in try/catch for the
 *     happy-path of "could not classify".
 */

const OpenAI = require("openai");
const { toFile } = require("openai/uploads");
const {
  parseLanguageHints,
  parseInboundMergedTurn,
  parseEndCallFlag,
  parseEndCallTurn,
  parseCallAnalysis,
  parseAppointmentIntake
} = require("./openaiParseService");
const { APP_TIMEZONE, nowLabelNy } = require("../utils/appTimeZone");

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
  const clinicPrompt = options.clinicPrompt || null;
  const knowledgePrompt = options.knowledgePrompt || null;
  const systemMessages = [];
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
    systemMessages.push({
      role: "system",
      content:
        "Clinic knowledge is the only source of truth for what to ask and what to say. Do not add extra appointment questions or confirmation wording that is not in knowledge."
    });
  } else {
    systemMessages.push({
      role: "system",
      content: options.systemPrompt || defaultSystemPrompt
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
  "  Otherwise always set end_call to false.",
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
    ...(clinicPrompt ? [{ role: "system", content: clinicPrompt }] : []),
    ...(knowledgePrompt
      ? [{ role: "system", content: knowledgePrompt }]
      : [{ role: "system", content: defaultSystemPrompt }]),
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
    reply: "Sorry, I could not process that. Could you repeat your question?",
    end_call: false
  };
  return parseInboundMergedTurn(raw) || fallback;
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
  return parseLanguageHints(raw, fallback);
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
  return parseEndCallFlag(raw);
}

/** Fast heuristic — skips an extra OpenAI round-trip on normal questions. */
function mightBeInboundEndCall(text) {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return false;
  return /\b(bye|goodbye|good\s*bye|see\s+you|that'?s\s+all|hang\s+up|end\s+(the\s+)?call|no\s+more\s+questions|thank\s+you|thanks)\b/.test(
    t
  );
}

/**
 * Classify end-of-call intent and return a short farewell phrase for TTS when ending.
 * @returns {Promise<{ endCall: boolean, farewell: string }>}
 */
async function analyzeInboundEndCallTurn({ text, clinicPrompt = null, knowledgePrompt = null }) {
  const empty = { endCall: false, farewell: "" };
  if (!text || !String(text).trim()) return empty;
  if (!openaiApiKey) return empty;
  if (String(process.env.INBOUND_END_CALL_ENABLED || "1").trim() === "0") return empty;
  if (!mightBeInboundEndCall(text)) return empty;

  const prompt = [
    "Classify whether the caller clearly wants to finish the phone call right now.",
    "Return JSON only: {\"end_call\": true|false, \"farewell\": string}.",
    "When end_call is true: set farewell to ONE short warm closing sentence in the same language/script the caller used.",
    "When end_call is false: set farewell to an empty string \"\".",
    "If the user is asking a question or continuing the conversation, end_call must be false."
  ].join(" ");

  const completion = await client.chat.completions.create({
    model: openaiInboundModel,
    temperature: 0,
    max_completion_tokens: 60,
    messages: [
      { role: "system", content: prompt },
      ...(clinicPrompt ? [{ role: "system", content: clinicPrompt }] : []),
      ...(knowledgePrompt ? [{ role: "system", content: knowledgePrompt }] : []),
      { role: "user", content: String(text).trim().slice(0, 1000) }
    ]
  });

  const raw = String(completion.choices?.[0]?.message?.content || "").trim();
  return parseEndCallTurn(raw);
}

/**
 * Classify chat/voice user intent in one OpenAI round-trip.
 * @returns {"normal"|"twilio"|"appointment"}
 */
async function analyzeChatIntent({ text, clinicPrompt = null, knowledgePrompt = null }) {
  if (!text || !String(text).trim()) return "normal";
  if (!openaiApiKey) return "normal";

  const intentPrompt = [
    "Classify the user's intent for a medical clinic assistant.",
    "Reply with exactly one word: normal, twilio, or appointment.",
    "- twilio: user explicitly wants a live phone call (call me, phone call, ring me, talk by phone, or similar).",
    "- appointment: user wants to schedule, book, make, change, or cancel an appointment, or asks about appointment availability.",
    "- normal: all other messages."
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
  if (result.includes("twilio")) return "twilio";
  if (result.includes("appointment")) return "appointment";
  return "normal";
}

async function detectTwilioIntent({ text, clinicPrompt = null, knowledgePrompt = null }) {
  const intent = await analyzeChatIntent({ text, clinicPrompt, knowledgePrompt });
  return intent === "twilio";
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

const callAnalysisSystemPrompt = [
  "You analyze completed inbound phone calls to a medical clinic voice assistant.",
  "Extract structured information ONLY from what was actually said in the transcript.",
  "Do not invent details. When information was not mentioned, use empty string or empty array.",
  "Output exactly one JSON object (no markdown, no code fences) with keys:",
  "patient_name, patient_phone, reason_for_call, symptoms_conditions, help_requested,",
  "urgency, sentiment, outcome_next_step, summary, key_quotes, notes,",
  "appointment_name, appointment_email, appointment_phone, appointment_dob, appointment_datetime, appointment_patient_type",
  "Field rules:",
  "- patient_name: caller's name if they stated it, else \"\".",
  "- patient_phone: phone number the caller gave verbally, else \"\".",
  "- reason_for_call: why they called / primary goal in 1-3 sentences.",
  "- symptoms_conditions: symptoms, diseases, or conditions mentioned, else \"\".",
  "- help_requested: JSON array of specific help types (e.g. appointment, refill, callback, directions, billing, test results, insurance, hours, other).",
  "- If help_requested includes appointment, also fill: appointment_name, appointment_email, appointment_phone, appointment_dob, appointment_datetime, appointment_patient_type.",
  "  appointment_datetime should be ISO-like (YYYY-MM-DDTHH:mm) in America/New_York when both date and time were spoken. appointment_patient_type is new or existing.",
  "  appointment_email must be the caller's own email from the transcript, never a clinic or bot address.",
  "  Use empty string when a booking field was not clearly stated. Do not invent.",
  "- urgency: one of low, medium, high, emergency, unknown.",
  "- sentiment: one of positive, neutral, negative, distressed, unknown.",
  "- outcome_next_step: what was resolved, promised, or should happen next.",
  "- summary: 2-4 sentence executive summary for clinic staff. Be specific about why they called and what follow-up is needed.",
  "- key_quotes: JSON array of up to 5 short direct quotes from the caller. Prefer core and important talking only:",
  "  primary reason for calling, symptoms/conditions, requested help, urgency cues, and promised next steps.",
  "  Skip greetings, fillers, and unrelated small talk. Do not invent quotes.",
  "- notes: any other relevant observations for staff (free text), else \"\"."
].join("\n");

/**
 * Analyze a full inbound phone call transcript and extract structured fields.
 * @param {{ transcript: Array<{role: string, text: string}>, callerPhone?: string|null }} params
 */
async function analyzeInboundCallTranscript({ transcript = [], callerPhone = null }) {
  const empty = {
    patientName: "",
    patientPhoneSpoken: "",
    reasonForCall: "",
    symptomsConditions: "",
    helpRequested: [],
    urgency: "unknown",
    sentiment: "unknown",
    outcomeNextStep: "",
    summary: "Insufficient conversation data to analyze this call.",
    keyQuotes: [],
    notes: "",
    appointmentIntake: {
      name: "",
      email: "",
      phone: "",
      dob: "",
      datetime: "",
      type: ""
    }
  };

  const turns = (transcript || []).filter((turn) => String(turn?.text || "").trim());
  if (!turns.length) return empty;
  if (!openaiApiKey) return empty;

  const formattedTranscript = turns
    .map((turn) => `${turn.role}: ${String(turn.text).trim()}`)
    .join("\n")
    .slice(0, 12000);

  const completion = await client.chat.completions.create({
    model: openaiInboundModel,
    temperature: 0.2,
    max_completion_tokens: 900,
    messages: [
      { role: "system", content: callAnalysisSystemPrompt },
      {
        role: "user",
        content: [
          `Current date and time (${APP_TIMEZONE}): ${nowLabelNy()}`,
          callerPhone ? `Caller ID on file: ${callerPhone}` : "Caller ID on file: unknown",
          "",
          "Call transcript:",
          formattedTranscript
        ].join("\n")
      }
    ]
  });

  const raw = String(completion.choices?.[0]?.message?.content || "").trim();
  return parseCallAnalysis(raw) || empty;
}

function appointmentIntakeExtractPrompt() {
  return [
    "Extract appointment booking fields from a medical clinic conversation.",
    "Output exactly one JSON object (no markdown) with keys:",
    "name, email, phone, dob, datetime, type, date, time",
    "Rules:",
    "- Use empty string when a value was not clearly given. Do not invent.",
    "- Only extract values the person actually said in the conversation.",
    "- Ignore widget/profile defaults. Never copy a profile phone or date of birth unless the person typed or said it in this conversation.",
    "- name: the person's full name as they stated it.",
    "- email: the person's own email address as they stated it. Never use a clinic, bot, or noreply address.",
    "- phone: only if the person stated their own phone number. Otherwise \"\". Ignore clinic numbers, Twilio numbers, and placeholders like 1234567890 or 555 numbers.",
    "- dob: only if the person stated their date of birth. Otherwise \"\". Never use 1970-01-01 or other profile defaults.",
    `- datetime: appointment start as YYYY-MM-DDTHH:mm in ${APP_TIMEZONE}. Convert today/tomorrow and clock times (for example tomorrow 10:00 AM) using America/New_York. Current Eastern time: ${nowLabelNy()}.`,
    "- date / time: split values if datetime cannot be formed.",
    "- type: exactly \"new\" or \"existing\" if the person said they are a new or existing/returning patient, else \"\"."
  ].join("\n");
}

/**
 * Pull structured appointment intake fields from free-text conversation.
 * @returns {Promise<object>}
 */
async function extractAppointmentIntakeFromText(text) {
  const empty = {
    name: "",
    email: "",
    phone: "",
    dob: "",
    datetime: "",
    type: "",
    date: "",
    time: ""
  };
  const source = String(text || "").trim();
  if (!source || !openaiApiKey) return empty;

  const completion = await client.chat.completions.create({
    model: openaiModel,
    temperature: 0,
    max_completion_tokens: 220,
    messages: [
      { role: "system", content: appointmentIntakeExtractPrompt() },
      { role: "user", content: source.slice(0, 8000) }
    ]
  });

  const raw = String(completion.choices?.[0]?.message?.content || "").trim();
  return parseAppointmentIntake(raw) || empty;
}

function knowledgeDocumentSystemPrompt(clinicName = "") {
  const clinicLabel = String(clinicName || "").trim() || "the clinic";
  return [
    "You are a medical clinic knowledge engineer.",
    `Convert uploaded documents into durable training knowledge for ${clinicLabel}'s AI assistant.`,
    "Write clear, factual, staff-ready knowledge text the chatbot can quote.",
    "Requirements:",
    "- Preserve important clinical/admin facts (services, hours, locations, insurance, policies, procedures, contacts, FAQs).",
    "- Organize with short headings and bullet points when helpful.",
    "- Remove fluff, ads, page numbers, headers/footers, and repeated boilerplate.",
    "- Do not invent facts that are not in the source.",
    "- If the source is incomplete, note what is missing briefly.",
    "- Output plain text only (no markdown code fences).",
    "- Aim for thorough but concise coverage suitable to paste into a knowledge base."
  ].join("\n");
}

/**
 * Turn raw document text into polished clinic knowledge for Training.
 */
async function analyzeDocumentForKnowledge({ sourceText, filename = "", clinicName = "" }) {
  if (!openaiApiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }
  const source = String(sourceText || "").trim();
  if (!source) {
    throw new Error("No document text to analyze.");
  }

  const completion = await client.chat.completions.create({
    model: openaiModel,
    temperature: 0.2,
    max_completion_tokens: Math.max(openaiMaxCompletionTokens, 1600),
    messages: [
      { role: "system", content: knowledgeDocumentSystemPrompt(clinicName) },
      {
        role: "user",
        content: [
          `Filename: ${String(filename || "document").trim() || "document"}`,
          clinicName ? `Clinic: ${String(clinicName).trim()}` : "",
          "Source document text:",
          source.slice(0, 48000)
        ]
          .filter(Boolean)
          .join("\n\n")
      }
    ]
  });

  const knowledge = String(completion.choices?.[0]?.message?.content || "").trim();
  if (!knowledge) {
    throw new Error("AI returned empty knowledge text.");
  }
  return knowledge;
}

module.exports = {
  generateAssistantReply,
  generateInboundMergedTurn,
  generateVoiceReply,
  analyzeChatIntent,
  detectTwilioIntent,
  detectInboundSpeechLanguage,
  detectInboundEndCallIntent,
  analyzeInboundEndCallTurn,
  mightBeInboundEndCall,
  transcribeAudioBase64,
  generateSpeechFromText,
  analyzeInboundCallTranscript,
  extractAppointmentIntakeFromText,
  analyzeDocumentForKnowledge
};
