import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  Loader2,
  AlertTriangle,
  Phone,
  MessagesSquare,
  Megaphone,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listSystemAlerts,
  runSystemAlertAnalysis,
  type SystemAlertItem,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PRIORITY_STYLE: Record<string, string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  high: "bg-amber-500/15 text-amber-800 border-amber-500/30",
  medium: "bg-sky-500/15 text-sky-800 border-sky-500/30",
  low: "bg-muted text-muted-foreground border-border",
};

function SourceIcon({ type }: { type: string }) {
  if (type === "call") return <Phone className="h-3.5 w-3.5 shrink-0" />;
  if (type === "campaign") return <Megaphone className="h-3.5 w-3.5 shrink-0" />;
  return <MessagesSquare className="h-3.5 w-3.5 shrink-0" />;
}

function timeAgo(iso: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function AlertBellMenu() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [alerts, setAlerts] = useState<SystemAlertItem[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSystemAlerts({ status: "open", limit: 8, page: 1 });
      setAlerts(res.alerts || []);
      setOpenCount(res.openCount ?? 0);
      setCriticalCount(res.criticalCount ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const onAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await runSystemAlertAnalysis({ lookbackDays: 14, limit: 40 });
      toast.success(
        res.created > 0
          ? `Analysis complete — ${res.created} new alert${res.created === 1 ? "" : "s"}`
          : "Analysis complete — no new alerts"
      );
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const badge = criticalCount > 0 ? criticalCount : openCount;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full"
          aria-label="System alerts"
        >
          <Bell className="h-4 w-4" />
          {badge > 0 ? (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] px-0.5 rounded-full text-[10px] font-semibold flex items-center justify-center text-white",
                criticalCount > 0 ? "bg-destructive" : "bg-med-amber"
              )}
            >
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-border/70">
          <DropdownMenuLabel className="p-0 font-semibold">System alerts</DropdownMenuLabel>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={(e) => {
              e.preventDefault();
              void onAnalyze();
            }}
            disabled={analyzing}
          >
            {analyzing ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 mr-1" />
            )}
            Analyze
          </Button>
        </div>

        <div className="max-h-[22rem] overflow-y-auto py-1">
          {loading && alerts.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading…
            </div>
          ) : alerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-muted-foreground">
              <AlertTriangle className="h-5 w-5 mx-auto mb-2 opacity-40" />
              No open alerts. Run Analyze to scan histories.
            </div>
          ) : (
            alerts.map((a) => (
              <DropdownMenuItem key={a.id} asChild className="cursor-pointer p-0">
                <Link
                  to="/alerts"
                  className="flex flex-col gap-1 px-3 py-2.5 focus:bg-accent"
                  onClick={() => setOpen(false)}
                >
                  <div className="flex items-start gap-2 w-full">
                    <span
                      className={cn(
                        "mt-0.5 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        PRIORITY_STYLE[a.priority] || PRIORITY_STYLE.medium
                      )}
                    >
                      {a.priority}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug line-clamp-2">
                        {a.title}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <SourceIcon type={a.sourceType} />
                        <span className="capitalize">{a.sourceType}</span>
                        <span>·</span>
                        <span>{timeAgo(a.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </DropdownMenuItem>
            ))
          )}
        </div>

        <DropdownMenuSeparator className="my-0" />
        <div className="p-1.5">
          <DropdownMenuItem asChild>
            <Link
              to="/alerts"
              className="flex items-center justify-center gap-1.5 rounded-md py-2 text-sm font-medium"
              onClick={() => setOpen(false)}
            >
              View all alerts
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
