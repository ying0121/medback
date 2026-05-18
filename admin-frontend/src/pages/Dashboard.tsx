import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, MessageSquare, MessagesSquare, Users, ChevronRight, Search, Mic, Languages, Play, Pause, Volume2, VolumeX } from "lucide-react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import PageHeader from "@/components/admin/PageHeader";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getStats,
  listClinics,
  listConversationsByClinic,
  listMessages,
  type Clinic,
  type Conversation,
  type Message,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";

export default function Dashboard() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicConversationCounts, setClinicConversationCounts] = useState<Record<string, number>>({});
  const [stats, setStats] = useState<Awaited<ReturnType<typeof getStats>> | null>(null);
  const [activeClinic, setActiveClinic] = useState<Clinic | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;
    const allowed = user?.role === "Admin" ? undefined : user?.clinicIds;
    listClinics().then(async (all) => {
      const filtered = allowed ? all.filter((c) => allowed.includes(c.id)) : all;
      if (!mounted) return;
      setClinics(filtered);
      if (filtered[0]) setActiveClinic(filtered[0]);

      const pairs = await Promise.all(
        filtered.map(async (c) => {
          try {
            const cs = await listConversationsByClinic(c.id);
            return [c.id, cs.length];
          } catch {
            return [c.id, 0];
          }
        })
      );
      if (!mounted) return;
      setClinicConversationCounts(Object.fromEntries(pairs));
    });
    getStats(allowed).then(setStats);
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!activeClinic) return;
    setActiveConv(null);
    setMessages([]);
    listConversationsByClinic(activeClinic.id).then((cs) => {
      setConversations(cs);
      if (cs[0]) setActiveConv(cs[0]);
    });
  }, [activeClinic]);

  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }
    listMessages(activeConv.id).then(setMessages);
  }, [activeConv]);

  const filteredClinics = useMemo(
    () => clinics.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())),
    [clinics, search]
  );
  const displayMessages = useMemo(
    () =>
      [...messages].sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      ),
    [messages]
  );

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title={`Welcome back, ${user?.name.split(" ")[0]}`}
        description="Browse chat history by clinic and conversation."
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Building2} label="Clinics" value={stats?.totalClinics ?? "—"} />
        <StatCard icon={MessagesSquare} label="Conversations" value={stats?.totalConversations ?? "—"} />
        <StatCard icon={MessageSquare} label="Messages" value={stats?.totalMessages ?? "—"} />
        <StatCard icon={Users} label="Users" value={stats?.totalUsers ?? "—"} />
      </div>

      {/* Chart */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold">Messages this week</h3>
            <p className="text-sm text-muted-foreground">Daily conversation volume across your clinics</p>
          </div>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats?.perDay ?? []}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "0.5rem",
                  fontSize: "12px",
                }}
              />
              <Bar dataKey="count" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Drill-down: Clinics → Conversations → Messages */}
      <div className="grid grid-cols-12 gap-4 h-[640px]">
        {/* Clinics */}
        <div className="col-span-3 bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border">
            <h4 className="font-medium text-sm mb-3">Clinics</h4>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clinics…"
                className="pl-9 h-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2">
              {filteredClinics.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveClinic(c)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between gap-2 transition-colors",
                    activeClinic?.id === c.id
                      ? "bg-primary/5 text-primary border border-primary/20"
                      : "hover:bg-muted"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.acronym} · {c.city}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {clinicConversationCounts[c.id] ?? 0}
                    </span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </button>
              ))}
              {filteredClinics.length === 0 && (
                <div className="text-sm text-muted-foreground p-4 text-center">No clinics</div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Conversations */}
        <div className="col-span-4 bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border">
            <h4 className="font-medium text-sm">Conversations</h4>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {activeClinic ? activeClinic.name : "Select a clinic"}
            </p>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {conversations.map((cv) => (
                <button
                  key={cv.id}
                  onClick={() => setActiveConv(cv)}
                  className={cn(
                    "w-full text-left px-3 py-3 rounded-lg transition-colors",
                    activeConv?.id === cv.id
                      ? "bg-primary/5 border border-primary/20"
                      : "hover:bg-muted border border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{cv.title}</div>
                    <span className="text-xs text-muted-foreground shrink-0">{cv.messageCount} msgs</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">
                    {cv.userName || "Unknown user"}
                    {cv.userEmail ? ` · ${cv.userEmail}` : ""}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(cv.lastMessageAt).toLocaleString()}
                  </div>
                </button>
              ))}
              {conversations.length === 0 && activeClinic && (
                <div className="text-sm text-muted-foreground p-4 text-center">No conversations</div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Messages */}
        <div className="col-span-5 bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border">
            <h4 className="font-medium text-sm truncate">{activeConv?.title ?? "Messages"}</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeConv ? `${messages.length} messages` : "Select a conversation"}
            </p>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {displayMessages.map((m) => {
                const isUser = m.role === "user";
                const isVoice = m.type === "voice";
                const isError = m.status === "error";
                return (
                  <div key={m.id} className={cn("flex", isUser ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] rounded-2xl px-4 py-3 text-sm space-y-2",
                        isError
                          ? "bg-red-100 text-red-900 border border-red-300 rounded-lg"
                          : isUser
                          ? "bg-gradient-primary text-primary-foreground rounded-br-sm"
                          : "bg-muted text-foreground rounded-bl-sm"
                      )}
                    >
                      {isVoice ? (
                        <VoiceMessageContent
                          isUser={isUser}
                          hasError={isError}
                          audioUrl={m.audioUrl}
                          audioMimeType={m.audioMimeType}
                          transcript={m.translatedText ?? m.content}
                        />
                      ) : (
                        <div>{m.content}</div>
                      )}
                      <div className={cn(
                        "text-[10px] opacity-70",
                        isError ? "text-red-700" : isUser ? "text-primary-foreground" : "text-muted-foreground"
                      )}>
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                );
              })}
              {messages.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-12">
                  No messages
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}

function VoiceMessageContent({
  isUser,
  hasError,
  audioUrl,
  audioMimeType,
  transcript,
}: {
  isUser: boolean;
  hasError?: boolean;
  audioUrl?: string;
  audioMimeType?: string;
  transcript: string;
}) {
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

  // Build a Blob URL once per audioUrl change
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

    if (!audioUrl) return;

    let cancelled = false;

    (async () => {
      try {
        const parsed = parseAudioPayload(audioUrl, audioMimeType);
        if (!parsed?.audioBase64) return;

        const blob = base64ToAudioBlob(parsed.audioBase64, parsed.mimeType);
        if (!blob || cancelled) return;

        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        if (cancelled) { URL.revokeObjectURL(url); return; }

        setBlobUrl(url);
        setHasAudio(true);

        // Analyze waveform from decoded PCM
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
  }, [audioUrl, audioMimeType]);

  // Sync audio element with blobUrl
  useEffect(() => {
    if (!blobUrl) return;
    const el = new Audio(blobUrl);
    el.preload = "metadata";
    el.volume = volume;
    audioRef.current = el;

    const onMeta = () => { if (isFinite(el.duration) && el.duration > 0) setDuration(el.duration); };
    const onTime = () => setCurrentTime(el.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };

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

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) { el.play().catch(() => {}); }
    else { el.pause(); }
  }, []);

  const seek = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    el.currentTime = ratio * duration;
    setCurrentTime(ratio * duration);
  }, [duration]);

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

  return (
    <div className="flex flex-col gap-2 w-full">
      {/* Header row */}
      <div className="flex items-center gap-1.5">
        <Mic className="h-3.5 w-3.5 shrink-0 opacity-70" />
        <span className="text-[11px] font-semibold uppercase tracking-widest opacity-70">Voice</span>
        {duration > 0 && (
          <span className="ml-auto text-[11px] tabular-nums opacity-60">
            {formatDuration(currentTime)} / {formatDuration(duration)}
          </span>
        )}
      </div>

      {/* Waveform + seek area */}
      {waveformBars.length > 0 && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Seek audio"
          className="flex items-end gap-[2px] h-12 px-1.5 rounded-xl cursor-pointer select-none"
          style={{
            background: hasError
              ? "rgba(239,68,68,0.14)"
              : isUser
                ? "rgba(255,255,255,0.08)"
                : "rgba(0,0,0,0.06)"
          }}
          onClick={seek}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") togglePlay(); }}
        >
          {waveformBars.map((height, idx) => (
            <span
              key={idx} // eslint-disable-line react/no-array-index-key
              className={cn("flex-1 rounded-sm transition-all duration-75", idx < playedBars ? accent : accentDim)}
              style={{ height: `${height}%`, minWidth: 2 }}
            />
          ))}
        </div>
      )}

      {/* Controls row */}
      {hasAudio ? (
        <div className="flex items-center gap-2">
          {/* Play / Pause */}
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
            {isPlaying
              ? <Pause className="h-3.5 w-3.5 fill-current" />
              : <Play className="h-3.5 w-3.5 fill-current translate-x-[1px]" />}
          </button>

          {/* Seek bar */}
          <div
            role="button"
            tabIndex={-1}
            aria-label="Seek"
            className={cn("flex-1 h-1.5 rounded-full cursor-pointer relative overflow-hidden", trackBg)}
            onClick={seek}
            onKeyDown={() => {}}
          >
            <div
              className={cn("absolute inset-y-0 left-0 rounded-full transition-all", trackFill)}
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          {/* Volume */}
          <button
            type="button"
            onClick={toggleMute}
            className="opacity-60 hover:opacity-100 transition-opacity shrink-0"
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted || volume === 0
              ? <VolumeX className="h-3.5 w-3.5" />
              : <Volume2 className="h-3.5 w-3.5" />}
          </button>
          <input
            type="range"
            min={0} max={1} step={0.05}
            value={isMuted ? 0 : volume}
            onChange={handleVolume}
            className="w-14 h-1 accent-current cursor-pointer shrink-0"
            aria-label="Volume"
          />
        </div>
      ) : (
        audioUrl ? (
          <div className={cn(
            "text-[11px] rounded-lg px-2.5 py-1.5 border",
            hasError
              ? "border-red-300 text-red-700 bg-red-50"
              : isUser
                ? "border-white/20 text-white/60"
                : "border-border text-muted-foreground"
          )}>
            Unable to load audio.
          </div>
        ) : null
      )}

      {/* Transcript */}
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
                className="mt-1.5 text-[11px] underline underline-offset-2 opacity-70 hover:opacity-100 transition-opacity"
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

// --- Audio helpers ---

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
  const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!Ctx) throw new Error("No AudioContext");
  const ctx = new Ctx() as AudioContext;
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const data = decoded.getChannelData(0);
    const chunk = Math.max(1, Math.floor(data.length / barsCount));
    const bars: number[] = [];
    for (let i = 0; i < barsCount; i++) {
      const s = i * chunk, e = Math.min(data.length, s + chunk);
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
      const s = i * chunk, e = Math.min(bytes.length, s + chunk);
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

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number | string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold mt-1">{value}</div>
        </div>
        <div className="h-10 w-10 rounded-xl bg-gradient-accent/10 flex items-center justify-center text-accent-foreground">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </div>
  );
}
