import { useEffect, useMemo, useState } from "react";
import { Building2, MessageSquare, MessagesSquare, Users, ChevronRight, Search } from "lucide-react";
import VoiceWavePlayer from "@/components/audio/VoiceWavePlayer";
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
                        <VoiceWavePlayer
                          isUser={isUser}
                          hasError={isError}
                          audioBase64={m.audioUrl}
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
