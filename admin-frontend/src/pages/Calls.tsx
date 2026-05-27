import { useEffect, useMemo, useState } from "react";
import { PhoneCall, RefreshCw, Search, Trash2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import VoiceWavePlayer from "@/components/audio/VoiceWavePlayer";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  deleteAllIncomingCalls,
  deleteIncomingCall,
  listIncomingCalls,
  listIncomingCallMessages,
  type IncomingCall,
  type IncomingCallMessage
} from "@/lib/api";

export default function Calls() {
  const { toast } = useToast();
  const [calls, setCalls] = useState<IncomingCall[]>([]);
  const [activeCall, setActiveCall] = useState<IncomingCall | null>(null);
  const [messages, setMessages] = useState<IncomingCallMessage[]>([]);
  const [search, setSearch] = useState("");
  const [loadingCalls, setLoadingCalls] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);

  const refreshCalls = async (preserveActiveId?: string) => {
    try {
      setLoadingCalls(true);
      const rows = await listIncomingCalls(100);
      setCalls(rows);
      const targetId = preserveActiveId || activeCall?.id;
      if (targetId) {
        const stillExists = rows.find((c) => c.id === targetId);
        setActiveCall(stillExists || rows[0] || null);
      } else if (!activeCall && rows[0]) {
        setActiveCall(rows[0]);
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

  const handleDeleteCall = async (call: IncomingCall) => {
    try {
      setDeletingId(call.id);
      await deleteIncomingCall(call.id);
      toast({ title: "Call removed", description: `Deleted history for ${call.phone || "caller"}.` });
      const nextCalls = calls.filter((c) => c.id !== call.id);
      setCalls(nextCalls);
      if (activeCall?.id === call.id) {
        setActiveCall(nextCalls[0] || null);
        setMessages([]);
      }
    } catch (err) {
      toast({
        title: "Could not delete call",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive"
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    try {
      setClearingAll(true);
      const result = await deleteAllIncomingCalls();
      setCalls([]);
      setActiveCall(null);
      setMessages([]);
      toast({
        title: "History cleared",
        description: `Removed ${result.deletedCount} call record(s).`
      });
    } catch (err) {
      toast({
        title: "Could not clear history",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive"
      });
    } finally {
      setClearingAll(false);
    }
  };

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Calling History"
        description="Review inbound call sessions, transcripts, and audio waveforms."
        actions={(
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => refreshCalls()} disabled={loadingCalls}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loadingCalls && "animate-spin")} />
              Refresh
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="text-destructive border-destructive/30 hover:bg-destructive/10"
                  disabled={calls.length === 0 || clearingAll}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear all
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear all call history?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This permanently removes every inbound call and all associated messages. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleClearAll}
                  >
                    Clear all
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
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
                <div
                  key={c.id}
                  className={cn(
                    "group flex items-stretch gap-1 rounded-lg border transition-colors",
                    activeCall?.id === c.id
                      ? "bg-primary/5 border-primary/20"
                      : "hover:bg-muted border-transparent"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setActiveCall(c)}
                    className="flex-1 text-left px-3 py-3 min-w-0"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium truncate">{c.phone || "Unknown caller"}</div>
                      <span className="text-xs text-muted-foreground shrink-0">{c.seconds || 0}s</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 truncate">SID: {c.callSid || "-"}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {c.createdAt ? new Date(c.createdAt).toLocaleString() : "-"}{" "}
                      {c.status ? `· ${c.status}` : ""}
                    </div>
                  </button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <button
                        type="button"
                        className="shrink-0 px-2 text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive transition-all"
                        disabled={deletingId === c.id}
                        aria-label="Delete call"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Trash2 className={cn("h-4 w-4", deletingId === c.id && "animate-pulse")} />
                      </button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this call?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Removes the call record and all transcript/audio messages for{" "}
                          <strong>{c.phone || "this caller"}</strong>.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDeleteCall(c)}
                        >
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              ))}
              {!loadingCalls && filteredCalls.length === 0 && (
                <div className="text-sm text-muted-foreground p-4 text-center">No call history</div>
              )}
            </div>
          </ScrollArea>
        </div>

        <div className="col-span-8 bg-card border border-border rounded-2xl flex flex-col overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border flex items-start justify-between gap-4">
            <div>
              <h4 className="font-medium text-sm flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-muted-foreground" />
                {activeCall ? `Call #${activeCall.id} — ${activeCall.phone}` : "Call messages"}
              </h4>
              <p className="text-xs text-muted-foreground mt-0.5">
                {activeCall ? `${messages.length} message rows` : "Select a call"}
              </p>
            </div>
            {activeCall && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive border-destructive/30 hover:bg-destructive/10 shrink-0"
                    disabled={deletingId === activeCall.id}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Remove call
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this call?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Permanently removes this call and all of its messages.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={() => handleDeleteCall(activeCall)}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-3">
              {messages.map((m) => {
                const isUser = m.userType === "user";
                return (
                  <div key={m.id} className={cn("flex", isUser ? "justify-start" : "justify-end")}>
                    <div
                      className={cn(
                        "max-w-[90%] rounded-2xl px-4 py-3 text-sm space-y-2 border",
                        isUser ? "bg-muted/40 border-border" : "bg-primary/5 border-primary/20"
                      )}
                    >
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {m.userType} {m.status ? `· ${m.status}` : ""}
                      </div>
                      {(m.audio || m.transcription) && (
                        <VoiceWavePlayer
                          audioBase64={m.audio}
                          audioMimeType={m.audioMimeType}
                          transcript={m.transcription}
                          isUser={isUser}
                          compact={false}
                          darkMode
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
                <div className="text-sm text-muted-foreground text-center py-12">
                  No messages for this call.
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
