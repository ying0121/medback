import { useEffect, useMemo, useState } from "react";
import { PhoneCall, RefreshCw, Search } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  listIncomingCalls,
  listIncomingCallMessages,
  type IncomingCall,
  type IncomingCallMessage
} from "@/lib/api";

export default function Calls() {
  const [calls, setCalls] = useState<IncomingCall[]>([]);
  const [activeCall, setActiveCall] = useState<IncomingCall | null>(null);
  const [messages, setMessages] = useState<IncomingCallMessage[]>([]);
  const [search, setSearch] = useState("");
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const refreshCalls = async () => {
    try {
      setLoadingCalls(true);
      const rows = await listIncomingCalls(100);
      setCalls(rows);
      if (!activeCall && rows[0]) setActiveCall(rows[0]);
      if (activeCall) {
        const stillExists = rows.find((c) => c.id === activeCall.id);
        if (!stillExists) setActiveCall(rows[0] || null);
      }
    } finally {
      setLoadingCalls(false);
    }
  };

  useEffect(() => {
    refreshCalls();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeCall) {
      setMessages([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        setLoadingMessages(true);
        const result = await listIncomingCallMessages(activeCall.id);
        if (!mounted) return;
        setMessages(result.messages);
      } finally {
        if (mounted) setLoadingMessages(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [activeCall]);

  const filteredCalls = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return calls;
    return calls.filter((c) =>
      [c.phone, c.callSid, c.status || ""].some((v) => String(v).toLowerCase().includes(q))
    );
  }, [calls, search]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Calling History"
        description="Review inbound call sessions, transcripts, and audio records."
        actions={(
          <Button variant="outline" onClick={refreshCalls} disabled={loadingCalls}>
            <RefreshCw className={cn("h-4 w-4 mr-2", loadingCalls && "animate-spin")} />
            Refresh
          </Button>
        )}
      />

      <div className="grid grid-cols-12 gap-4 h-[680px]">
        <div className="col-span-4 bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border">
            <h4 className="font-medium text-sm mb-3">Calls</h4>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by phone, call SID, status..."
                className="pl-9 h-9"
              />
            </div>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-1">
              {filteredCalls.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCall(c)}
                  className={cn(
                    "w-full text-left px-3 py-3 rounded-lg transition-colors border",
                    activeCall?.id === c.id
                      ? "bg-primary/5 border-primary/20"
                      : "hover:bg-muted border-transparent"
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{c.phone || "Unknown caller"}</div>
                    <span className="text-xs text-muted-foreground shrink-0">{c.seconds || 0}s</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 truncate">SID: {c.callSid || "-"}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {c.createdAt ? new Date(c.createdAt).toLocaleString() : "-"} {c.status ? `· ${c.status}` : ""}
                  </div>
                </button>
              ))}
              {!loadingCalls && filteredCalls.length === 0 && (
                <div className="text-sm text-muted-foreground p-4 text-center">No call history</div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="col-span-8 bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-muted-foreground" />
              {activeCall ? `Call #${activeCall.id} — ${activeCall.phone}` : "Call messages"}
            </h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              {activeCall ? `${messages.length} message rows` : "Select a call"}
            </p>
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {messages.map((m) => {
                const isUser = m.userType === "user";
                return (
                  <div key={m.id} className={cn("flex", isUser ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm space-y-2 border",
                        isUser
                          ? "bg-muted/40 border-border"
                          : "bg-primary/5 border-primary/20"
                      )}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {m.userType} {m.status ? `· ${m.status}` : ""}
                      </div>
                      <div className="whitespace-pre-wrap break-words">
                        {m.transcription || <span className="text-muted-foreground">(No transcription)</span>}
                      </div>
                      {m.audio && (
                        <audio
                          controls
                          preload="none"
                          src={`data:audio/mpeg;base64,${m.audio}`}
                          className="w-full"
                        />
                      )}
                      <div className="text-[10px] text-muted-foreground">
                        {m.createdAt ? new Date(m.createdAt).toLocaleString() : "-"}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!loadingMessages && messages.length === 0 && (
                <div className="text-sm text-muted-foreground text-center py-12">No messages for this call.</div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
