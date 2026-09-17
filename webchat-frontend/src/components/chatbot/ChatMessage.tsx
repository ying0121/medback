import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { ChatMessage as ChatMessageType } from "./types";
import TypingEffect from "./TypingEffect";
import ClinicAvatar from "./ClinicAvatar";

interface ChatMessageProps {
  // Raw message payload to render in the bubble.
  message: ChatMessageType;
  // Used to apply typing effect only to the newest assistant reply.
  isLatest: boolean;
  // Window-open timestamp used to avoid replaying effects for old messages.
  openedAtMs?: number;
  // Callback used by TypingEffect to keep the scroll anchored to bottom.
  onTypingTick?: () => void;
  // Fired once the typing animation on the latest message finishes.
  onTypingDone?: () => void;
  assistantAvatarUrl?: string | null;
}

// Renders a single chat row. User messages are right-aligned;
// assistant messages are left-aligned with a bot avatar.
// Props:
// - message: canonical transcript item to render.
// - isLatest: marks newest assistant message to enable typing effect.
// - onTypingTick: optional callback used to keep scroll anchored while typing.
const ChatMessageComponent = ({
  message,
  isLatest,
  openedAtMs,
  onTypingTick,
  onTypingDone,
  assistantAvatarUrl,
}: ChatMessageProps) => {
  const isUser = message.role === "user";
  const isErrorReply = !isUser && message.status === "error";
  const isVoice = message.kind === "voice" && !!message.voice;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [durationSec, setDurationSec] = useState(message.voice?.durationSec ?? 0);
  const [currentSec, setCurrentSec] = useState(0);
  const rafRef = useRef<number | null>(null);
  const hasAutoPlayedRef = useRef(false);
  const transcriptTextRef = useRef<HTMLParagraphElement | null>(null);
  const [transcriptExpanded, setTranscriptExpanded] = useState(false);
  const [transcriptOverflows, setTranscriptOverflows] = useState(false);

  const voiceTranscript = message.voice?.transcript;
  const showVoiceTranscript =
    !!voiceTranscript && voiceTranscript !== "Voice message recorded.";
  const messageCreatedAtMs = message.timestamp instanceof Date
    ? message.timestamp.getTime()
    : new Date(message.timestamp).getTime();
  const isCreatedAfterOpen =
    typeof openedAtMs === "number" ? messageCreatedAtMs >= openedAtMs : true;
  const usesTypingEffect = !isUser && isLatest && isCreatedAfterOpen && !isVoice;

  useEffect(() => {
    setTranscriptExpanded(false);
  }, [voiceTranscript, message.id]);

  useEffect(() => {
    hasAutoPlayedRef.current = false;
  }, [message.id]);

  useEffect(() => {
    if (!onTypingDone || !isLatest || isUser || usesTypingEffect) return;
    onTypingDone();
  }, [isLatest, isUser, usesTypingEffect, message.id, onTypingDone]);

  useLayoutEffect(() => {
    if (!showVoiceTranscript || transcriptExpanded) {
      setTranscriptOverflows(false);
      return;
    }
    const el = transcriptTextRef.current;
    if (!el) return;
    const measure = () => {
      setTranscriptOverflows(el.scrollWidth > el.clientWidth + 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [showVoiceTranscript, transcriptExpanded, voiceTranscript, message.id]);

  // Attaches audio element events used by voice-message playback UI.
  // Events:
  // - loadedmetadata: updates duration after browser decodes metadata.
  // - timeupdate: keeps elapsed time label in sync.
  // - play/pause/ended: drives control-state styling and reset behavior.
  useEffect(() => {
    if (!isVoice || !audioRef.current) return;
    const audio = audioRef.current;

    // Syncs state duration with actual media metadata duration.
    const onLoaded = () => {
      setDurationSec(audio.duration || message.voice?.durationSec || 0);
    };
    // Mirrors native audio time updates into React state.
    const onTime = () => setCurrentSec(audio.currentTime || 0);
    // Marks UI as playing when the audio starts.
    const onPlay = () => setIsPlaying(true);
    // Marks UI as paused when the audio pauses.
    const onPause = () => setIsPlaying(false);
    // Resets local time cursor once playback reaches the end.
    const onEnd = () => {
      setIsPlaying(false);
      setCurrentSec(0);
    };

    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnd);

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnd);
    };
  }, [isVoice, message.voice?.durationSec]);

  // Uses requestAnimationFrame while playing to keep waveform progress fluid.
  useEffect(() => {
    if (!isPlaying || !audioRef.current) {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Per-frame callback for high-frequency time sampling.
    const tick = () => {
      if (audioRef.current) {
        setCurrentSec(audioRef.current.currentTime || 0);
      }
      rafRef.current = window.requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPlaying]);

  // Toggles voice-message playback for the current bubble.
  // No params: reads active audio element from audioRef.
  const togglePlayback = async () => {
    if (!audioRef.current) return;
    if (audioRef.current.paused) {
      await audioRef.current.play();
    } else {
      audioRef.current.pause();
    }
  };

  // Triggers the same play action as the play button, once for backend voice messages.
  useEffect(() => {
    if (!isVoice || !message.voice?.autoPlay || hasAutoPlayedRef.current || !isCreatedAfterOpen) return;
    if (!audioRef.current) return;
    hasAutoPlayedRef.current = true;
    void togglePlayback().catch(() => {
      hasAutoPlayedRef.current = false;
    });
  }, [isVoice, message.voice?.autoPlay, message.id, isCreatedAfterOpen]);

  // Formats seconds to m:ss display used in the right-side timer.
  // @param sec elapsed or total duration in seconds.
  const formatClock = (sec: number) => `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, "0")}`;
  const totalDuration = durationSec || message.voice?.durationSec || 0;
  const progressRatio = totalDuration > 0 ? Math.min(1, currentSec / totalDuration) : 0;
  const waveformLevels = message.voice?.waveformLevels ?? Array.from({ length: 30 }).map((_, i) => (i % 5) / 5 + 0.2);
  const waveBars = 40;
  const visibleLevels = Array.from({ length: waveBars }, (_, idx) => waveformLevels[idx % waveformLevels.length] ?? 0.2);
  // Click-to-seek handler for waveform strip.
  // @param event mouse coordinates are mapped into a 0..1 seek ratio.
  const handleSeekWaveform = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || totalDuration <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, x / rect.width));
    audioRef.current.currentTime = ratio * totalDuration;
    setCurrentSec(audioRef.current.currentTime);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={`flex items-end gap-2 px-4 py-1 ${isUser ? "justify-end" : "justify-start"}`}
    >
      {!isUser && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", delay: 0.1 }}
          className="mb-1"
        >
          <ClinicAvatar src={assistantAvatarUrl} size="sm" />
        </motion.div>
      )}

      <motion.div
        layout
        className={`max-w-[80%] px-4 py-2.5 text-sm leading-relaxed ${
          isVoice
            ? "bg-gradient-to-br from-[hsl(var(--voice-bubble-from))] via-[hsl(var(--chat-bot-msg))] to-[hsl(var(--voice-bubble-to))] text-foreground rounded-2xl shadow-lg shadow-black/30"
            : isUser
            ? "bg-gradient-to-r from-primary to-accent text-primary-foreground rounded-2xl rounded-br-sm"
            : isErrorReply
              ? "bg-destructive/15 text-destructive border border-destructive/30 rounded-2xl rounded-tl-sm"
              : "bg-chat-bot text-foreground rounded-2xl rounded-tl-sm"
        }`}
      >
        {isVoice ? (
          <div className="w-[228px] max-w-full rounded-lg border border-[hsl(var(--voice-border)/0.45)] bg-gradient-to-b from-[hsl(var(--voice-panel-from)/0.35)] to-[hsl(var(--voice-panel-to)/0.22)] px-2.5 py-2 shadow-lg shadow-slate-950/45">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                className="w-6 h-6 rounded-full border border-[hsl(var(--voice-border)/0.55)] bg-[hsl(var(--voice-panel-from)/0.25)] text-[hsl(var(--voice-accent))] flex items-center justify-center hover:bg-[hsl(var(--voice-panel-from)/0.4)] transition-colors"
                // Playback action button (play/pause).
                onClick={() => { void togglePlayback(); }}
              >
                {isPlaying ? (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                ) : (
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 6v12l9-6z" />
                  </svg>
                )}
              </button>

              <div className="flex-1 min-w-0">
                <div
                  role="slider"
                  aria-label="Seek voice message"
                  tabIndex={0}
                  // Seeks audio position to the clicked point on waveform.
                  onClick={handleSeekWaveform}
                  className="relative h-6 cursor-pointer overflow-hidden"
                >
                  <div className="relative h-full flex items-center justify-between">
                    {visibleLevels.map((level, idx) => {
                      const rendered = isPlaying ? Math.min(1, level * 1.04) : level;
                      return (
                        <span
                          key={`${message.id}-bar-${idx}`}
                          className={`w-[2px] rounded-full transition-[height,background-color] duration-100 ${
                            idx <= Math.floor(progressRatio * (waveBars - 1))
                              ? "bg-[hsl(var(--voice-accent))]"
                              : "bg-slate-500/95"
                          }`}
                          style={{
                            height: `${Math.max(4, Math.min(18, rendered * 14))}px`,
                          }}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>

              <span className="w-[54px] flex-shrink-0 text-right text-[10px] tabular-nums text-[hsl(var(--voice-text-muted))]">
                {`${formatClock(currentSec)} / ${formatClock(totalDuration)}`}
              </span>
            </div>

            {showVoiceTranscript && (
              <div className="mt-1.5 min-w-0">
                <p
                  ref={transcriptTextRef}
                  className={`text-[11px] text-[hsl(var(--voice-text))] leading-relaxed ${
                    transcriptExpanded
                      ? "whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
                      : "truncate"
                  }`}
                >
                  {voiceTranscript}
                </p>
                {(transcriptOverflows || transcriptExpanded) && (
                  <button
                    type="button"
                    className="mt-0.5 text-[10px] font-medium text-[hsl(var(--voice-accent))] hover:text-[hsl(var(--voice-accent)/0.85)] hover:underline"
                    onClick={() => setTranscriptExpanded((v) => !v)}
                  >
                    {transcriptExpanded ? "Read less" : "Read more"}
                  </button>
                )}
              </div>
            )}
            <audio ref={audioRef} id={`voice-${message.id}`} src={message.voice?.audioUrl} className="hidden" />
          </div>
        ) : (
          // Only the latest assistant message animates typing; historical messages render instantly.
          usesTypingEffect ? (
          <TypingEffect text={message.content} speed={16} onTick={onTypingTick} onComplete={onTypingDone} />
        ) : (
          <span className="block whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
            {message.content}
          </span>
          )
        )}
      </motion.div>
    </motion.div>
  );
};

export default ChatMessageComponent;
