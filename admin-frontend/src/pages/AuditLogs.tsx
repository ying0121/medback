import { useCallback, useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, Loader2, Trash2 } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
} from "@/components/ui/alert-dialog";
import { listAuditLogs, clearAllAuditLogs, type AuditLogItem } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const ACTION_OPTIONS = [
  "all",
  "LOGIN_SUCCESS",
  "LOGIN_FAILURE",
  "CREATE",
  "READ",
  "UPDATE",
  "DELETE",
] as const;

const OUTCOME_OPTIONS = ["all", "success", "failure"] as const;

function formatWhen(iso: string | null) {
  if (!iso) return { date: "—", time: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: iso, time: "" };
  const opts: Intl.DateTimeFormatOptions = { timeZone: "America/New_York" };
  return {
    date: d.toLocaleDateString("en-US", {
      ...opts,
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
    time: d.toLocaleTimeString("en-US", {
      ...opts,
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    }),
  };
}

function actionClass(action: string) {
  if (action.includes("LOGIN_FAILURE") || action === "DELETE") {
    return "border-destructive/40 text-destructive";
  }
  if (action.includes("LOGIN_SUCCESS") || action === "CREATE") {
    return "border-emerald-400/50 text-emerald-700";
  }
  if (action === "UPDATE") return "border-amber-400/50 text-amber-800";
  return "border-border text-muted-foreground";
}

/** ISO country code → national flag image (flagcdn). LOCAL uses a badge. */
function CountryFlag({
  code,
  name,
  className,
}: {
  code?: string | null;
  name?: string | null;
  className?: string;
}) {
  const c = String(code || "").toUpperCase();
  if (!c) {
    return (
      <span
        className={cn(
          "inline-flex h-4 w-5 items-center justify-center rounded-[2px] bg-muted text-[9px] text-muted-foreground",
          className
        )}
        title="Unknown location"
      >
        ?
      </span>
    );
  }
  if (c === "LOCAL") {
    return (
      <span
        className={cn(
          "inline-flex h-4 w-5 items-center justify-center rounded-[2px] bg-slate-200 text-[9px] font-semibold text-slate-600",
          className
        )}
        title={name || "Local / private network"}
      >
        LAN
      </span>
    );
  }
  return (
    <img
      src={`https://flagcdn.com/24x18/${c.toLowerCase()}.png`}
      srcSet={`https://flagcdn.com/48x36/${c.toLowerCase()}.png 2x`}
      width={20}
      height={15}
      alt={name || c}
      title={name || c}
      className={cn("inline-block rounded-[2px] object-cover shadow-sm", className)}
      loading="lazy"
      onError={(e) => {
        (e.currentTarget as HTMLImageElement).style.display = "none";
      }}
    />
  );
}

function IpWithFlag({ row }: { row: AuditLogItem }) {
  const ip = row.ipAddress || "—";
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <CountryFlag code={row.countryCode} name={row.countryName} />
      <div className="min-w-0">
        <div className="font-mono text-sm font-medium truncate" title={ip}>
          {ip}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">
          {row.countryName || row.countryCode || "Unknown location"}
        </div>
      </div>
    </div>
  );
}

export default function AuditLogs() {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [action, setAction] = useState<string>("all");
  const [outcome, setOutcome] = useState<string>("all");
  const [draftQ, setDraftQ] = useState("");
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAuditLogs({
        q: q || undefined,
        action: action === "all" ? undefined : action,
        outcome: outcome === "all" ? undefined : outcome,
        page,
        limit: 40,
      });
      setItems(res.items);
      setTotal(res.total);
      setTotalPages(res.totalPages);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [q, action, outcome, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const onClearAll = async () => {
    setClearing(true);
    try {
      const res = await clearAllAuditLogs();
      toast.success(`Cleared ${res.deleted.toLocaleString()} audit events`);
      setConfirmClear(false);
      setPage(1);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to clear audit logs");
    } finally {
      setClearing(false);
    }
  };

  const columns: Column<AuditLogItem>[] = [
    {
      key: "when",
      header: "Date / time",
      className: "w-[160px]",
      searchable: (r) => r.occurredAt || "",
      render: (r) => {
        const { date, time } = formatWhen(r.occurredAt);
        return (
          <div className="whitespace-nowrap" title={r.occurredAt || undefined}>
            <div className="text-sm font-medium text-foreground">{date}</div>
            {time ? (
              <div className="text-[11px] font-mono text-muted-foreground">{time} ET</div>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "ip",
      header: "IP address",
      className: "w-[200px]",
      searchable: (r) =>
        `${r.ipAddress || ""} ${r.countryCode || ""} ${r.countryName || ""}`,
      render: (r) => <IpWithFlag row={r} />,
    },
    {
      key: "actor",
      header: "Actor",
      searchable: (r) => `${r.actorName || ""} ${r.actorEmail || ""} ${r.actorRole || ""}`,
      render: (r) => (
        <div className="min-w-[160px]">
          <div className="text-sm font-medium truncate">{r.actorName || "—"}</div>
          <div className="text-[11px] text-muted-foreground truncate">
            {r.actorEmail || "unknown"}
            {r.actorRole ? ` · ${r.actorRole}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      className: "w-[140px]",
      searchable: (r) => `${r.action} ${r.outcome}`,
      render: (r) => (
        <div className="space-y-1">
          <Badge variant="outline" className={cn("text-[10px]", actionClass(r.action))}>
            {r.action}
          </Badge>
          <div
            className={cn(
              "text-[10px] uppercase tracking-wide",
              r.outcome === "failure" ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {r.outcome}
          </div>
        </div>
      ),
    },
    {
      key: "resource",
      header: "Resource",
      searchable: (r) => `${r.resourceType} ${r.resourceId || ""} ${r.clinicId || ""}`,
      render: (r) => (
        <div className="min-w-[140px]">
          <div className="text-sm font-medium">{r.resourceType}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {r.resourceId ? `#${r.resourceId}` : "—"}
            {r.clinicId ? ` · clinic ${r.clinicId}` : ""}
          </div>
        </div>
      ),
    },
    {
      key: "summary",
      header: "Summary",
      searchable: (r) => `${r.summary || ""} ${r.path || ""}`,
      render: (r) => (
        <div className="min-w-[220px] max-w-[360px]">
          <div className="text-sm truncate">{r.summary || r.path || "—"}</div>
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            {[r.method, r.path, r.statusCode != null ? String(r.statusCode) : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <PageHeader
        accent={2}
        title="Audit logs"
        description="HIPAA access trail — who viewed or changed admin and patient-related records, when, and from where."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmClear(true)}
              disabled={loading || clearing || total === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Clear all
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading || clearing}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Refresh
            </Button>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-4 w-4 text-primary shrink-0" />
        <span>
          Append-only records with IP + country flag. Passwords and secrets are never stored.
          Viewing this page is itself audited.
        </span>
        <span className="ml-auto font-medium text-foreground">{total.toLocaleString()} events</span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Search actor, IP, country, path…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setQ(draftQ.trim());
              }
            }}
          />
        </div>
        <Select
          value={action}
          onValueChange={(v) => {
            setPage(1);
            setAction(v);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Action" />
          </SelectTrigger>
          <SelectContent>
            {ACTION_OPTIONS.map((a) => (
              <SelectItem key={a} value={a}>
                {a === "all" ? "All actions" : a}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={outcome}
          onValueChange={(v) => {
            setPage(1);
            setOutcome(v);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Outcome" />
          </SelectTrigger>
          <SelectContent>
            {OUTCOME_OPTIONS.map((o) => (
              <SelectItem key={o} value={o}>
                {o === "all" ? "All outcomes" : o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          onClick={() => {
            setPage(1);
            setQ(draftQ.trim());
          }}
        >
          Search
        </Button>
      </div>

      {loading && !items.length ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading audit trail…
        </div>
      ) : (
        <>
          <DataTable
            data={items}
            columns={columns}
            rowKey={(r) => r.id}
            pageSize={40}
            searchPlaceholder="Filter loaded rows…"
            emptyMessage="No audit events yet. Admin actions will appear here."
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="text-xs text-muted-foreground">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </>
      )}

      <AlertDialog open={confirmClear} onOpenChange={(o) => !clearing && setConfirmClear(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all audit logs?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes {total.toLocaleString()} audit event
              {total === 1 ? "" : "s"}. A single record will be kept noting that the trail was
              cleared. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={clearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void onClearAll();
              }}
            >
              {clearing ? "Clearing…" : "Clear all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
