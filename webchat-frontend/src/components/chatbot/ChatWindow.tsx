import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Keyboard, MessageSquarePlus, Mic } from "lucide-react";
import {
  type ChatMessage,
  type ChatMessageStatus,
  type ChatMode,
  type ClinicProfile,
} from "./types";
import type { Topic } from "./topicsData";
import ChatMessageComponent from "./ChatMessage";
import TypingIndicator from "./TypingIndicator";
import VoiceWaveform from "./VoiceWaveform";
import TopicSelector from "./TopicSelector";
import TopicQuestions from "./TopicQuestions";
import { useChatTheme } from "@/contexts/ChatThemeContext";
import { resolveClinicAvatarUrl } from "@/lib/clinicAvatar";
import ClinicAvatar from "./ClinicAvatar";
import ColorModeToggle from "./ColorModeToggle";
import MarqueeText from "./MarqueeText";
import {
  setClinicIdCookie,
  getClinicScopedChatSessionFromCookies,
  setConversationIdCookie,
  clearConversationIdCookie,
} from "../../lib/chatCookies";
import { getEmbedConfig } from "@/lib/embedConfig";

const DEFAULT_WS_PATH = ((import.meta.env.VITE_WEBSOCKET_PATH as string | undefined) ?? "/ws/chat").trim() || "/ws/chat";
const DEFAULT_WS_RETRY_MS = 1500;
const DEFAULT_WS_HANDSHAKE_MS = 8000;
const VOICE_BAR_COUNT = 32;
const VOICE_MESSAGE_WAVE_BARS = 48;
const MAX_VOICE_RECORDING_MS = 3 * 60 * 1000;

// Builds a normalized waveform array from recorded level history.
// @param history sampled average amplitude history collected during recording.
// @param fallback live waveform bars used when history is missing.
// @param bars target number of bars for message rendering.
const buildWaveformSnapshot = (history: number[], fallback: number[], bars: number): number[] => {
  const source = history.length > 0 ? history : fallback;
  if (source.length === 0) {
    return Array.from({ length: bars }, () => 0.18);
  }

  const sampled = Array.from({ length: bars }, (_, idx) => {
    const start = Math.floor((idx / bars) * source.length);
    const end = Math.min(source.length, Math.floor(((idx + 1) / bars) * source.length) || start + 1);
    let sum = 0;
    for (let i = start; i < end; i++) sum += source[i];
    const avg = sum / Math.max(1, end - start);
    return Math.max(0.02, Math.min(1, avg));
  });

  // Smooth neighbors so the waveform looks organic rather than jagged.
  const smoothed = sampled.map((_, idx) => {
    const prev = sampled[Math.max(0, idx - 1)];
    const curr = sampled[idx];
    const next = sampled[Math.min(sampled.length - 1, idx + 1)];
    return prev * 0.25 + curr * 0.5 + next * 0.25;
  });

  // Normalize and enforce floor/ceiling for a balanced visual profile.
  const peak = Math.max(...smoothed, 0.001);
  return smoothed.map((value) => Math.max(0.10, Math.min(1, value / peak)));
};

// Decodes the recorded audio blob and derives true peak bars from PCM data.
// @param audioBlob final recording payload from MediaRecorder.
// @param bars target number of bars in output waveform.
const decodeWaveformFromAudio = async (audioBlob: Blob, bars: number): Promise<number[] | null> => {
  try {
    const audioContext = new AudioContext();
    const arrayBuffer = await audioBlob.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    await audioContext.close();

    const channelData = audioBuffer.getChannelData(0);
    if (!channelData.length) return null;

    const windowSize = Math.max(1, Math.floor(channelData.length / bars));
    const sampled = Array.from({ length: bars }, (_, idx) => {
      const start = idx * windowSize;
      const end = Math.min(channelData.length, start + windowSize);
      let peak = 0;
      for (let i = start; i < end; i++) {
        const abs = Math.abs(channelData[i]);
        if (abs > peak) peak = abs;
      }
      return peak;
    });

    const maxPeak = Math.max(...sampled, 0.0001);
    return sampled.map((value) => Math.max(0.08, Math.min(1, value / maxPeak)));
  } catch {
    return null;
  }
};

// Converts an audio Blob into base64 payload for websocket transport.
// @param audioBlob recorded voice blob from MediaRecorder.
const blobToBase64 = async (audioBlob: Blob): Promise<string> => {
  const buffer = await audioBlob.arrayBuffer();
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(bytes.length, i + chunkSize));
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
};

// Converts base64 audio payload from backend into a Blob (playback + waveform decode).
const base64ToAudioBlob = (audioBase64: string, mimeType: string): Blob | null => {
  try {
    const binary = window.atob(audioBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new Blob([bytes], { type: mimeType || "audio/webm" });
  } catch {
    return null;
  }
};

// Converts base64 audio payload from backend into an object URL for playback.
const base64ToAudioUrl = (audioBase64: string, mimeType: string): string | null => {
  const blob = base64ToAudioBlob(audioBase64, mimeType);
  if (!blob) return null;
  return URL.createObjectURL(blob);
};

const toWebSocketUrl = (rawUrl: string, path = ""): string => {
  const normalized = rawUrl.trim();
  let url: URL;
  try {
    if (normalized.startsWith("ws://") || normalized.startsWith("wss://")) {
      url = new URL(normalized);
    } else if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
      url = new URL(normalized);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    } else {
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      url = new URL(`${proto}//${normalized}`);
    }
  } catch {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    url = new URL(`${proto}//${window.location.host}`);
  }

  if (path && (url.pathname === "/" || url.pathname === "")) {
    url.pathname = path.startsWith("/") ? path : `/${path}`;
  }

  return url.toString();
};

