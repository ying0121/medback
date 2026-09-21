import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  Loader2,
  RefreshCw,
  Trash2,
  Sparkles,
  Mail,
  Phone,
  MessagesSquare,
  Megaphone,
} from "lucide-react";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listSystemAlerts,
  runSystemAlertAnalysis,
  deleteSystemAlert,
  deleteAllSystemAlerts,
  updateSystemAlertStatus,
  notifySystemAlertEmail,
  notifySystemAlertVoice,
  listDoctors,
  type SystemAlertItem,
  type Doctor,
  type AlertPriority,
  type AlertStatus,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const PRIORITY_OPTIONS = ["all", "critical", "high", "medium", "low"] as const;
const STATUS_OPTIONS = ["all", "open", "acknowledged", "resolved"] as const;
const SOURCE_OPTIONS = ["all", "conversation", "call", "campaign"] as const;
const PAGE_SIZE_OPTIONS = [20, 40, 50, 100] as const;

const PRIORITY_CLASS: Record<AlertPriority, string> = {
  critical: "border-destructive/50 bg-destructive/10 text-destructive",
  high: "border-amber-500/40 bg-amber-500/10 text-amber-900",
  medium: "border-sky-500/40 bg-sky-500/10 text-sky-900",
  low: "border-border bg-muted/50 text-muted-foreground",
};

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
    }),
  };
}

function SourceIcon({ type }: { type: string }) {
  if (type === "call") return <Phone className="h-3.5 w-3.5" />;
  if (type === "campaign") return <Megaphone className="h-3.5 w-3.5" />;
  return <MessagesSquare className="h-3.5 w-3.5" />;
}

