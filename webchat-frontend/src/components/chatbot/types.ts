export type ChatMessageStatus = "info" | "success" | "error";

export type Gender = "male" | "female" | "other" | "prefer_not_to_say";

export interface UserInfo {
  name: string;
  gender: Gender;
  dob: string;
  email: string;
  phone: string;
  address: string;
}

export interface ClinicProfile {
  name: string;
  acronym: string;
  greeting: string;
  /** Display URL for clinic avatar (data URL, http URL, or bundled default). */
  avatarUrl?: string | null;
  /** Clinic Twilio number from WebSocket connect. */
  twilioPhoneNumber?: string | null;
}

export type ChatMessageKind = "text" | "voice";

export interface VoiceAttachment {
  audioUrl: string;
  durationSec: number;
  transcript?: string;
  waveformLevels?: number[];
  autoPlay?: boolean;
}

// Core message shape used by chat transcript UI.
export interface ChatMessage {
  // Client-generated id used as React key and local reference.
  id: string;
  // Side of conversation this message belongs to.
  role: "user" | "assistant";
  // Human-readable message body.
  content: string;
  // Message rendering variant.
  kind?: ChatMessageKind;
  // Optional attachment details when kind is voice.
  voice?: VoiceAttachment;
  // Optional semantic status used for response-aware styling.
  status?: ChatMessageStatus;
  // Local timestamp when message was created/received.
  timestamp: Date;
}

// Input modality for message entry controls.
export type ChatMode = "text" | "voice";

// High-level chatbot UI phases.
export type ChatState = "chat" | "topics" | "topic-questions" | "offline-message";

// Optional configuration shape for future chatbot customization.
export interface ChatbotConfig {
  title?: string;
  subtitle?: string;
  placeholder?: string;
  welcomeMessage?: string;
  position?: "bottom-right" | "bottom-left";
  /** @deprecated Use backend `themeColor` on connect (see chatThemes). */
  primaryColor?: string;
  themeColor?: string;
}