// Resolves native WebSocket endpoint from embed config / environment.
const resolveWebSocketUrl = (): string => {
  const embed = getEmbedConfig();

  if (embed.websocketUrl) {
    return toWebSocketUrl(embed.websocketUrl, embed.websocketPath || DEFAULT_WS_PATH);
  }

  const explicitWsUrl = import.meta.env.VITE_WEBSOCKET_URL as string | undefined;
  if (explicitWsUrl?.trim()) {
    return toWebSocketUrl(explicitWsUrl.trim(), embed.websocketPath || DEFAULT_WS_PATH);
  }

  const legacySocketIoUrl = import.meta.env.VITE_SOCKET_IO_URL as string | undefined;
  if (legacySocketIoUrl?.trim()) {
    const legacyPath =
      (
        (import.meta.env.VITE_SOCKET_IO_PATH as string | undefined) ??
        embed.websocketPath ??
        DEFAULT_WS_PATH
      ).trim() || DEFAULT_WS_PATH;
    return toWebSocketUrl(legacySocketIoUrl.trim(), legacyPath);
  }

  const backendUrl =
    embed.backendUrl ||
    (import.meta.env.VITE_BACKEND_URL as string | undefined)?.trim() ||
    `${window.location.protocol}//${window.location.host}`;
  return toWebSocketUrl(backendUrl, embed.websocketPath || DEFAULT_WS_PATH);
};

/** Close without triggering reconnect handlers; avoid 1006 from closing while CONNECTING. */
const detachAndCloseWebSocket = (socket: WebSocket, reason = "client-close") => {
  socket.onopen = null;
  socket.onmessage = null;
  socket.onerror = null;
  socket.onclose = null;

  if (socket.readyState === WebSocket.CONNECTING) {
    const closeWhenOpen = () => {
      try {
        socket.close(1000, reason);
      } catch {
        /* ignore */
      }
    };
    socket.addEventListener("open", closeWhenOpen, { once: true });
    window.setTimeout(() => {
      if (socket.readyState === WebSocket.CONNECTING || socket.readyState === WebSocket.OPEN) {
        try {
          socket.close(1000, reason);
        } catch {
          /* ignore */
        }
      }
    }, 2000);
    return;
  }

  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CLOSING) {
    try {
      socket.close(1000, reason);
    } catch {
      /* ignore */
    }
  }
};

const sendWsJson = (socket: WebSocket, payload: unknown): void => {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(payload));
};

const resolveClinicId = (): string => {
  return getEmbedConfig().clinicId;
};

// Accepts flexible backend payload shapes so frontend is resilient
// while backend contracts evolve.
type BackendType = "voice" | "chat" | "connect";
type ConversationId = string | number;

const pickPayloadField = <T,>(
  parsed: Record<string, unknown>,
  keys: string[],
): T | undefined => {
  for (const key of keys) {
    const topLevel = parsed[key];
    if (topLevel !== undefined && topLevel !== null && topLevel !== "") {
      return topLevel as T;
    }
    const nested = parsed.data;
    if (nested && typeof nested === "object") {
      const nestedValue = (nested as Record<string, unknown>)[key];
      if (nestedValue !== undefined && nestedValue !== null && nestedValue !== "") {
        return nestedValue as T;
      }
    }
  }
  return undefined;
};

const formatUsPhoneDisplay = (raw: string | null | undefined): string | null => {
  const digits = String(raw || "").replace(/\D/g, "");
  const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
  if (national.length !== 10) return null;
  return `(${national.slice(0, 3)}) ${national.slice(3, 6)}-${national.slice(6)}`;
};

const parseBackendPayload = (rawPayload: unknown): {
  type?: BackendType;
  status?: ChatMessageStatus;
  message?: string;
  response?: string;
  transcriptText?: string;
  audio?: string;
  audioMimeType?: string;
  conversationId?: ConversationId;
  clinicName?: string;
  clinicAcronym?: string;
  greeting?: string;
  themeColor?: string;
  avatarUrl?: string | null;
  twilioPhoneNumber?: string | null;
} => {
  try {
    const parsed = (typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload) as Record<string, unknown> & {
      type?: string;
      message?: string;
      response?: string;
      transcriptText?: string;
      audio?: string;
      audioMimeType?: string;
      status?: string;
      conversation_id?: ConversationId;
      conversationId?: ConversationId;
      data?: {
        conversation_id?: ConversationId;
        conversationId?: ConversationId;
        clinicName?: string;
        clinicAcronym?: string;
        greeting?: string;
      };
    };

    const normalizedStatus: ChatMessageStatus =
      parsed.status === "error" ? "error" : "success";

    const rawType = parsed.type ?? (typeof parsed.data === "object" && parsed.data !== null
      ? (parsed.data as { type?: string }).type
      : undefined);
    const normalizedType = rawType === "voice" || rawType === "chat" || rawType === "connect"
      ? rawType
      : undefined;

    return {
      type: normalizedType,
      message: parsed.message,
      response: parsed.response,
      transcriptText: parsed.transcriptText,
      audio: parsed.audio,
      audioMimeType: parsed.audioMimeType,
      status: normalizedStatus,
      conversationId: parsed.conversation_id ?? parsed.conversationId ?? parsed.data?.conversation_id ?? parsed.data?.conversationId,
      clinicName: pickPayloadField<string>(parsed, ["clinicName", "clinic_name"]),
      clinicAcronym: pickPayloadField<string>(parsed, ["clinicAcronym", "clinic_acronym"]),
      greeting: pickPayloadField<string>(parsed, ["greeting", "clinicGreeting", "clinic_greeting"]),
      themeColor: pickPayloadField<string>(parsed, ["themeColor", "theme_color", "colorTheme", "color_theme"]),
      avatarUrl: resolveClinicAvatarUrl(parsed),
      twilioPhoneNumber: pickPayloadField<string>(parsed, [
        "twilioPhoneNumber",
        "twilio_phone_number",
        "phoneNumber",
        "phone_number",
      ]),
    };
  } catch {
    return { status: "error", message: "Invalid backend response payload." };
  }
};