export default function Alerts() {
  const [items, setItems] = useState<SystemAlertItem[]>([]);
  const [total, setTotal] = useState(0);
  const [openCount, setOpenCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [draftQ, setDraftQ] = useState("");
  const [q, setQ] = useState("");
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("open");
  const [sourceType, setSourceType] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(40);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SystemAlertItem | null>(null);
  const [notifyTarget, setNotifyTarget] = useState<SystemAlertItem | null>(null);
  const [notifyMode, setNotifyMode] = useState<"email" | "voice">("email");
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorId, setDoctorId] = useState<string>("");
  const [toEmail, setToEmail] = useState("");
  const [toPhone, setToPhone] = useState("");
  const [notifying, setNotifying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listSystemAlerts({
        q,
        priority,
        status,
        sourceType,
        page,
        limit: pageSize,
      });
      setItems(res.alerts || []);
      setTotal(res.total ?? 0);
      setOpenCount(res.openCount ?? 0);
      setCriticalCount(res.criticalCount ?? 0);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [q, priority, status, sourceType, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void listDoctors()
      .then(setDoctors)
      .catch(() => setDoctors([]));
  }, []);

  const clinicDoctors = useMemo(() => {
    if (!notifyTarget?.clinicId) return doctors.filter((d) => d.status === "active");
    return doctors.filter(
      (d) => d.status === "active" && String(d.clinicId || "") === String(notifyTarget.clinicId)
    );
  }, [doctors, notifyTarget]);

  const openNotify = (row: SystemAlertItem, mode: "email" | "voice") => {
    setNotifyTarget(row);
    setNotifyMode(mode);
    setDoctorId("");
    setToEmail("");
    setToPhone("");
  };

  const onDoctorPick = (id: string) => {
    setDoctorId(id);
    const doc = doctors.find((d) => String(d.id) === String(id));
    if (doc) {
      if (doc.email) setToEmail(doc.email);
      if (doc.phone) setToPhone(doc.phone);
    }
  };

  const submitNotify = async () => {
    if (!notifyTarget) return;
    setNotifying(true);
    try {
      if (notifyMode === "email") {
        const res = await notifySystemAlertEmail(notifyTarget.id, {
          doctorId: doctorId || undefined,
          toEmail: toEmail.trim() || undefined,
        });
        toast.success(`Alert emailed to ${res.to}`);
      } else {
        const res = await notifySystemAlertVoice(notifyTarget.id, {
          doctorId: doctorId || undefined,
          toPhone: toPhone.trim() || undefined,
          clinicId: notifyTarget.clinicId || undefined,
        });
        toast.success(
          res.channel === "sms"
            ? `Alert SMS sent to ${res.to}`
            : `Voice alert call placed to ${res.to}`
        );
      }
      setNotifyTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Notify failed");
    } finally {
      setNotifying(false);
    }
  };

  const onAnalyze = async () => {
    setAnalyzing(true);
    try {
      const res = await runSystemAlertAnalysis({ lookbackDays: 14, limit: 50 });
      toast.success(
        res.created > 0
          ? `Created ${res.created} alert${res.created === 1 ? "" : "s"} from history`
          : "Scan complete — no new alerts"
      );
      setPage(1);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analysis failed");
    } finally {
      setAnalyzing(false);
    }
  };

  const onDeleteOne = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSystemAlert(deleteTarget.id);
      toast.success("Alert deleted");
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const onClearAll = async () => {
    setClearing(true);
    try {
      const res = await deleteAllSystemAlerts();
      toast.success(`Deleted ${res.deleted} alert${res.deleted === 1 ? "" : "s"}`);
      setConfirmClear(false);
      setPage(1);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Clear failed");
    } finally {
      setClearing(false);
    }
  };

  const onStatus = async (row: SystemAlertItem, next: AlertStatus) => {
    try {
      await updateSystemAlertStatus(row.id, next);
      toast.success(`Marked ${next}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    }
  };

  const columns: Column<SystemAlertItem>[] = [
    {
      key: "priority",
      header: "Priority",
      searchable: (r) => r.priority,
      render: (r) => (
        <Badge variant="outline" className={cn("uppercase text-[10px]", PRIORITY_CLASS[r.priority])}>
          {r.priority}
        </Badge>
      ),
    },
    {
      key: "title",
      header: "Alert",
      searchable: (r) => `${r.title} ${r.analysisResult}`,
      render: (r) => (
        <div className="min-w-[220px] max-w-[320px]">
          <div className="text-sm font-medium leading-snug">{r.title}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground capitalize">
            <SourceIcon type={r.sourceType} />
            {r.sourceType} #{r.sourceId}
          </div>
        </div>
      ),
    },
    {
      key: "analysis",
      header: "Analysis",
      searchable: (r) => r.analysisResult,
      render: (r) => (
        <div className="max-w-[280px] text-sm text-muted-foreground line-clamp-3">
          {r.analysisResult || "—"}
        </div>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      searchable: (r) => r.reason,
      render: (r) => (
        <div className="max-w-[220px] text-sm line-clamp-3">{r.reason || "—"}</div>
      ),
    },
    {
      key: "recommendation",
      header: "Recommendation",
      searchable: (r) => r.recommendation,
      render: (r) => (
        <div className="max-w-[240px] text-sm line-clamp-3">{r.recommendation || "—"}</div>
      ),
    },
    {
      key: "status",
      header: "Status",
      searchable: (r) => r.status,
      render: (r) => (
        <Select
          value={r.status}
          onValueChange={(v) => void onStatus(r, v as AlertStatus)}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="acknowledged">Acknowledged</SelectItem>
            <SelectItem value="resolved">Resolved</SelectItem>
          </SelectContent>
        </Select>
      ),
    },
    {
      key: "when",
      header: "When",
      searchable: (r) => r.createdAt || "",
      render: (r) => {
        const w = formatWhen(r.createdAt);
        return (
          <div className="text-sm whitespace-nowrap">
            <div>{w.date}</div>
            <div className="text-[11px] text-muted-foreground">{w.time}</div>
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Notify / Delete",
      render: (r) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Email doctor"
            onClick={() => openNotify(r, "email")}
          >
            <Mail className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title="Voice / SMS doctor"
            onClick={() => openNotify(r, "voice")}
          >
            <Phone className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-destructive hover:text-destructive"
            title="Delete"
            onClick={() => setDeleteTarget(r)}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="admin-page">
      <PageHeader
        accent={3}
        title="System alerts"
        description="AI + keyword analysis of conversations, calls, and campaigns — priority, reason, and recommended action."
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setConfirmClear(true)}
              disabled={loading || clearing || total === 0}
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete all
            </Button>
            <Button variant="outline" onClick={() => void onAnalyze()} disabled={analyzing || loading}>
              {analyzing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4 mr-1" />
              )}
              Analyze histories
            </Button>
            <Button variant="outline" onClick={() => void load()} disabled={loading || analyzing}>
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

      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5 text-xs text-muted-foreground">
        <Bell className="h-4 w-4 text-primary shrink-0" />
        <span>
          Scans chat, inbound call, and campaign histories. Notify a doctor by email or voice when
          they need to act.
        </span>
        <span className="ml-auto flex items-center gap-3 font-medium text-foreground">
          <span>{openCount} open</span>
          {criticalCount > 0 ? (
            <span className="text-destructive">{criticalCount} critical</span>
          ) : null}
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2 items-end">
        <div className="flex-1 min-w-[200px]">
          <Input
            value={draftQ}
            onChange={(e) => setDraftQ(e.target.value)}
            placeholder="Search title, analysis, reason…"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setQ(draftQ.trim());
              }
            }}
          />
        </div>
        <Select
          value={priority}
          onValueChange={(v) => {
            setPage(1);
            setPriority(v);
          }}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            {PRIORITY_OPTIONS.map((p) => (
              <SelectItem key={p} value={p}>
                {p === "all" ? "All priorities" : p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(v) => {
            setPage(1);
            setStatus(v);
          }}
        >
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={sourceType}
          onValueChange={(v) => {
            setPage(1);
            setSourceType(v);
          }}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OPTIONS.map((s) => (
              <SelectItem key={s} value={s}>
                {s === "all" ? "All sources" : s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => {
            setPage(1);
            setPageSize(Number(v));
          }}
        >
          <SelectTrigger className="w-[110px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <SelectItem key={n} value={String(n)}>
                {n} / page
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="secondary"
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
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading alerts…
        </div>
      ) : (
        <DataTable
          data={items}
          columns={columns}
          rowKey={(r) => r.id}
          pageSize={pageSize}
          searchPlaceholder="Filter loaded rows…"
          emptyMessage="No alerts yet. Run Analyze histories."
        />
      )}

      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {page} of {pageCount} · {total.toLocaleString()} total
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pageCount || loading}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all alerts?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes every system alert. History analysis can recreate them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void onClearAll();
              }}
              disabled={clearing}
            >
              {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete all"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this alert?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.title || "Remove this alert permanently."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void onDeleteOne();
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!notifyTarget} onOpenChange={(o) => !o && setNotifyTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {notifyMode === "email" ? "Email doctor" : "Voice / SMS doctor"}
            </DialogTitle>
            <DialogDescription>
              Send this analysis result to a provider so they can act on it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">{notifyTarget?.title}</div>
              <div className="mt-1 text-xs text-muted-foreground line-clamp-3">
                {notifyTarget?.recommendation}
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">Doctor</label>
              <Select value={doctorId || "none"} onValueChange={(v) => onDoctorPick(v === "none" ? "" : v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Select doctor (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Manual entry</SelectItem>
                  {clinicDoctors.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.firstName} {d.lastName}
                      {d.email ? ` · ${d.email}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {notifyMode === "email" ? (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Email</label>
                <Input
                  className="mt-1"
                  type="email"
                  value={toEmail}
                  onChange={(e) => setToEmail(e.target.value)}
                  placeholder="doctor@clinic.com"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Phone</label>
                <Input
                  className="mt-1"
                  value={toPhone}
                  onChange={(e) => setToPhone(e.target.value)}
                  placeholder="+1…"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyTarget(null)} disabled={notifying}>
              Cancel
            </Button>
            <Button onClick={() => void submitNotify()} disabled={notifying}>
              {notifying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              {notifyMode === "email" ? "Send email" : "Send voice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
