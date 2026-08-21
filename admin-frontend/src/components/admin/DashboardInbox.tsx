import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bot,
  Building2,
  CalendarCheck,
  Inbox,
  Mail,
  MapPin,
  MessageSquare,
  Mic,
  Search,
} from "lucide-react";
import VoiceWavePlayer from "@/components/audio/VoiceWavePlayer";
import { Input } from "@/components/ui/input";
import { formatNyDate, formatNyTime, isNyToday, isNyYesterday, zonedDateKey } from "@/lib/appTimeZone";
import {
  listConversationsByClinic,
  listMessages,
  type Clinic,
  type Conversation,
  type DashboardClinicStat,
  type Message,
} from "@/lib/api";
import { getThemeColorOption } from "@/lib/themeColors";
import { cn } from "@/lib/utils";

type InboxConversation = Conversation & { clinic: Clinic };

export default function DashboardInbox({
  clinics,
  clinicStats,
}: {
  clinics: Clinic[];
  clinicStats: DashboardClinicStat[];
}) {
  const [clinicQuery, setClinicQuery] = useState("");
  const [convQuery, setConvQuery] = useState("");
  const [activeClinic, setActiveClinic] = useState<Clinic | null>(null);
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [activeConv, setActiveConv] = useState<InboxConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const statsById = useMemo(
    () => new Map(clinicStats.map((row) => [row.clinicId, row])),
    [clinicStats]
  );

  useEffect(() => {
    if (!clinics.length) {
      setActiveClinic(null);
      return;
    }
    setActiveClinic((current) => {
      if (current && clinics.some((clinic) => clinic.id === current.id)) {
        return clinics.find((clinic) => clinic.id === current.id) ?? clinics[0];
      }
      return clinics[0];
    });
  }, [clinics]);

  useEffect(() => {
    if (!activeClinic) {
      setConversations([]);
      setActiveConv(null);
      return;
    }
    let mounted = true;
    setLoadingList(true);
    setConvQuery("");
    listConversationsByClinic(activeClinic.id)
      .then((rows) => {
        if (!mounted) return;
        const mapped = rows
          .map((row) => ({ ...row, clinic: activeClinic }))
          .sort(
            (a, b) =>
              new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
          );
        setConversations(mapped);
        setActiveConv(mapped[0] ?? null);
      })
      .finally(() => {
        if (mounted) setLoadingList(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeClinic?.id]);

  useEffect(() => {
    if (!activeConv) {
      setMessages([]);
      return;
    }
    let mounted = true;
    setLoadingThread(true);
    listMessages(activeConv.id)
      .then((rows) => {
        if (!mounted) return;
        setMessages(
          [...rows].sort(
            (a, b) =>
              new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          )
        );
      })
      .finally(() => {
        if (mounted) setLoadingThread(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeConv?.id]);

  useEffect(() => {
    if (!threadRef.current) return;
    threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, activeConv?.id, loadingThread]);

  const filteredClinics = useMemo(() => {
    const q = clinicQuery.trim().toLowerCase();
    const rows = clinics.map((clinic) => ({
      clinic,
      stats: statsById.get(clinic.id),
    }));
    const matched = q
      ? rows.filter(({ clinic }) =>
          [clinic.name, clinic.acronym, clinic.city, clinic.state]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : rows;
    return matched.sort(
      (a, b) => (b.stats?.conversations ?? 0) - (a.stats?.conversations ?? 0)
    );
  }, [clinics, clinicQuery, statsById]);

  const filteredConversations = useMemo(() => {
    const q = convQuery.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((row) =>
      [row.title, row.userName, row.userEmail, row.lastMessagePreview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [conversations, convQuery]);

  const theme = getThemeColorOption(activeClinic?.themeColor);

  return (
    <section className="bg-card border border-border/80 rounded-2xl shadow-soft overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">Conversation history</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Choose a clinic, then open a patient thread. Transcripts are shown oldest to newest.
          </p>
        </div>
        {activeClinic && (
          <div className="hidden sm:flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: theme.from }}
            />
            Viewing {activeClinic.name}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(280px,340px)_1fr] min-h-[680px] h-[min(820px,calc(100vh-7rem))]">
        <aside className="border-b lg:border-b-0 lg:border-r border-border bg-muted/30 flex flex-col min-h-0">
          <div className="p-3 border-b border-border">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
              Clinics
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={clinicQuery}
                onChange={(e) => setClinicQuery(e.target.value)}
                placeholder="Find a clinic…"
                className="pl-8 h-9 bg-card text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {filteredClinics.map(({ clinic, stats }) => {
              const selected = activeClinic?.id === clinic.id;
              const colors = getThemeColorOption(clinic.themeColor);
              return (
                <button
                  key={clinic.id}
                  type="button"
                  onClick={() => setActiveClinic(clinic)}
                  className={cn(
                    "w-full text-left rounded-xl px-2.5 py-2.5 transition-all border",
                    selected
                      ? "bg-card shadow-sm border-border"
                      : "border-transparent hover:bg-card/70"
                  )}
                >
                  <div className="flex gap-2.5">
                    <ClinicAvatar clinic={clinic} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm truncate">{clinic.name}</div>
                        <span
                          className={cn(
                            "text-[11px] tabular-nums rounded-full px-1.5 py-0.5 shrink-0",
                            selected ? "text-white" : "bg-muted text-muted-foreground"
                          )}
                          style={selected ? { background: colors.from } : undefined}
                        >
                          {stats?.conversations ?? 0}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {[clinic.city, clinic.state].filter(Boolean).join(", ") || clinic.acronym}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredClinics.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-10">No matching clinics</p>
            )}
          </div>
        </aside>

        <div className="border-b lg:border-b-0 lg:border-r border-border flex flex-col min-h-0 bg-background">
          <div className="px-4 py-3 border-b border-border">
            {activeClinic ? (
              <div className="flex items-center gap-2.5 mb-3">
                <ClinicAvatar clinic={activeClinic} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{activeClinic.name}</div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    {conversations.length} {conversations.length === 1 ? "conversation" : "conversations"}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm font-medium mb-3">Conversations</div>
            )}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={convQuery}
                onChange={(e) => setConvQuery(e.target.value)}
                placeholder="Search this clinic…"
                className="pl-8 h-9 text-sm"
                disabled={!activeClinic}
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList && (
              <div className="p-3 space-y-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-[76px] rounded-xl bg-muted animate-pulse" />
                ))}
              </div>
            )}
            {!loadingList && filteredConversations.length === 0 && (
              <div className="px-6 py-16 text-center">
                <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium">
                  {activeClinic ? `No conversations at ${activeClinic.name}` : "Select a clinic"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Web chat threads for this location will appear here.
                </p>
              </div>
            )}
            {!loadingList &&
              filteredConversations.map((row) => {
                const selected = activeConv?.id === row.id;
                const colors = getThemeColorOption(row.clinic.themeColor);
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setActiveConv(row)}
                    className={cn(
                      "w-full text-left px-4 py-3.5 border-b border-border/60 transition-colors border-l-2",
                      selected ? "bg-card" : "border-l-transparent hover:bg-muted/50"
                    )}
                    style={selected ? { borderLeftColor: colors.from, background: `${colors.from}0d` } : undefined}
                  >
                    <div className="flex gap-3">
                      <PatientAvatar name={row.userName || row.title} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-sm truncate">
                            {row.userName || row.title}
                          </div>
                          <span className="text-[11px] text-muted-foreground shrink-0">
                            {formatInboxTime(row.lastMessageAt)}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                          {row.lastMessageType === "voice" && (
                            <Mic className="inline h-3 w-3 mr-1 -mt-0.5" />
                          )}
                          {row.lastMessagePreview || "No messages yet"}
                        </p>
                        <div className="text-[11px] text-muted-foreground mt-1">
                          {row.messageCount} {row.messageCount === 1 ? "message" : "messages"}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>

        <div className="flex flex-col min-h-0 min-w-0 bg-muted/20">
          {!activeConv || !activeClinic ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
              <div className="h-14 w-14 rounded-2xl bg-gradient-primary text-primary-foreground flex items-center justify-center mb-4 shadow-md">
                <Inbox className="h-7 w-7" />
              </div>
              <h4 className="font-semibold">Clinic conversation workspace</h4>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">
                Select a clinic on the left, then a patient conversation to review the full transcript.
              </p>
            </div>
          ) : (
            <>
              <div
                className="h-1.5 shrink-0"
                style={{ background: `linear-gradient(90deg, ${theme.from}, ${theme.to})` }}
              />
              <ThreadHeader conversation={activeConv} />
              <div ref={threadRef} className="flex-1 overflow-y-auto px-5 py-5">
                {loadingThread ? (
                  <div className="space-y-4 max-w-3xl mx-auto">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className={cn("flex", i % 2 ? "justify-end" : "justify-start")}>
                        <div className="h-16 w-[55%] rounded-2xl bg-muted animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    No messages in this conversation.
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto space-y-3">
                    {messages.map((message, index) => {
                      const prev = messages[index - 1];
                      const showDay = !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
                      return (
                        <div key={message.id}>
                          {showDay && (
                            <div className="flex items-center gap-3 my-5">
                              <div className="h-px flex-1 bg-border" />
                              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                                {formatDayLabel(message.createdAt)}
                              </span>
                              <div className="h-px flex-1 bg-border" />
                            </div>
                          )}
                          <ThreadMessage message={message} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function ThreadHeader({ conversation }: { conversation: InboxConversation }) {
  const location = [conversation.clinic.city, conversation.clinic.state].filter(Boolean).join(", ");
  return (
    <div className="px-5 py-3.5 border-b border-border bg-card">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <PatientAvatar name={conversation.userName || conversation.title} size="md" />
          <div className="min-w-0">
            <div className="font-semibold truncate">
              {conversation.userName || conversation.title}
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground">
              {conversation.userEmail && (
                <span className="inline-flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3" />
                  {conversation.userEmail}
                </span>
              )}
              <span className="inline-flex items-center gap-1 truncate">
                <Building2 className="h-3 w-3" />
                {conversation.clinic.name}
              </span>
              {location && (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3" />
                  {location}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground shrink-0">
          {conversation.messageCount} messages
        </div>
      </div>
    </div>
  );
}

function ThreadMessage({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const isVoice = message.type === "voice";
  const isError = message.status === "error";
  const appointment = isAppointmentMessage(message.content);

  if (appointment) {
    return (
      <div className="flex justify-center py-1">
        <div className="max-w-[85%] rounded-xl border border-primary/20 bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-1.5">
            <CalendarCheck className="h-4 w-4 text-primary" />
            Appointment request
          </div>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {appointment.body}
          </p>
          <div className="text-[11px] text-muted-foreground mt-2">
            {formatNyTime(message.createdAt)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2.5", isUser ? "justify-end" : "justify-start")}>
      {!isUser && (
        <div className="h-8 w-8 rounded-full bg-gradient-primary text-primary-foreground flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Bot className="h-4 w-4" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-2.5 text-sm shadow-sm",
          isError
            ? "bg-destructive/10 text-destructive border border-destructive/20 rounded-lg"
            : isUser
              ? "bg-gradient-primary text-primary-foreground rounded-br-md"
              : "bg-card border border-border text-foreground rounded-bl-md"
        )}
      >
        {isVoice ? (
          <VoiceWavePlayer
            isUser={isUser}
            hasError={isError}
            audioBase64={message.audioUrl}
            audioMimeType={message.audioMimeType}
            transcript={message.translatedText ?? message.content}
          />
        ) : (
          <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
        )}
        <div
          className={cn(
            "text-[10px] mt-1.5",
            isError
              ? "text-destructive/80"
              : isUser
                ? "text-primary-foreground/70"
                : "text-muted-foreground"
          )}
        >
          {formatNyTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function ClinicAvatar({ clinic }: { clinic: Clinic }) {
  if (clinic.avatar) {
    return (
      <img
        src={clinic.avatar}
        alt=""
        className="h-10 w-10 rounded-xl object-cover border border-border/60 shrink-0"
      />
    );
  }
  const colors = getThemeColorOption(clinic.themeColor);
  return (
    <div
      className="h-10 w-10 rounded-xl shrink-0 text-xs font-semibold text-white flex items-center justify-center"
      style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}
    >
      {(clinic.acronym || clinic.name).slice(0, 2).toUpperCase()}
    </div>
  );
}

function PatientAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = initialsFromName(name);
  return (
    <div
      className={cn(
        "rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-semibold shrink-0 border border-border/60",
        size === "md" ? "h-10 w-10 text-sm" : "h-9 w-9 text-xs"
      )}
    >
      {initials}
    </div>
  );
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "V";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function formatInboxTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (isNyToday(date)) return formatNyTime(date);
  if (isNyYesterday(date)) return "Yesterday";
  const todayKey = zonedDateKey(new Date());
  const key = zonedDateKey(date);
  if (todayKey && key && todayKey > key) {
    const today = new Date(`${todayKey}T12:00:00`);
    const then = new Date(`${key}T12:00:00`);
    const days = Math.round((today.getTime() - then.getTime()) / 86400000);
    if (days < 7) {
      return formatNyDate(date, { weekday: "short", month: undefined, day: undefined, year: undefined });
    }
  }
  return formatNyDate(date, { weekday: undefined, year: undefined });
}

function dayKey(iso: string) {
  return zonedDateKey(iso);
}

function formatDayLabel(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  if (isNyToday(date)) return "Today";
  if (isNyYesterday(date)) return "Yesterday";
  return formatNyDate(date, { year: undefined });
}

function isAppointmentMessage(content: string) {
  const text = String(content || "");
  if (!text.startsWith("[Appointment request]")) return null;
  return { body: text.replace("[Appointment request]", "").trim() };
}
