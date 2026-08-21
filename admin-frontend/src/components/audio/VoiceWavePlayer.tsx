import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";

export interface VoiceWavePlayerProps {
  audioBase64?: string | null;
  audioMimeType?: string | null;
  transcript?: string;
  isUser?: boolean;
  hasError?: boolean;
  compact?: boolean;
  darkMode?: boolean;
}

const BAR_COUNT = 96;

export default function VoiceWavePlayer({
  audioBase64,
  audioMimeType,
  transcript = "",
  isUser = false,
  hasError = false,
  compact = false,
  darkMode = false
}: VoiceWavePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const blobUrlRef = useRef<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);
  const [hasAudio, setHasAudio] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);

  const palette = useMemo(
    () => playerPalette({ isUser, hasError, darkMode }),
    [isUser, hasError, darkMode]
  );

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
          const analysis = await analyzeWaveform(arr, BAR_COUNT);
          if (!cancelled) {
            setWaveformBars(analysis.bars);
            if (analysis.durationSec > 0) setDuration(analysis.durationSec);
          }
        } catch {
          if (!cancelled) setWaveformBars(buildWaveformBarsFromBytes(parsed.audioBase64, BAR_COUNT));
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
    el.volume = 1;
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
  }, [blobUrl]);

  useEffect(() => {
    const el = audioRef.current;
    if (el) el.volume = isMuted ? 0 : 1;
  }, [isMuted]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformBars.length === 0) return;
    const el = audioRef.current;
    const t = el?.currentTime ?? currentTime;
    const d = (el && isFinite(el.duration) && el.duration > 0 ? el.duration : duration) || 0;
    const progress = d > 0 ? Math.min(1, Math.max(0, t / d)) : 0;
    drawMirroredWaveform(canvas, waveformBars, progress, palette);
  }, [waveformBars, currentTime, duration, palette]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const height = compact ? 36 : 44;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${height}px`;
      draw();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, [draw, compact, waveformBars.length]);

  useEffect(() => {
    draw();
    if (!isPlaying) return undefined;
    let frame = 0;
    const tick = () => {
      draw();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isPlaying, draw]);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }, []);

  const seekFromClientX = useCallback(
    (clientX: number, target: HTMLElement) => {
      const el = audioRef.current;
      const d = duration || el?.duration || 0;
      if (!el || !d) return;
      const rect = target.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      el.currentTime = ratio * d;
      setCurrentTime(ratio * d);
      draw();
    },
    [duration, draw]
  );

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const text = transcript || "";
  const isLong = text.length > 220;
  const displayed = isLong && !showFullTranscript ? `${text.slice(0, 220).trim()}…` : text;

  if (!audioBase64 && !text) return null;

  return (
    <div className={cn("flex flex-col w-full min-w-[220px]", compact ? "gap-1.5" : "gap-2.5")}>
      {audioBase64 && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={togglePlay}
            disabled={!hasAudio}
            className={cn(
              "h-9 w-9 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-95 disabled:opacity-40",
              "shadow-sm"
            )}
            style={{ background: palette.controlBg, color: palette.controlFg }}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current translate-x-[1px]" />
            )}
          </button>

          <div className="flex-1 min-w-0">
            <div
              ref={wrapRef}
              className="w-full cursor-pointer"
              onClick={(e) => seekFromClientX(e.clientX, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  togglePlay();
                }
              }}
              role="slider"
              tabIndex={0}
              aria-label="Audio waveform"
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(currentTime)}
            >
              <canvas ref={canvasRef} className="block w-full" />
            </div>
          </div>

          <div className="flex flex-col items-end shrink-0 gap-1">
            <span className="text-[11px] tabular-nums font-medium opacity-70">
              {duration > 0 ? `${formatDuration(currentTime)} / ${formatDuration(duration)}` : "—"}
            </span>
            {!compact && (
              <button
                type="button"
                onClick={toggleMute}
                className="opacity-50 hover:opacity-100 transition-opacity"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {audioBase64 && !hasAudio && (
        <div className="text-[11px] opacity-70">Unable to load audio.</div>
      )}

      {text ? (
        <div className={cn("text-[13px] leading-relaxed", compact && "text-xs")}>
          <p className="opacity-[0.92]">{displayed}</p>
          {isLong && (
            <button
              type="button"
              className="mt-1 text-[11px] font-medium opacity-70 hover:opacity-100 underline underline-offset-2"
              onClick={() => setShowFullTranscript((v) => !v)}
            >
              {showFullTranscript ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      ) : null}
    </div>
  );
}

function playerPalette({
  isUser,
  hasError,
  darkMode
}: {
  isUser: boolean;
  hasError: boolean;
  darkMode: boolean;
}) {
  if (hasError) {
    return {
      played: "#ef4444",
      rest: "rgba(239,68,68,0.28)",
      playhead: "#b91c1c",
      controlBg: "#dc2626",
      controlFg: "#ffffff"
    };
  }
  if (darkMode) {
    return {
      played: "#7dd3fc",
      rest: "rgba(148,163,184,0.45)",
      playhead: "#e0f2fe",
      controlBg: "#0f172a",
      controlFg: "#7dd3fc"
    };
  }
  if (isUser) {
    return {
      played: "rgba(255,255,255,0.96)",
      rest: "rgba(255,255,255,0.28)",
      playhead: "#ffffff",
      controlBg: "#ffffff",
      controlFg: "hsl(235 65% 22%)"
    };
  }
  return {
    played: "hsl(222 40% 32%)",
    rest: "hsl(230 12% 82%)",
    playhead: "hsl(235 65% 28%)",
    controlBg: "hsl(235 65% 22%)",
    controlFg: "#ecfeff"
  };
}

function drawMirroredWaveform(
  canvas: HTMLCanvasElement,
  bars: number[],
  progress: number,
  palette: ReturnType<typeof playerPalette>
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);

  const n = bars.length;
  const gap = Math.max(1, width / n * 0.32);
  const barW = Math.max(1.25, (width - gap * (n - 1)) / n);
  const mid = height / 2;
  const maxH = height * 0.42;
  const playedUntil = progress * width;

  for (let i = 0; i < n; i++) {
    const x = i * (barW + gap);
    const amp = Math.max(0.08, Math.min(1, bars[i] / 100));
    const h = Math.max(height * 0.06, amp * maxH);
    const played = x + barW * 0.5 <= playedUntil;
    ctx.fillStyle = played ? palette.played : palette.rest;
    roundRect(ctx, x, mid - h, barW, h * 2, Math.min(barW / 2, 2));
    ctx.fill();
  }

  if (progress > 0 && progress < 1) {
    ctx.fillStyle = palette.playhead;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(playedUntil, height * 0.12, Math.max(1.5, width * 0.003), height * 0.76);
    ctx.globalAlpha = 1;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
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

async function analyzeWaveform(arrayBuffer: ArrayBuffer, barsCount = BAR_COUNT) {
  const Ctx = (window as Window & { webkitAudioContext?: typeof AudioContext }).AudioContext
    || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) throw new Error("No AudioContext");
  const ctx = new Ctx() as AudioContext;
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const data = decoded.getChannelData(0);
    const chunk = Math.max(1, Math.floor(data.length / barsCount));
    const raw: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const s = i * chunk;
      const e = Math.min(data.length, s + chunk);
      let peak = 0;
      let sumSq = 0;
      for (let j = s; j < e; j++) {
        const abs = Math.abs(data[j]);
        if (abs > peak) peak = abs;
        sumSq += data[j] * data[j];
      }
      const rms = Math.sqrt(sumSq / Math.max(1, e - s));
      raw.push(peak * 0.72 + rms * 0.28);
    }
    const bars = normalizeEnvelope(smoothEnvelope(raw));
    return { bars, durationSec: decoded.duration };
  } finally {
    ctx.close();
  }
}

function buildWaveformBarsFromBytes(audioBase64: string, barsCount = BAR_COUNT): number[] {
  try {
    const bytes = Uint8Array.from(window.atob(normalizeBase64(audioBase64)), (c) => c.charCodeAt(0));
    if (!bytes.length) return [];
    const chunk = Math.max(1, Math.floor(bytes.length / barsCount));
    const raw: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const s = i * chunk;
      const e = Math.min(bytes.length, s + chunk);
      let peak = 0;
      let sum = 0;
      for (let j = s; j < e; j++) {
        const v = Math.abs(bytes[j] - 128) / 128;
        if (v > peak) peak = v;
        sum += v;
      }
      raw.push(peak * 0.7 + (sum / Math.max(1, e - s)) * 0.3);
    }
    return normalizeEnvelope(smoothEnvelope(raw));
  } catch {
    return [];
  }
}

function smoothEnvelope(values: number[], passes = 2) {
  let out = values;
  for (let p = 0; p < passes; p++) {
    out = out.map((v, i, arr) => {
      const left = arr[i - 1] ?? v;
      const right = arr[i + 1] ?? v;
      return (left + v * 2 + right) / 4;
    });
  }
  return out;
}

function normalizeEnvelope(values: number[]) {
  const max = Math.max(...values, 0.0001);
  return values.map((v) => {
    const norm = Math.sqrt(Math.max(0, v) / max);
    return Math.max(10, Math.min(100, 10 + norm * 90));
  });
}

function formatDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
