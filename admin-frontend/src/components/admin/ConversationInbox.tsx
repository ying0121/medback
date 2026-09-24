import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot,
  Building2,
  CalendarCheck,
  Inbox,
  Mail,
  MapPin,
  MessageSquare,
  Mic,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import VoiceWavePlayer from "@/components/audio/VoiceWavePlayer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  formatNyDate,
  formatNyTime,
  isNyToday,
  isNyYesterday,
  zonedDateKey,
} from "@/lib/appTimeZone";
import {
  deleteConversation,
  deleteConversationsByClinic,
  listConversationsByClinic,
  listMessages,
  type Clinic,
  type Conversation,
  type DashboardClinicStat,
  type Message,
} from "@/lib/api";
import { getThemeColorOption } from "@/lib/themeColors";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type InboxConversation = Conversation & { clinic: Clinic };

const pageEase = [0.22, 1, 0.36, 1] as const;

type Props = {
  clinics: Clinic[];
  clinicStats?: DashboardClinicStat[];
  className?: string;
};

/**
 * Full-page conversation workspace: clinic filter + thread list + transcript.
 */
export default function ConversationInbox({ clinics, clinicStats = [], className }: Props) {
  const [activeClinicId, setActiveClinicId] = useState<string>("");
  const [convQuery, setConvQuery] = useState("");
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [activeConv, setActiveConv] = useState<InboxConversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const statsById = useMemo(
    () => new Map(clinicStats.map((row) => [row.clinicId, row])),
    [clinicStats]
  );

  const activeClinic = useMemo(
    () => clinics.find((c) => c.id === activeClinicId) || null,
    [clinics, activeClinicId]
  );

  useEffect(() => {
    if (!clinics.length) {
      setActiveClinicId("");
      return;
    }
    setActiveClinicId((current) =>
      current && clinics.some((c) => c.id === current) ? current : clinics[0].id
    );
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
        setActiveConv((prev) => {
          if (prev && mapped.some((m) => m.id === prev.id)) {
            return mapped.find((m) => m.id === prev.id) || mapped[0] || null;
          }
          return mapped[0] ?? null;
        });
      })
      .finally(() => {
        if (mounted) setLoadingList(false);
      });
    return () => {
      mounted = false;
    };
  }, [activeClinic?.id, refreshKey]);

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
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
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

  const handleDeleteConversation = async (row: InboxConversation) => {
    try {
      setDeletingId(row.id);
      await deleteConversation(row.id);
      const next = conversations.filter((c) => c.id !== row.id);
      setConversations(next);
      if (activeConv?.id === row.id) {
        setActiveConv(next[0] ?? null);
        setMessages([]);
      }
      toast.success("Conversation deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete conversation");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!activeClinic) return;
    try {
      setClearingAll(true);
      const result = await deleteConversationsByClinic(activeClinic.id);
      setConversations([]);
      setActiveConv(null);
      setMessages([]);
      toast.success(
        result.deletedCount
          ? `Cleared ${result.deletedCount} conversation${result.deletedCount === 1 ? "" : "s"}`
          : "No conversations to clear"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not clear conversations");
    } finally {
      setClearingAll(false);
    }
  };

  const theme = getThemeColorOption(activeClinic?.themeColor);
  const clinicConvCount = activeClinic
    ? statsById.get(activeClinic.id)?.conversations ?? conversations.length
    : 0;

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-border/70 bg-card overflow-hidden shadow-soft",
        "h-[min(820px,calc(100vh-11rem))] min-h-[560px]",
        className
      )}
    >
      {/* Toolbar */}
      <div className="shrink-0 border-b border-border/70 bg-gradient-to-r from-background via-background to-primary/[0.03] px-4 py-3 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <Select
              value={activeClinicId || undefined}
              onValueChange={setActiveClinicId}
              disabled={!clinics.length}
            >
              <SelectTrigger className="w-full sm:w-[260px] h-9 bg-background">
                <SelectValue placeholder="Select clinic" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {clinics.map((clinic) => {
                  const n = statsById.get(clinic.id)?.conversations;
                  return (
                    <SelectItem key={clinic.id} value={clinic.id}>
                      {clinic.name}
                      {typeof n === "number" ? ` (${n})` : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Badge variant="outline" className="text-[11px] tabular-nums font-normal">
              {clinicConvCount} threads
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={convQuery}
                onChange={(e) => setConvQuery(e.target.value)}
                placeholder="Search patients…"
                className="pl-8 h-9"
                disabled={!activeClinic}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              title="Refresh"
              disabled={!activeClinic || loadingList}
              onClick={() => setRefreshKey((k) => k + 1)}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", loadingList && "animate-spin")} />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 shrink-0 text-destructive hover:text-destructive"
                  disabled={!activeClinic || loadingList || clearingAll || conversations.length === 0}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all conversations?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently deletes every webchat thread
                    {activeClinic ? ` for ${activeClinic.name}` : ""} and their messages. This cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={() => void handleClearAll()}
                  >
                    Clear all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </div>

      {/* Split workspace */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[minmax(300px,380px)_1fr]">
        {/* Thread list */}
        <aside className="border-b lg:border-b-0 lg:border-r border-border/70 flex flex-col min-h-0 bg-muted/20">
          <div className="px-4 py-2.5 border-b border-border/60 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Recent threads
            </span>
            {activeClinic ? (
              <span className="text-[11px] text-muted-foreground truncate max-w-[50%]">
                {activeClinic.acronym || activeClinic.city || ""}
              </span>
            ) : null}
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="p-3 space-y-2">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-[72px] rounded-xl bg-muted/80 animate-pulse" />
                ))}
              </div>
            ) : !activeClinic ? (
              <EmptyList
                icon={Building2}
                title="Choose a clinic"
                body="Select a clinic above to load patient webchat threads."
              />
            ) : filteredConversations.length === 0 ? (
              <EmptyList
                icon={MessageSquare}
                title="No conversations"
                body={
                  convQuery
                    ? "No threads match your search."
                    : "Webchat threads for this clinic will appear here."
                }
              />
            ) : (
              <ul className="py-1">
                {filteredConversations.map((row) => {
                  const selected = activeConv?.id === row.id;
                  return (
                    <li key={row.id} className="group relative">
                      <div
                        className={cn(
                          "flex items-stretch border-l-[3px] transition-colors",
                          selected
                            ? "bg-background border-l-primary shadow-[inset_0_0_0_1px_hsl(var(--border)/0.5)]"
                            : "border-l-transparent hover:bg-background/70"
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveConv(row)}
                          className="min-w-0 flex-1 text-left px-4 py-3.5"
                        >
                          <div className="flex gap-3">
                            <PatientAvatar name={row.userName || row.title} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-baseline justify-between gap-2">
                                <span className="font-medium text-sm truncate">
                                  {row.userName || row.title}
                                </span>
                                <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                                  {formatInboxTime(row.lastMessageAt)}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                                {row.lastMessageType === "voice" ? (
                                  <Mic className="inline h-3 w-3 mr-1 -mt-0.5 opacity-70" />
                                ) : null}
                                {row.lastMessagePreview || "No messages yet"}
                              </p>
                              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                                <span className="tabular-nums">
                                  {row.messageCount} msg{row.messageCount === 1 ? "" : "s"}
                                </span>
                                {row.userEmail ? (
                                  <span className="truncate opacity-80">{row.userEmail}</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </button>
                        <div className="flex items-center pr-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                title="Delete conversation"
                                disabled={deletingId === row.id}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Trash2
                                  className={cn(
                                    "h-3.5 w-3.5",
                                    deletingId === row.id && "animate-pulse"
                                  )}
                                />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Permanently remove the thread with{" "}
                                  <strong>{row.userName || row.title}</strong> and all of its
                                  messages. This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  onClick={() => void handleDeleteConversation(row)}
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </aside>

        {/* Transcript */}
        <section className="flex flex-col min-h-0 min-w-0 bg-[hsl(var(--background))]">
          {!activeConv || !activeClinic ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-8 py-16">
              <div
                className="h-16 w-16 rounded-2xl flex items-center justify-center mb-4 text-primary-foreground shadow-md"
                style={{
                  background: `linear-gradient(145deg, ${theme.from}, ${theme.to})`,
                }}
              >
                <Inbox className="h-7 w-7" />
              </div>
              <h3 className="font-display text-lg font-semibold tracking-tight">
                Patient conversation
              </h3>
              <p className="text-sm text-muted-foreground mt-1.5 max-w-sm leading-relaxed">
                Open a thread from the list to review the full agent ↔ patient transcript,
                including voice messages and appointment requests.
              </p>
            </div>
          ) : (
            <>
              <div
                className="h-1 shrink-0"
                style={{
                  background: `linear-gradient(90deg, ${theme.from}, ${theme.to})`,
                }}
              />
              <ThreadHeader conversation={activeConv} />
              <div
                ref={threadRef}
                className="flex-1 overflow-y-auto px-4 sm:px-6 py-5"
                style={{
                  backgroundImage:
                    "radial-gradient(hsl(var(--border) / 0.45) 1px, transparent 1px)",
                  backgroundSize: "18px 18px",
                }}
              >
                {loadingThread ? (
                  <div className="space-y-4 max-w-2xl mx-auto">
                    {[0, 1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn("flex", i % 2 ? "justify-end" : "justify-start")}
                      >
                        <div className="h-14 w-[50%] rounded-2xl bg-muted/80 animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                    No messages in this conversation.
                  </div>
                ) : (
                  <div className="max-w-2xl mx-auto space-y-1">
                    <AnimatePresence initial={false}>
                      {messages.map((message, index) => {
                        const prev = messages[index - 1];
                        const showDay =
                          !prev || dayKey(prev.createdAt) !== dayKey(message.createdAt);
                        return (
                          <motion.div
                            key={message.id}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, ease: pageEase }}
                          >
                            {showDay ? (
                              <div className="flex items-center gap-3 my-5">
                                <div className="h-px flex-1 bg-border/80" />
                                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                                  {formatDayLabel(message.createdAt)}
                                </span>
                                <div className="h-px flex-1 bg-border/80" />
                              </div>
                            ) : null}
                            <ThreadMessage message={message} />
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function EmptyList({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof MessageSquare;
  title: string;
  body: string;
}) {
  return (
    <div className="px-6 py-16 text-center">
      <Icon className="h-8 w-8 mx-auto text-muted-foreground/35 mb-3" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{body}</p>
    </div>
  );
}

function ThreadHeader({ conversation }: { conversation: InboxConversation }) {
  const location = [conversation.clinic.city, conversation.clinic.state]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="px-4 sm:px-5 py-3.5 border-b border-border/70 bg-card/90 backdrop-blur-sm shrink-0">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <PatientAvatar name={conversation.userName || conversation.title} size="md" />
          <div className="min-w-0">
            <div className="font-semibold truncate tracking-tight">
              {conversation.userName || conversation.title}
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
              {conversation.userEmail ? (
                <span className="inline-flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3 shrink-0" />
                  {conversation.userEmail}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1 truncate">
                <Building2 className="h-3 w-3 shrink-0" />
                {conversation.clinic.name}
              </span>
              {location ? (
                <span className="inline-flex items-center gap-1 truncate">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {location}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <Badge variant="secondary" className="shrink-0 tabular-nums font-normal text-[11px]">
          {conversation.messageCount} messages
        </Badge>
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
      <div className="flex justify-center py-2">
        <div className="max-w-[90%] rounded-xl border border-primary/25 bg-card px-4 py-3 shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-1.5">
            <CalendarCheck className="h-3.5 w-3.5" />
            Appointment request
          </div>
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {appointment.body}
          </p>
          <div className="text-[10px] text-muted-foreground mt-2 tabular-nums">
            {formatNyTime(message.createdAt)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-2.5 py-1", isUser ? "justify-end" : "justify-start")}>
      {!isUser ? (
        <div className="h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center shrink-0 mt-0.5 shadow-sm">
          <Bot className="h-3.5 w-3.5" />
        </div>
      ) : null}
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
          isError
            ? "bg-destructive/10 text-destructive border border-destructive/20"
            : isUser
              ? "bg-primary text-primary-foreground rounded-br-md"
              : "bg-card border border-border/80 text-foreground rounded-bl-md"
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
            "text-[10px] mt-1.5 tabular-nums",
            isError
              ? "text-destructive/80"
              : isUser
                ? "text-primary-foreground/65"
                : "text-muted-foreground"
          )}
        >
          {formatNyTime(message.createdAt)}
        </div>
      </div>
    </div>
  );
}

function PatientAvatar({ name, size = "sm" }: { name: string; size?: "sm" | "md" }) {
  const initials = initialsFromName(name);
  return (
    <div
      className={cn(
        "rounded-full bg-secondary text-secondary-foreground flex items-center justify-center font-semibold shrink-0 border border-border/50",
        size === "md" ? "h-10 w-10 text-sm" : "h-9 w-9 text-xs"
      )}
    >
      {initials}
    </div>
  );
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "P";
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
      return formatNyDate(date, {
        weekday: "short",
        month: undefined,
        day: undefined,
        year: undefined,
      });
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
