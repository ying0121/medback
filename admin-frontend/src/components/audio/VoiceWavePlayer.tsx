import { useCallback, useEffect, useRef, useState } from "react";
import { Languages, Mic, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VoiceWavePlayerProps {
  audioBase64?: string | null;
  audioMimeType?: string | null;
  transcript?: string;
  isUser?: boolean;
  hasError?: boolean;
  compact?: boolean;
}

export default function VoiceWavePlayer({
  audioBase64,
  audioMimeType,
  transcript = "",
  isUser = false,
  hasError = false,
  compact = false
}: VoiceWavePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);
  const [hasAudio, setHasAudio] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  useEffect(() => {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }
    setBlobUrl(null);
    setWaveformBars([]);
    setHasAudio(false);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);

    if (!audioBase64) return;

    let cancelled = false;

    (async () => {
      try {
        const parsed = parseAudioPayload(audioBase64, audioMimeType || undefined);
        if (!parsed?.audioBase64) return;

        const blob = base64ToAudioBlob(parsed.audioBase64, parsed.mimeType);
        if (!blob || cancelled) return;

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }

        setBlobUrl(url);
        setHasAudio(true);

        const arr = await blob.arrayBuffer();
        if (cancelled) return;
        try {
          const analysis = await analyzeWaveform(arr, 48);
          if (!cancelled) {
            setWaveformBars(analysis.bars);
            if (analysis.durationSec > 0) setDuration(analysis.durationSec);
          }
        } catch {
          if (!cancelled) setWaveformBars(buildWaveformBarsFromBytes(parsed.audioBase64, 48));
        }
      } catch {
        // no audio
      }
    })();

    return () => {
      cancelled = true;
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [audioBase64, audioMimeType]);

  useEffect(() => {
    if (!blobUrl) return;
    const el = new Audio(blobUrl);
    el.preload = "metadata";
    el.volume = volume;
    audioRef.current = el;

    const onMeta = () => {
      if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration);
    };
    const onTime = () => setCurrentTime(el.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnd = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    el.addEventListener("loadedmetadata", onMeta);
    el.addEventListener("timeupdate", onTime);
    el.addEventListener("play", onPlay);
    el.addEventListener("pause", onPause);
    el.addEventListener("ended", onEnd);

    return () => {
      el.pause();
      el.src = "";
      el.removeEventListener("loadedmetadata", onMeta);
      el.removeEventListener("timeupdate", onTime);
      el.removeEventListener("play", onPlay);
      el.removeEventListener("pause", onPause);
      el.removeEventListener("ended", onEnd);
      audioRef.current = null;
    };
  }, [blobUrl, volume]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  const seek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = audioRef.current;
      if (!el || !duration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      el.currentTime = ratio * duration;
      setCurrentTime(ratio * duration);
    },
    [duration]
  );

  const toggleMute = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    const next = !isMuted;
    el.muted = next;
    setIsMuted(next);
  }, [isMuted]);

  const handleVolume = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value);
    const el = audioRef.current;
    if (el) el.volume = v;
    setVolume(v);
    if (v > 0) setIsMuted(false);
  }, []);

  const progress = duration > 0 ? currentTime / duration : 0;
  const playedBars = Math.round(progress * waveformBars.length);

  const text = transcript || "";
  const isLong = text.length > 200;
  const displayed = isLong && !showFullTranscript ? `${text.slice(0, 200)}...` : text;

  const accent = hasError ? "bg-red-500/70" : isUser ? "bg-white/70" : "bg-primary/60";
  const accentDim = hasError ? "bg-red-500/25" : isUser ? "bg-white/25" : "bg-primary/20";
  const trackBg = hasError ? "bg-red-200/70" : isUser ? "bg-white/20" : "bg-muted";
  const trackFill = hasError ? "bg-red-600" : isUser ? "bg-white" : "bg-primary";

  if (!audioBase64 && !text) return null;

  return (
    <div className={cn("flex flex-col gap-2 w-full", compact && "gap-1.5")}>
      {audioBase64 && (
        <>
          <div className="flex items-center gap-1.5">
            <Mic className="h-3.5 w-3.5 shrink-0 opacity-70" />
            <span className="text-[11px] font-semibold uppercase tracking-widest opacity-70">Voice</span>
            {duration > 0 && (
              <span className="ml-auto text-[11px] tabular-nums opacity-60">
                {formatDuration(currentTime)} / {formatDuration(duration)}
              </span>
            )}
          </div>

          {waveformBars.length > 0 && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Seek audio"
              className={cn(
                "flex items-end gap-[2px] px-1.5 rounded-xl cursor-pointer select-none",
                compact ? "h-10" : "h-12"
              )}
              style={{
                background: hasError
                  ? "rgba(239,68,68,0.14)"
                  : isUser
                    ? "rgba(255,255,255,0.08)"
                    : "rgba(0,0,0,0.06)"
              }}
              onClick={seek}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") togglePlay();
              }}
            >
              {waveformBars.map((height, idx) => (
                <span
                  key={idx}
                  className={cn("flex-1 rounded-sm transition-all duration-75", idx < playedBars ? accent : accentDim)}
                  style={{ height: `${height}%`, minWidth: 2 }}
                />
              ))}
            </div>
          )}

          {hasAudio ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={togglePlay}
                className={cn(
                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0 transition-opacity hover:opacity-90 active:scale-95",
                  hasError
                    ? "bg-red-600 text-white"
                    : isUser
                      ? "bg-white text-primary"
                      : "bg-primary text-primary-foreground"
                )}
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? (
                  <Pause className="h-3.5 w-3.5 fill-current" />
                ) : (
                  <Play className="h-3.5 w-3.5 fill-current translate-x-[1px]" />
                )}
              </button>

              <div
                role="button"
                tabIndex={-1}
                aria-label="Seek"
                className={cn("flex-1 h-1.5 rounded-full cursor-pointer relative overflow-hidden", trackBg)}
                onClick={seek}
              >
                <div
                  className={cn("absolute inset-y-0 left-0 rounded-full transition-all", trackFill)}
                  style={{ width: `${progress * 100}%` }}
                />
              </div>

              {!compact && (
                <>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className="opacity-60 hover:opacity-100 transition-opacity shrink-0"
                    aria-label={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted || volume === 0 ? (
                      <VolumeX className="h-3.5 w-3.5" />
                    ) : (
                      <Volume2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolume}
                    className="w-14 h-1 accent-current cursor-pointer shrink-0"
                    aria-label="Volume"
                  />
                </>
              )}
            </div>
          ) : (
            <div className="text-[11px] rounded-lg px-2.5 py-1.5 border border-border text-muted-foreground">
              Unable to load audio.
            </div>
          )}
        </>
      )}

      {text ? (
        <div
          className={cn(
            "rounded-xl px-3 py-2 text-xs flex gap-2",
            hasError
              ? "bg-red-50 border border-red-200"
              : isUser
                ? "bg-white/10"
                : "bg-accent/10 border border-accent/20"
          )}
        >
          <Languages className="h-3.5 w-3.5 shrink-0 mt-0.5 opacity-60" />
          <div>
            <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">Transcript</div>
            <div className="leading-relaxed">{displayed}</div>
            {isLong && (
              <button
                type="button"
                className="mt-1.5 text-[11px] underline underline-offset-2 opacity-70 hover:opacity-100"
                onClick={() => setShowFullTranscript((v) => !v)}
              >
                {showFullTranscript ? "Read less" : "Read more"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function base64ToAudioBlob(audioBase64: string, mimeType: string): Blob | null {
  try {
    const normalized = normalizeBase64(audioBase64);
    const binary = window.atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mimeType || "audio/webm" });
  } catch {
    return null;
  }
}

function parseAudioPayload(audioPayload: string, fallbackMimeType?: string) {
  if (!audioPayload) return null;
  const m = audioPayload.match(/^data:([^;]+);base64,(.+)$/s);
  if (m) {
    return { mimeType: m[1] || fallbackMimeType || "audio/webm", audioBase64: normalizeBase64(m[2] || "") };
  }
  return { mimeType: fallbackMimeType || "audio/webm", audioBase64: normalizeBase64(audioPayload) };
}

function normalizeBase64(input: string) {
  const s = String(input || "").replace(/\s+/g, "").replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (s.length % 4)) % 4;
  return pad ? s + "=".repeat(pad) : s;
}

async function analyzeWaveform(arrayBuffer: ArrayBuffer, barsCount = 48) {
  const Ctx = (window as Window & { webkitAudioContext?: typeof AudioContext }).AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("No AudioContext");
  const ctx = new Ctx() as AudioContext;
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const data = decoded.getChannelData(0);
    const chunk = Math.max(1, Math.floor(data.length / barsCount));
    const bars: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const s = i * chunk;
      const e = Math.min(data.length, s + chunk);
      let sq = 0;
      for (let j = s; j < e; j++) sq += data[j] * data[j];
      bars.push(Math.max(8, Math.min(100, Math.sqrt(sq / (e - s)) * 260)));
    }
    return { bars, durationSec: decoded.duration };
  } finally {
    ctx.close();
  }
}

function buildWaveformBarsFromBytes(audioBase64: string, barsCount = 48): number[] {
  try {
    const bytes = Uint8Array.from(window.atob(normalizeBase64(audioBase64)), (c) => c.charCodeAt(0));
    if (!bytes.length) return [];
    const chunk = Math.max(1, Math.floor(bytes.length / barsCount));
    const bars: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const s = i * chunk;
      const e = Math.min(bytes.length, s + chunk);
      let sum = 0;
      for (let j = s; j < e; j++) sum += Math.abs(bytes[j] - 128);
      bars.push(Math.max(8, Math.min(100, (sum / (e - s) / 128) * 100)));
    }
    return bars;
  } catch {
    return [];
  }
}

function formatDuration(sec: number) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