// Main chat container:
// - owns transcript + UI mode state
// - manages websocket lifecycle/reconnect behavior
// - coordinates topic flow, escalation flow, and input handling
interface ChatWindowProps {
  isOpen: boolean;
  onConnectionStatusChange?: (status: "connecting" | "connected" | "disconnected") => void;
  onClinicAvatarUrlChange?: (avatarUrl: string | null) => void;
}

const ChatWindow = ({ isOpen, onConnectionStatusChange, onClinicAvatarUrlChange }: ChatWindowProps) => {
  const { setThemeFromBackend } = useChatTheme();
  const setThemeFromBackendRef = useRef(setThemeFromBackend);
  setThemeFromBackendRef.current = setThemeFromBackend;
  const websocketUrl = useMemo(() => resolveWebSocketUrl(), []);
  const clinicId = useMemo(() => resolveClinicId(), []);
  const initialChatSession = useMemo(
    () => getClinicScopedChatSessionFromCookies(clinicId),
    [clinicId],
  );

  useEffect(() => {
    setClinicIdCookie(clinicId);
  }, [clinicId]);

  const [conversationId, setConversationId] = useState<ConversationId | null>(
    () => initialChatSession.conversationId,
  );
  const [clinicProfile, setClinicProfile] = useState<ClinicProfile | null>(null);
  // Local transcript including seeded welcome message (replaced when connect returns clinic greeting).
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Connecting to your clinic assistant...",
      timestamp: new Date(),
    },
  ]);

  const applyClinicConnectPayload = useCallback((payload: {
    type?: BackendType;
    clinicName?: string;
    clinicAcronym?: string;
    greeting?: string;
    message?: string;
    themeColor?: string;
    avatarUrl?: string | null;
    twilioPhoneNumber?: string | null;
  }) => {
    const name = payload.clinicName?.trim();
    const acronym = payload.clinicAcronym?.trim();
    const greeting = (
      payload.greeting?.trim() ||
      (payload.type === "connect" ? payload.message?.trim() : undefined)
    );
    const avatarUrl = payload.avatarUrl ?? null;
    const twilioPhoneNumber = payload.twilioPhoneNumber?.trim() || null;

    if (name || acronym || greeting || avatarUrl || twilioPhoneNumber) {
      setClinicProfile((prev) => ({
        name: name || prev?.name || "",
        acronym: acronym || prev?.acronym || "",
        greeting: greeting || prev?.greeting || "",
        avatarUrl: avatarUrl ?? prev?.avatarUrl ?? null,
        twilioPhoneNumber: twilioPhoneNumber ?? prev?.twilioPhoneNumber ?? null,
      }));
    }

    if (avatarUrl) {
      onClinicAvatarUrlChange?.(avatarUrl);
    }

    if (greeting) {
      setMessages((prev) =>
        prev.map((msg) => (msg.id === "welcome" ? { ...msg, content: greeting } : msg)),
      );
    }
  }, [onClinicAvatarUrlChange]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [mode, setMode] = useState<ChatMode>("text");
  const [isRecording, setIsRecording] = useState(false);
  const [isMicAvailable, setIsMicAvailable] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [liveWaveLevels, setLiveWaveLevels] = useState<number[]>(Array.from({ length: VOICE_BAR_COUNT }, () => 0.12));
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [showTopics, setShowTopics] = useState(false);
  // Connection status powers header badge text and retry logic.
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  // Latest user-visible transport/backend issue.
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const openedAtMsRef = useRef<number>(Date.now());
  const wasOpenRef = useRef<boolean>(isOpen);
  const scrollRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const handshakeTimeoutRef = useRef<number | null>(null);
  const handshakeDoneRef = useRef(false);
  const connectSocketRef = useRef<() => void>(() => {});
  const connectionEpochRef = useRef(0);
  const conversationIdRef = useRef<ConversationId | null>(null);
  const isManualCloseRef = useRef(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const recordingTimeoutRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const recordingWaveHistoryRef = useRef<number[]>([]);

  // Keep latest activity visible as messages/typing states change.
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping, scrollToBottom]);

  type OutgoingMessageType = "chat" | "voice";
  const isSocketDisconnected = connectionStatus === "disconnected";
  const isMicBlocked = !isMicAvailable;

  useEffect(() => {
    conversationIdRef.current = conversationId;
    if (conversationId !== null) {
      setConversationIdCookie(conversationId);
    }
  }, [conversationId]);

  useEffect(() => {
    onConnectionStatusChange?.(connectionStatus);
  }, [connectionStatus, onConnectionStatusChange]);

  // Resets live waveform strip to idle baseline bars.
  const resetWaveform = useCallback(() => {
    setLiveWaveLevels(Array.from({ length: VOICE_BAR_COUNT }, () => 0.12));
  }, []);

  // Stops analyser animation loop and closes audio context.
  const stopAudioMonitoring = useCallback(() => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    analyserRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  // Stops all active microphone tracks from the recording stream.
  const stopRecordingTracks = useCallback(() => {
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    audioStreamRef.current = null;
  }, []);

  // Clears max-duration timer used to auto-stop recording at 3 minutes.
  const clearRecordingTimeout = useCallback(() => {
    if (recordingTimeoutRef.current) {
      window.clearTimeout(recordingTimeoutRef.current);
      recordingTimeoutRef.current = null;
    }
  }, []);

  // Continuously samples analyser time-domain data to drive live waveform.
  // @param analyser connected AnalyserNode for current microphone stream.
  const monitorLiveWaveform = useCallback((analyser: AnalyserNode) => {
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    // Frame callback: computes visual bar levels and stores history snapshot.
    const tick = () => {
      analyser.getByteTimeDomainData(dataArray);
      const chunkSize = Math.floor(bufferLength / VOICE_BAR_COUNT) || 1;
      const nextLevels = Array.from({ length: VOICE_BAR_COUNT }, (_, idx) => {
        const start = idx * chunkSize;
        const end = Math.min(start + chunkSize, bufferLength);
        let sum = 0;
        for (let i = start; i < end; i++) {
          sum += Math.abs(dataArray[i] - 128) / 128;
        }
        const avg = sum / Math.max(1, end - start);
        return Math.max(0.12, Math.min(1, avg * 3));
      });
      setLiveWaveLevels(nextLevels);
      const avgLevel = nextLevels.reduce((acc, level) => acc + level, 0) / nextLevels.length;
      recordingWaveHistoryRef.current.push(avgLevel);
      if (recordingWaveHistoryRef.current.length > 240) {
        recordingWaveHistoryRef.current.shift();
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };

    tick();
  }, []);

  // Checks microphone device presence and accessibility for UI state.
  const checkMicAvailability = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setIsMicAvailable(false);
      setMicError("Microphone API is not available in this browser.");
      console.warn("[ChatWindow] Mic status: unavailable (mediaDevices API not supported)");
      return;
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some((device) => device.kind === "audioinput");
      console.log(`[ChatWindow] Mic status (device list): ${hasMic ? "connected" : "not connected"}`);
      if (!hasMic) {
        setIsMicAvailable(false);
        setMicError("No microphone detected.");
      } else {
        try {
          // Strict check: microphone must be physically present and accessible.
          const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          probeStream.getTracks().forEach((track) => track.stop());
          setIsMicAvailable(true);
          setMicError(null);
          console.log("[ChatWindow] Mic status (startup probe): connected and accessible");
        } catch {
          setIsMicAvailable(false);
          setMicError("Microphone is not connected or permission is blocked.");
          console.warn("[ChatWindow] Mic status (startup probe): unavailable or blocked");
        }
      }
    } catch {
      setIsMicAvailable(false);
      setMicError("Unable to check microphone devices.");
      console.error("[ChatWindow] Mic status check failed (enumerateDevices)");
    }
  }, []);

  // Requests a short mic probe and returns whether capture is permitted.
  const ensureMicrophoneAccessible = useCallback(async (): Promise<boolean> => {
    try {
      const probeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      probeStream.getTracks().forEach((track) => track.stop());
      setIsMicAvailable(true);
      setMicError(null);
      console.log("[ChatWindow] Mic access probe: connected and accessible");
      return true;
    } catch {
      setIsMicAvailable(false);
      setMicError("Microphone is not connected or permission is blocked.");
      console.warn("[ChatWindow] Mic access probe: unavailable or blocked");
      return false;
    }
  }, []);

  // Helper to append AI/system-style assistant responses.
  // Appends an assistant/system bubble into transcript.
  // @param content text shown in assistant bubble.
  // @param status semantic style status (info/success/error).
  const appendAssistantMessage = useCallback((content: string, status: ChatMessageStatus = "info") => {
    const botMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "assistant",
      content,
      status,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, botMsg]);
  }, []);

  // Opens native WebSocket connection and wires transport lifecycle events.
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current !== null) {
      window.clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  const clearHandshakeTimeout = useCallback(() => {
    if (handshakeTimeoutRef.current !== null) {
      window.clearTimeout(handshakeTimeoutRef.current);
      handshakeTimeoutRef.current = null;
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (isManualCloseRef.current || reconnectTimeoutRef.current !== null) return;
    reconnectTimeoutRef.current = window.setTimeout(() => {
      reconnectTimeoutRef.current = null;
      connectSocketRef.current();
    }, DEFAULT_WS_RETRY_MS);
  }, []);

  const markBackendConnected = useCallback(() => {
    if (handshakeDoneRef.current) return;
    handshakeDoneRef.current = true;
    clearHandshakeTimeout();
    setConnectionStatus("connected");
    setConnectionError(null);
  }, [clearHandshakeTimeout]);

  const connectSocket = useCallback(() => {
    const existing = socketRef.current;
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    clearReconnectTimeout();
    clearHandshakeTimeout();
    handshakeDoneRef.current = false;
    setConnectionStatus("connecting");
    console.log("[ChatWindow] Connecting WebSocket:", websocketUrl);

    let socket: WebSocket;
    try {
      socket = new WebSocket(websocketUrl);
    } catch {
      setConnectionStatus("disconnected");
      setConnectionError("Unable to reach chat server. Please try again.");
      scheduleReconnect();
      return;
    }
    socketRef.current = socket;

    // Covers both "never opens" (server down) and "opens but no backend reply".
    handshakeTimeoutRef.current = window.setTimeout(() => {
      if (handshakeDoneRef.current || socketRef.current !== socket) return;
      console.warn("[ChatWindow] WebSocket connect/handshake timed out.");
      setConnectionStatus("disconnected");
      setConnectionError("Unable to reach chat server. Please try again.");
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
      detachAndCloseWebSocket(socket, "connect-timeout");
      if (!isManualCloseRef.current) {
        scheduleReconnect();
      }
    }, DEFAULT_WS_HANDSHAKE_MS);

    socket.onopen = () => {
      if (socketRef.current !== socket) return;
      // Transport open is not enough — stay "connecting" until the backend answers.
      setConnectionStatus("connecting");
      const connectConversationId = conversationIdRef.current ?? 0;
      try {
        sendWsJson(socket, {
          type: "connect",
          clinicId: clinicId,
          conversationId: connectConversationId,
        });
      } catch {
        setConnectionError("Connected, but failed to initialize chat context.");
      }
    };

    const handleInboundPayload = (incoming: unknown) => {
      if (incoming && typeof incoming === "object") {
        markBackendConnected();
      }

      // Handle transport heartbeat frames before chat payload parsing.
      try {
        const raw = (typeof incoming === "string" ? JSON.parse(incoming) : incoming) as { type?: string };
        if (raw.type === "ping") {
          markBackendConnected();
          sendWsJson(socket, { type: "pong" });
          return;
        }
      } catch {
        // Non-JSON payloads are handled by the normal parser.
      }

      const payload = parseBackendPayload(incoming);
      setIsTyping(false);
      if (payload.conversationId !== undefined && payload.conversationId !== null) {
        setConversationId(payload.conversationId);
      }

      if (payload.status === "error") {
        appendAssistantMessage(payload.message || "I ran into an issue while processing your request.", "error");
        return;
      }

      if (payload.themeColor?.trim()) {
        setThemeFromBackendRef.current(payload.themeColor);
      }

      if (payload.clinicName || payload.clinicAcronym || payload.greeting || payload.themeColor || payload.avatarUrl || payload.twilioPhoneNumber) {
        applyClinicConnectPayload(payload);
      }

      if (payload.type === "connect") {
        return;
      }

      if (payload.transcriptText) {
        setMessages((prev) => {
          for (let i = prev.length - 1; i >= 0; i--) {
            const msg = prev[i];
            if (msg.role === "user" && msg.kind === "voice" && msg.voice) {
              const updated = [...prev];
              updated[i] = {
                ...msg,
                voice: {
                  ...msg.voice,
                  transcript: payload.transcriptText,
                },
              };
              return updated;
            }
          }
          return prev;
        });
      }

      if (payload.type === "voice" && payload.audio) {
        const mimeType = payload.audioMimeType || "audio/webm";
        const blob = base64ToAudioBlob(payload.audio, mimeType);
        if (blob) {
          void (async () => {
            const audioUrl = URL.createObjectURL(blob);
            const decodedWaveform = await decodeWaveformFromAudio(blob, VOICE_MESSAGE_WAVE_BARS);
            const waveformLevels =
              decodedWaveform ?? buildWaveformSnapshot([], [], VOICE_MESSAGE_WAVE_BARS);
            const assistantVoiceMessage: ChatMessage = {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              role: "assistant",
              kind: "voice",
              content: payload.response || "Voice response",
              voice: {
                audioUrl,
                durationSec: 0,
                transcript: payload.response || payload.transcriptText,
                waveformLevels,
                autoPlay: true,
              },
              status: "success",
              timestamp: new Date(),
            };
            setMessages((prev) => [...prev, assistantVoiceMessage]);
          })();
        }
        return;
      }

      if (payload.response) {
        appendAssistantMessage(payload.response, "success");
      } else if (payload.type === "chat" && payload.message) {
        appendAssistantMessage(payload.message, "info");
      }
    };

    socket.onmessage = (event) => {
      if (socketRef.current !== socket) return;
      let incoming: unknown = event.data;
      if (typeof event.data === "string") {
        try {
          incoming = JSON.parse(event.data);
        } catch {
          // Keep raw string for parseBackendPayload error handling.
        }
      }
      handleInboundPayload(incoming);
    };

    socket.onerror = () => {
      if (socketRef.current !== socket) return;
      clearHandshakeTimeout();
      setConnectionError("Unable to reach chat server. Please try again.");
      console.error("[ChatWindow] WebSocket connection error for URL:", websocketUrl);
    };

    socket.onclose = (event) => {
      clearHandshakeTimeout();
      handshakeDoneRef.current = false;

      if (socketRef.current === socket) {
        socketRef.current = null;
      } else {
        return;
      }

      setConnectionStatus("disconnected");
      setIsTyping(false);
      if (isManualCloseRef.current) return;

      console.warn(
        "[ChatWindow] WebSocket closed:",
        `code=${event.code}`,
        `reason=${event.reason || "(none)"}`,
        `wasClean=${event.wasClean}`,
      );
      setConnectionError("Connection lost. Reconnecting...");
      scheduleReconnect();
    };
  }, [
    appendAssistantMessage,
    applyClinicConnectPayload,
    clearHandshakeTimeout,
    clearReconnectTimeout,
    clinicId,
    markBackendConnected,
    scheduleReconnect,
    websocketUrl,
  ]);

  connectSocketRef.current = connectSocket;

  useEffect(() => {
    const epoch = ++connectionEpochRef.current;
    isManualCloseRef.current = false;
    connectSocketRef.current();

    return () => {
      window.setTimeout(() => {
        if (connectionEpochRef.current !== epoch) return;

        isManualCloseRef.current = true;
        clearReconnectTimeout();
        clearHandshakeTimeout();
        clearRecordingTimeout();
        const socket = socketRef.current;
        socketRef.current = null;
        handshakeDoneRef.current = false;
        if (socket) {
          detachAndCloseWebSocket(socket, "component-unmount");
        }
        stopAudioMonitoring();
        stopRecordingTracks();
      }, 100);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount/unmount only; live logic uses refs
  }, []);

  useEffect(() => {
    void checkMicAvailability();
    navigator.mediaDevices?.addEventListener?.("devicechange", checkMicAvailability);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", checkMicAvailability);
    };
  }, [checkMicAvailability]);

  useEffect(() => {
    if (!isMicAvailable && mode === "voice") {
      setMode("text");
      setIsRecording(false);
      resetWaveform();
    }
  }, [isMicAvailable, mode, resetWaveform]);

  // Capture open-edge timestamp synchronously so old messages do not replay
  // typing/autoplay on the first render after reopening the chat window.
  if (isOpen && !wasOpenRef.current) {
    openedAtMsRef.current = Date.now();
  }
  wasOpenRef.current = isOpen;

  useEffect(() => {
    if (isSocketDisconnected && isRecording) {
      setIsRecording(false);
      mediaRecorderRef.current?.stop();
      stopAudioMonitoring();
      stopRecordingTracks();
      resetWaveform();
    }
  }, [isRecording, isSocketDisconnected, resetWaveform, stopAudioMonitoring, stopRecordingTracks]);

  type OutgoingPayload = {
    type: OutgoingMessageType;
    text?: string;
    isTopic?: 0 | 1;
    message?: string;
    audioBase64?: string;
    audio?: string;
    audioMimeType?: string;
    mimeType?: string;
    durationSec?: number;
    waveformLevels?: number[];
    conversation_id?: string;
    conversationId?: string;
  };

  // Low-level transport send with guard rails and graceful failures.
  // Sends payload through websocket if connected.
  // @param payload normalized outgoing request body for backend transport.
  const sendToBackend = useCallback((payload: OutgoingPayload) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !handshakeDoneRef.current) {
      setConnectionStatus("disconnected");
      setConnectionError("Chat service is disconnected. Retrying now...");
      connectSocket();
      return false;
    }

    try {
      // Send both "text" and "message" fields for compatibility with different backend contracts.
      sendWsJson(socket, {
        ...payload,
        message: payload.message ?? payload.text,
        isTopic: payload.isTopic ?? 0,
        clinicId,
        conversation_id: payload.conversation_id ?? conversationIdRef.current ?? undefined,
        conversationId: payload.conversationId ?? conversationIdRef.current ?? undefined,
      });
      return true;
    } catch {
      setConnectionError("Failed to send your message. Please try again.");
      return false;
    }
  }, [clinicId, connectSocket]);


  // Public message send path invoked by text submit and topic completion.
  // Public send action used by text submit and topic workflows.
  // @param text user-facing content to send.
  // @param type outgoing mode (defaults to "chat").
  const sendMessage = useCallback(async (text: string, type: OutgoingMessageType = "chat", isTopic: 0 | 1 = 0) => {
    if (!text.trim()) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: text.trim(),
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");

    setIsTyping(true);
    setConnectionError(null);
    const sent = sendToBackend({ type, text: text.trim(), isTopic });
    if (!sent) {
      setIsTyping(false);
      appendAssistantMessage("I can't send that right now because the connection is unavailable. Please try again.", "error");
    }
  }, [appendAssistantMessage, sendToBackend]);

  // Action: user selects a topic card.
  // @param topic selected topic metadata.
  const handleSelectTopic = (topic: Topic) => {
    setSelectedTopic(topic);
  };

  // Action: user submits answers from topic questionnaire.
  // @param answers keyed answer map from topic question step.
  const handleTopicComplete = (answers: Record<number, string>) => {
    const topic = selectedTopic;
    setSelectedTopic(null);
    if (topic) {
      const summary = `${topic.title}: ${Object.values(answers).join(", ")}`;
      sendMessage(summary, "chat", 1);
    }
  };

  // Action: returns from question form to topic list.
  const handleBackToTopics = () => {
    setSelectedTopic(null);
    setShowTopics(true);
  };

  // Action: toggles topic list visibility in text mode.
  const handleToggleTopics = () => {
    setShowTopics((prev) => !prev);
  };

  const isChatEmpty = useMemo(() => {
    const onlyWelcome = messages.length === 1 && messages[0]?.id === "welcome";
    return (
      onlyWelcome &&
      !input.trim() &&
      !isTyping &&
      !isRecording &&
      !showTopics &&
      !selectedTopic
    );
  }, [
    messages,
    input,
    isTyping,
    isRecording,
    showTopics,
    selectedTopic,
  ]);

  const handleNewChat = useCallback(() => {
    if (isChatEmpty) return;

    if (isRecording) {
      clearRecordingTimeout();
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      stopAudioMonitoring();
      stopRecordingTracks();
      resetWaveform();
    }

    clearConversationIdCookie();
    conversationIdRef.current = 0;
    setConversationId(null);

    setInput("");
    setIsTyping(false);
    setShowTopics(false);
    setSelectedTopic(null);
    setMode("text");
    setConnectionError(null);

    const welcomeContent =
      clinicProfile?.greeting?.trim() || "Connecting to your clinic assistant...";
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: welcomeContent,
        timestamp: new Date(),
      },
    ]);

    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN && handshakeDoneRef.current) {
      sendWsJson(socket, {
        type: "connect",
        clinicId,
        conversationId: 0,
      });
    } else {
      connectSocket();
    }
  }, [
    clearRecordingTimeout,
    clinicId,
    clinicProfile?.greeting,
    connectSocket,
    isChatEmpty,
    isRecording,
    resetWaveform,
    stopAudioMonitoring,
    stopRecordingTracks,
  ]);

  // Form submit handler for text input mode.
  // @param e submit event from the text-input form.
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(input);
  };

  // Keyboard behavior for chat composer:
  // - Enter: send message
  // - Shift+Enter: insert newline
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return;
    e.preventDefault();
    sendMessage(input);
  };

  // Primary voice action: starts or stops microphone recording.
  const toggleRecording = async () => {
    if (isSocketDisconnected) return;

    if (isRecording) {
      clearRecordingTimeout();
      mediaRecorderRef.current?.stop();
      return;
    }

    const canUseMic = await ensureMicrophoneAccessible();
    if (!canUseMic) {
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStreamRef.current = stream;

      const context = new AudioContext();
      audioContextRef.current = context;
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      monitorLiveWaveform(analyser);

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];
      recordingWaveHistoryRef.current = [];
      recordingStartedAtRef.current = Date.now();

      // Event: MediaRecorder chunk available; append non-empty chunk.
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Event: recording ended (manual stop or 3-minute auto-stop).
      recorder.onstop = () => {
        clearRecordingTimeout();
        const elapsedMs = Date.now() - recordingStartedAtRef.current;
        const durationSec = Math.max(1, Math.round(elapsedMs / 1000));
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || "audio/webm" });
        const audioUrl = URL.createObjectURL(blob);
        // Async post-processing: decode waveform, append message, send marker.
        void (async () => {
          const decodedWaveform = await decodeWaveformFromAudio(blob, VOICE_MESSAGE_WAVE_BARS);
          const fallbackWaveform = buildWaveformSnapshot(
            recordingWaveHistoryRef.current,
            liveWaveLevels,
            VOICE_MESSAGE_WAVE_BARS,
          );
          const waveformSnapshot = decodedWaveform ?? fallbackWaveform;

          const voiceMsg: ChatMessage = {
            id: Date.now().toString(),
            role: "user",
            kind: "voice",
            content: "Voice message",
            voice: {
              audioUrl,
              durationSec,
              transcript: "Voice message recorded.",
              waveformLevels: waveformSnapshot,
            },
            timestamp: new Date(),
          };
          setMessages((prev) => [...prev, voiceMsg]);
          setIsTyping(true);
          setConnectionError(null);
          const audioBase64 = await blobToBase64(blob);
          const sent = sendToBackend({
            type: "voice",
            text: "Voice message recorded.",
            isTopic: 0,
            audio: audioBase64,
            audioMimeType: blob.type || recorder.mimeType || "audio/webm",
            mimeType: blob.type || recorder.mimeType || "audio/webm",
            durationSec,
            waveformLevels: waveformSnapshot,
          });
          if (!sent) {
            setIsTyping(false);
            appendAssistantMessage("I can't send that right now because the connection is unavailable. Please try again.", "error");
          }

          setIsRecording(false);
          stopAudioMonitoring();
          stopRecordingTracks();
          resetWaveform();
        })();
      };

      recorder.start();
      clearRecordingTimeout();
      // Auto-stop guardrail when recording reaches max duration.
      recordingTimeoutRef.current = window.setTimeout(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
        }
      }, MAX_VOICE_RECORDING_MS);
      setIsRecording(true);
      setMicError(null);
    } catch {
      clearRecordingTimeout();
      setIsRecording(false);
      setMicError("Microphone access denied or unavailable.");
      stopAudioMonitoring();
      stopRecordingTracks();
      resetWaveform();
    }
  };

  // Action: switches UI into voice mode after mic-access validation.
  const handleSwitchToVoiceMode = async () => {
    if (isSocketDisconnected) return;
    const canUseMic = await ensureMicrophoneAccessible();
    if (canUseMic) {
      setMode("voice");
    }
  };

  const callUsDigits = useMemo(() => {
    const digits = String(clinicProfile?.twilioPhoneNumber || "").replace(/\D/g, "");
    const national = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;
    return national.slice(0, 10);
  }, [clinicProfile?.twilioPhoneNumber]);
  const callUsNumber = useMemo(
    () =>
      formatUsPhoneDisplay(clinicProfile?.twilioPhoneNumber) ??
      clinicProfile?.twilioPhoneNumber?.trim() ??
      null,
    [clinicProfile?.twilioPhoneNumber],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.92 }}
          transition={{ type: "spring", stiffness: 320, damping: 28 }}
          className="fixed bottom-44 right-6 z-[2147483647] w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-8rem)] bg-card rounded-2xl border border-border shadow-2xl shadow-primary/10 flex flex-col overflow-hidden
            max-sm:bottom-0 max-sm:right-0 max-sm:left-0 max-sm:top-0 max-sm:w-full max-sm:h-full max-sm:max-w-full max-sm:max-h-full max-sm:rounded-none"
        >
      {/* Header */}
      <div className="relative px-5 py-4 border-b border-border bg-gradient-to-r from-chat-header-from to-chat-header-to">
        <div className="flex items-center gap-3">
          <motion.div
            animate={{ rotate: [0, 10, -10, 0] }}
            transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
          >
            <ClinicAvatar
              src={clinicProfile?.avatarUrl}
              size="lg"
              withGradientRing
              alt={clinicProfile?.name?.trim() || "Clinic assistant"}
            />
          </motion.div>
          <div className="flex-1 min-w-0">
            <h3 className="min-w-0">
              <MarqueeText
                text={clinicProfile?.name?.trim() || "HealthBot AI"}
                className="font-display text-sm font-semibold text-foreground"
              />
            </h3>
            {callUsNumber ? (
              callUsDigits.length === 10 ? (
                <a
                  href={`tel:+1${callUsDigits}`}
                  className="mt-0.5 inline-block text-xs font-medium text-primary hover:text-primary/80 whitespace-nowrap"
                >
                  Call Us {callUsNumber}
                </a>
              ) : (
                <span className="mt-0.5 inline-block text-xs font-medium text-primary whitespace-nowrap">
                  Call Us {callUsNumber}
                </span>
              )
            ) : null}
          </div>

          <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNewChat}
            disabled={isChatEmpty}
            aria-label="New chat"
            title="New chat"
            className="w-8 h-8 rounded-full border border-border/80 bg-muted/60 text-foreground flex items-center justify-center hover:border-primary/40 hover:bg-primary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-border/80 disabled:hover:bg-muted/60"
          >
            <MessageSquarePlus className="h-4 w-4" />
          </button>
          <ColorModeToggle />
          {/* Text / voice mode */}
          <div className="flex items-center bg-muted rounded-full p-0.5">
            <button
              type="button"
              onClick={() => { setMode("text"); setIsRecording(false); }}
              aria-label="Text mode"
              title="Text mode"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                mode === "text" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Keyboard className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleSwitchToVoiceMode}
              disabled={isMicBlocked || isSocketDisconnected}
              aria-label="Voice mode"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300 ${
                mode === "voice" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              }`}
              title={isMicBlocked ? "Microphone not available" : isSocketDisconnected ? "Voice disabled while offline" : "Voice mode"}
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
          </div>
        </div>
      </div>

      {/* Messages & Content */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto py-4 space-y-2 chat-scrollbar bg-background">
        {connectionError && (
          <div className="px-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {connectionError}
            </div>
          </div>
        )}
        {micError && mode === "voice" && (
          <div className="px-4">
            <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-xs text-yellow-300">
              {micError}
            </div>
          </div>
        )}
        {messages.map((msg, idx) => {
          const isLatest = idx === messages.length - 1 && msg.role === "assistant";
          return (
            <ChatMessageComponent
              key={msg.id}
              message={msg}
              isLatest={isLatest}
              openedAtMs={openedAtMsRef.current}
              onTypingTick={scrollToBottom}
              assistantAvatarUrl={clinicProfile?.avatarUrl}
            />
          );
        })}
        {isTyping && <TypingIndicator assistantAvatarUrl={clinicProfile?.avatarUrl} />}

        <AnimatePresence mode="wait">
          {/* Topic selection */}
          {mode === "text" && showTopics && !isTyping && !selectedTopic && (
            <motion.div key="topics" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <TopicSelector onSelectTopic={handleSelectTopic} />
            </motion.div>
          )}
          {mode === "text" && selectedTopic && !isTyping && (
            <motion.div key="topic-questions" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <TopicQuestions topic={selectedTopic} onComplete={handleTopicComplete} onBack={handleBackToTopics} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Input area */}
      <div className="border-t border-border/70 bg-gradient-to-b from-chat-input to-card p-3">
          <AnimatePresence mode="wait">
            {mode === "text" ? (
              <motion.form
                key="text-input"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                onSubmit={handleSubmit}
                className="flex items-center gap-2 rounded-2xl border border-border/70 bg-chat-input/90 p-1.5 shadow-inner shadow-black/10"
              >
                {!selectedTopic && (
                  <motion.button
                    type="button"
                    // UI action: show/hide topic shortcuts in text mode.
                    onClick={handleToggleTopics}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-9 h-9 rounded-xl border border-primary/30 bg-primary/10 text-primary flex items-center justify-center hover:bg-primary/20 transition-colors"
                    title={showTopics ? "Hide topics" : "Show topics"}
                  >
                    {showTopics ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M17.94 17.94A10.94 10.94 0 0112 20C7 20 2.73 16.89 1 12c.68-1.93 1.86-3.63 3.35-4.94M9.9 4.24A10.93 10.93 0 0112 4c5 0 9.27 3.11 11 8a11.07 11.07 0 01-1.67 2.98M1 1l22 22" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2"/>
                      </svg>
                    )}
                  </motion.button>
                )}
                <textarea
                  value={input}
                  // Input event: updates controlled text message state.
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleInputKeyDown}
                  placeholder="Ask about your health..."
                  disabled={isTyping || isSocketDisconnected}
                  rows={1}
                  className="chat-composer-scrollbar flex-1 max-h-28 resize-none bg-transparent rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none"
                />
                <motion.button
                  type="submit"
                  disabled={!input.trim() || isTyping || isSocketDisconnected}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="w-10 h-10 rounded-xl bg-gradient-to-r from-primary to-accent flex items-center justify-center shadow-md shadow-primary/30 disabled:opacity-40 disabled:shadow-none transition-all"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-primary-foreground">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </motion.button>
              </motion.form>
            ) : (
              <motion.div
                key="voice-input"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="flex items-center gap-3 rounded-2xl border border-border/70 bg-chat-input/80 px-3 py-3"
              >
                <div className="flex-1 overflow-hidden">
                  <VoiceWaveform isActive={isRecording} levels={liveWaveLevels} />
                </div>
                <motion.button
                  // UI action: starts recording if idle, stops if already recording.
                  onClick={toggleRecording}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.9 }}
                  disabled={isMicBlocked || isSocketDisconnected || isTyping}
                  className={`w-12 h-12 rounded-full flex-shrink-0 flex items-center justify-center transition-all duration-300 ${
                    isRecording
                      ? "bg-destructive shadow-lg shadow-destructive/30"
                      : "bg-gradient-to-r from-primary to-accent shadow-lg shadow-primary/30 disabled:opacity-50 disabled:shadow-none"
                  }`}
                >
                  {isRecording ? (
                    <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ duration: 1, repeat: Infinity }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-destructive-foreground">
                        <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
                      </svg>
                    </motion.div>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-primary-foreground">
                      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" stroke="currentColor" strokeWidth="2"/>
                      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  )}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ChatWindow;
