import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Bot,
  Users,
  Loader2,
  CloudDownload,
  FileSpreadsheet,
  Megaphone,
  PhoneCall,
  CheckCircle2,
  Square,
  Play,
  CalendarClock,
  Copy,
  Check,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
} from "@/components/ui/alert-dialog";
import {
  listClinics,
  listAgents,
  listCampaigns,
  createCampaign,
  updateCampaign,
  deleteCampaign,
  pauseCampaign,
  resumeCampaign,
  analyzeCampaignImport,
  type Clinic,
  type Agent,
  type CampaignItem,
  type CampaignStatus,
  type PatientImportAnalyzeResult,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PatientImportDialog from "@/components/admin/PatientImportDialog";
import PatientApiSyncDialog from "@/components/admin/PatientApiSyncDialog";
import DateTimePicker from "@/components/admin/DateTimePicker";

const pageEase = [0.22, 1, 0.36, 1] as const;

const STATUS_LABEL: Record<CampaignStatus, string> = {
  draft: "Draft",
  ready: "Ready",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
};

const STATUS_STYLE: Record<CampaignStatus, string> = {
  draft: "text-muted-foreground border-border bg-muted/40",
  ready: "text-primary border-primary/30 bg-primary/10",
  running: "text-success border-success/30 bg-success/10",
  paused: "text-amber-700 border-amber-300/50 bg-amber-50",
  completed: "text-sky-700 border-sky-300/50 bg-sky-50",
};

function toDatetimeLocalValue(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function defaultScheduleLocal(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return toDatetimeLocalValue(d.toISOString());
}

function formatSchedule(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function Campaigns() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [items, setItems] = useState<CampaignItem[]>([]);
  const [filterClinicId, setFilterClinicId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | CampaignStatus>("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  const [open, setOpen] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [createdCampaign, setCreatedCampaign] = useState<CampaignItem | null>(null);
  const [editing, setEditing] = useState<CampaignItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formClinicId, setFormClinicId] = useState("");
  const [formAgentId, setFormAgentId] = useState("");
  const [formScheduledAt, setFormScheduledAt] = useState("");
  const [formRetryCount, setFormRetryCount] = useState("3");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<CampaignItem | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateCampaignId, setDuplicateCampaignId] = useState("");
  const [duplicateSourceTitle, setDuplicateSourceTitle] = useState<string | null>(null);

  const [importing, setImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importAnalyze, setImportAnalyze] = useState<PatientImportAnalyzeResult | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const allowed = user?.role === "Admin" ? undefined : user?.clinicIds;
    listClinics().then((all) => {
      const filtered = allowed ? all.filter((c) => allowed.includes(c.id)) : all;
      setClinics(filtered);
    });
    listAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, [user, refreshKey]);

  const clinicMap = useMemo(
    () => Object.fromEntries(clinics.map((c) => [c.id, c])),
    [clinics]
  );
  const agentMap = useMemo(
    () => Object.fromEntries(agents.map((a) => [a.id, a])),
    [agents]
  );

  useEffect(() => {
    setLoading(true);
    listCampaigns({
      clinicId: filterClinicId === "all" ? undefined : filterClinicId,
      status: filterStatus === "all" ? undefined : filterStatus,
    })
      .then((rows) => {
        const allowed = user?.role === "Admin" ? null : new Set(user?.clinicIds || []);
        setItems(allowed ? rows.filter((r) => allowed.has(r.clinicId)) : rows);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, [filterClinicId, filterStatus, user, refreshKey]);

  const activeAgents = useMemo(
    () => agents.filter((a) => a.status === "active"),
    [agents]
  );

  const stats = useMemo(() => {
    const patients = items.reduce((s, i) => s + (i.contactCounts?.total || 0), 0);
    const running = items.filter((i) => i.status === "running").length;
    const ready = items.filter((i) => i.status === "ready").length;
    return { total: items.length, patients, running, ready };
  }, [items]);

  const resetForm = (clinicId: string) => {
    setFormName("");
    setFormDescription("");
    setFormClinicId(clinicId);
    const preferred =
      agents.find((a) => a.status === "active" && a.id === clinicMap[clinicId]?.agentId) ||
      agents.find((a) => a.status === "active");
    setFormAgentId(preferred?.id || "");
    setFormScheduledAt(defaultScheduleLocal());
    setFormRetryCount("3");
  };

  const openCreate = () => {
    if (!clinics.length) return toast.error("Add a clinic first");
    if (!agents.some((a) => a.status === "active"))
      return toast.error("Create an active agent with a conversation flow first");
    setEditing(null);
    setCreatedCampaign(null);
    setDuplicateSourceTitle(null);
    setCreateStep(1);
    resetForm(clinics[0].id);
    setOpen(true);
  };

  const openDuplicatePicker = () => {
    if (!items.length) {
      toast.error("Create a campaign first before duplicating");
      return;
    }
    if (!agents.some((a) => a.status === "active")) {
      return toast.error("Create an active agent with a conversation flow first");
    }
    setDuplicateCampaignId(items[0]?.id || "");
    setDuplicateOpen(true);
  };

  const confirmDuplicate = () => {
    const source = items.find((c) => c.id === duplicateCampaignId);
    if (!source) {
      toast.error("Select a campaign to duplicate");
      return;
    }
    if (!clinics.length) return toast.error("Add a clinic first");

    const clinicId =
      clinics.some((c) => c.id === source.clinicId) ? source.clinicId : clinics[0].id;
    const agentStillActive =
      source.agentId && agents.some((a) => a.id === source.agentId && a.status === "active");
    const preferredAgent =
      (agentStillActive ? agents.find((a) => a.id === source.agentId) : null) ||
      agents.find((a) => a.status === "active" && a.id === clinicMap[clinicId]?.agentId) ||
      agents.find((a) => a.status === "active");

    if (!preferredAgent) {
      return toast.error("Create an active agent with a conversation flow first");
    }

    setDuplicateOpen(false);
    setEditing(null);
    setCreatedCampaign(null);
    setDuplicateSourceTitle(source.name);
    setCreateStep(1);
    setFormName(`${source.name} (copy)`);
    setFormDescription(source.description || "");
    setFormClinicId(clinicId);
    setFormAgentId(preferredAgent.id);
    setFormScheduledAt(toDatetimeLocalValue(source.scheduledAt) || defaultScheduleLocal());
    setFormRetryCount(String(source.retryCount ?? 3));
    setOpen(true);
    toast.message("Campaign copied into create form", {
      description: "Review the schedule and agent, then create. Patients are not copied.",
    });
  };

  const openEdit = (row: CampaignItem) => {
    setEditing(row);
    setCreatedCampaign(null);
    setDuplicateSourceTitle(null);
    setCreateStep(1);
    setFormName(row.name);
    setFormDescription(row.description || "");
    setFormClinicId(row.clinicId);
    setFormAgentId(row.agentId || "");
    setFormScheduledAt(toDatetimeLocalValue(row.scheduledAt) || defaultScheduleLocal());
    setFormRetryCount(String(row.retryCount ?? 3));
    setOpen(true);
  };

  const closeDialog = () => {
    setOpen(false);
    setCreateStep(1);
    setCreatedCampaign(null);
    setEditing(null);
    setDuplicateSourceTitle(null);
    setRefreshKey((k) => k + 1);
  };

  const saveStep1 = async () => {
    if (!formName.trim()) return toast.error("Name is required");
    if (!formClinicId) return toast.error("Clinic is required");
    if (!formAgentId) return toast.error("Agent is required");
    const scheduledAt = fromDatetimeLocalValue(formScheduledAt);
    if (!scheduledAt) return toast.error("Scheduled start date/time is required");
    const retryCount = Number(formRetryCount);
    if (!Number.isInteger(retryCount) || retryCount < 0 || retryCount > 20) {
      return toast.error("Retry count must be an integer from 0 to 20");
    }

    setSaving(true);
    try {
      if (editing) {
        await updateCampaign(editing.id, {
          name: formName.trim(),
          description: formDescription.trim(),
          clinicId: formClinicId,
          agentId: formAgentId,
          scheduledAt,
          retryCount,
        });
        toast.success("Campaign updated");
        closeDialog();
      } else {
        const item = await createCampaign({
          name: formName.trim(),
          description: formDescription.trim(),
          clinicId: formClinicId,
          agentId: formAgentId,
          scheduledAt,
          retryCount,
        });
        setCreatedCampaign(item);
        setCreateStep(2);
        toast.success("Campaign created — load patients next");
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteCampaign(confirmDelete.id);
      toast.success("Campaign deleted");
      setConfirmDelete(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const onPause = async (row: CampaignItem) => {
    setActionBusyId(row.id);
    try {
      const item = await pauseCampaign(row.id);
      setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, ...item } : r)));
      toast.success("Campaign stopped");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to stop");
    } finally {
      setActionBusyId(null);
    }
  };

  const onResume = async (row: CampaignItem) => {
    setActionBusyId(row.id);
    try {
      const item = await resumeCampaign(row.id);
      setItems((prev) => prev.map((r) => (r.id === item.id ? { ...r, ...item } : r)));
      toast.success("Campaign resumed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to resume");
    } finally {
      setActionBusyId(null);
    }
  };

  const onImportFile = async (file: File | null) => {
    if (!file || !createdCampaign) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
      return toast.error("Upload an Excel (.xlsx/.xls) or CSV file");
    }
    setImporting(true);
    try {
      const analyzed = await analyzeCampaignImport(createdCampaign.id, file);
      setImportAnalyze(analyzed);
      setImportFileName(file.name);
      setImportDialogOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to analyze Excel");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const finishCreate = (goToPatients: boolean) => {
    const id = createdCampaign?.id;
    closeDialog();
    if (goToPatients && id) navigate(`/campaigns/${id}`);
  };

  const columns: Column<CampaignItem>[] = [
    {
      key: "name",
      header: "Campaign",
      searchable: (r) => `${r.name} ${r.description}`,
      render: (r) => (
        <button
          type="button"
          className="flex items-start gap-3 text-left min-w-[220px] group"
          onClick={() => navigate(`/campaigns/${r.id}`)}
        >
          <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-orange-500/15 to-rose-500/10 flex items-center justify-center ring-1 ring-border/60 shrink-0 group-hover:shadow-soft transition-shadow">
            <Megaphone className="h-4 w-4 text-orange-600" />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate leading-tight group-hover:text-primary transition-colors">
              {r.name}
            </div>
            <div className="text-xs text-muted-foreground truncate mt-0.5 max-w-[280px]">
              {r.description || "No description"}
            </div>
          </div>
        </button>
      ),
    },
    {
      key: "clinic",
      header: "Clinic",
      searchable: (r) => clinicMap[r.clinicId]?.name || "",
      render: (r) => {
        const clinic = clinicMap[r.clinicId];
        return (
          <div className="flex items-center gap-2.5 min-w-[160px]">
            <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-primary/15 to-muted flex items-center justify-center ring-1 ring-border/60">
              <Building2 className="h-4 w-4 text-primary/80" />
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate leading-tight">{clinic?.name || r.clinicId}</div>
              <div className="text-xs text-muted-foreground truncate">{clinic?.acronym || "—"}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "agent",
      header: "Agent",
      searchable: (r) => `${r.agentTitle || ""} ${r.flowName || ""} ${r.agentId || ""}`,
      render: (r) => (
        <div className="flex items-center gap-2 min-w-[160px]">
          <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">
              {r.agentTitle || agentMap[r.agentId || ""]?.title || "—"}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              Flow: {r.flowName || "—"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "schedule",
      header: "Starts",
      searchable: (r) => formatSchedule(r.scheduledAt),
      render: (r) => (
        <div className="flex items-center gap-1.5 text-sm min-w-[140px]">
          <CalendarClock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span>{formatSchedule(r.scheduledAt)}</span>
        </div>
      ),
    },
    {
      key: "patients",
      header: "Patients",
      render: (r) => {
        const total = r.contactCounts?.total ?? 0;
        const done = r.contactCounts?.completed ?? 0;
        const pct = total ? Math.round((done / total) * 100) : 0;
        return (
          <div className="min-w-[120px]">
            <div className="flex items-center gap-1.5 text-sm font-medium tabular-nums">
              <Users className="h-3.5 w-3.5 text-muted-foreground" />
              {total}
            </div>
            {total > 0 ? (
              <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-primary transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground mt-1">No list yet</div>
            )}
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      searchable: (r) => r.status,
      render: (r) => (
        <Badge variant="outline" className={STATUS_STYLE[r.status]}>
          {STATUS_LABEL[r.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[160px] text-right",
      searchable: () => "",
      render: (r) => {
        const callingActive = r.status === "running" || r.status === "paused";
        const canStop = r.status === "running";
        const canResume = r.status === "paused";
        const busy = actionBusyId === r.id;
        return (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              size="icon"
              variant="ghost"
              title={
                canStop
                  ? "Stop calling"
                  : callingActive
                    ? "Already stopped"
                    : "Stop is only available while calling is in progress"
              }
              className={
                canStop
                  ? "text-amber-700 hover:text-amber-800 hover:bg-amber-50"
                  : "text-muted-foreground"
              }
              disabled={!canStop || busy}
              onClick={(e) => {
                e.stopPropagation();
                if (!canStop) return;
                void onPause(r);
              }}
            >
              {busy && canStop ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Square className="h-4 w-4 fill-current" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title={
                canResume
                  ? "Resume calling"
                  : callingActive
                    ? "Resume is available after you stop"
                    : "Resume is only available after calling has started and been stopped"
              }
              className={
                canResume
                  ? "text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50"
                  : "text-muted-foreground"
              }
              disabled={!canResume || busy}
              onClick={(e) => {
                e.stopPropagation();
                if (!canResume) return;
                void onResume(r);
              }}
            >
              {busy && canResume ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Play className="h-4 w-4 fill-current" />
              )}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              title="Edit"
              onClick={(e) => {
                e.stopPropagation();
                openEdit(r);
              }}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="text-destructive"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                setConfirmDelete(r);
              }}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="admin-page">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        className="hidden"
        onChange={(e) => onImportFile(e.target.files?.[0] || null)}
      />
      <PageHeader
        accent={4}
        title="Campaigns"
        description="Schedule outbound bot calls. Create a campaign, load patients, then the bot dials at the scheduled time."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={openDuplicatePicker}
              disabled={!items.length}
            >
              <Copy className="h-4 w-4 mr-1.5" /> Duplicate campaign
            </Button>
            <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1.5" /> Create campaign
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Campaigns", value: stats.total, icon: Megaphone, color: "#f97316", hint: "In this view" },
          { label: "Patients loaded", value: stats.patients, icon: Users, color: "#0ea5e9", hint: "Across campaigns" },
          { label: "Ready", value: stats.ready, icon: CheckCircle2, color: "#6366f1", hint: "Ready to run" },
          { label: "Running", value: stats.running, icon: PhoneCall, color: "#10b981", hint: "Actively dialing" },
        ].map((card, index) => (
          <motion.div
            key={card.label}
            className="bg-card border border-border/80 rounded-2xl p-4 shadow-soft"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.04 * index, duration: 0.35, ease: pageEase }}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm text-muted-foreground">{card.label}</div>
                <div className="text-2xl font-semibold tracking-tight mt-1 tabular-nums">
                  {loading ? "—" : card.value}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{card.hint}</div>
              </div>
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${card.color}18`, color: card.color }}
              >
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <DataTable
        data={items}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search campaigns…"
        emptyMessage="No campaigns yet — create one and load patients"
        toolbar={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={filterClinicId} onValueChange={setFilterClinicId}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Clinic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clinics</SelectItem>
                {clinics.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={filterStatus}
              onValueChange={(v) => setFilterStatus(v as "all" | CampaignStatus)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {(Object.keys(STATUS_LABEL) as CampaignStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      />

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) closeDialog();
          else setOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-lg flex max-h-[90vh] flex-col gap-0 overflow-hidden p-6">
          <div className="h-1.5 w-16 rounded-full bg-gradient-primary mb-3" />
          <DialogHeader className="shrink-0">
            <DialogTitle>
              {editing
                ? "Edit campaign"
                : createStep === 1
                  ? "Create campaign"
                  : "Load patients"}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? "Update schedule, retry count, and flow. Status updates automatically."
                : createStep === 1
                  ? duplicateSourceTitle
                    ? `Duplicated from “${duplicateSourceTitle}”. Step 1 of 2 — review schedule and agent, then create. Patients are not copied.`
                    : "Step 1 of 2 — set when the bot should start calling and how many retries."
                  : "Step 2 of 2 — import from Excel or sync from an API. You can also do this later on the patients page."}
            </DialogDescription>
          </DialogHeader>

          {!editing && (
            <div className="flex items-center gap-2 mt-3 mb-1">
              <div
                className={`h-1.5 flex-1 rounded-full ${createStep >= 1 ? "bg-primary" : "bg-muted"}`}
              />
              <div
                className={`h-1.5 flex-1 rounded-full ${createStep >= 2 ? "bg-primary" : "bg-muted"}`}
              />
            </div>
          )}

          {createStep === 1 || editing ? (
            <div className="space-y-4 py-4 overflow-y-auto -mx-6 px-6 [scrollbar-gutter:stable]">
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Name
                </Label>
                <Input
                  className="mt-1.5"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Appointment reminders — March"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Description
                </Label>
                <Textarea
                  className="mt-1.5"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Optional notes"
                />
              </div>
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Clinic
                </Label>
                <Select
                  value={formClinicId}
                  onValueChange={(v) => {
                    setFormClinicId(v);
                    const preferred =
                      agents.find(
                        (a) => a.status === "active" && a.id === clinicMap[v]?.agentId
                      ) || agents.find((a) => a.status === "active");
                    if (preferred) setFormAgentId(preferred.id);
                  }}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select clinic" />
                  </SelectTrigger>
                  <SelectContent>
                    {clinics.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Agent
                </Label>
                <Select value={formAgentId || undefined} onValueChange={setFormAgentId}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue
                      placeholder={activeAgents.length ? "Select agent" : "No active agents"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {activeAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formAgentId ? (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Flow:{" "}
                    {agentMap[formAgentId]?.flowId
                      ? `linked (#${agentMap[formAgentId].flowId})`
                      : "none — link a flow on the agent first"}
                    {" · "}
                    Knowledge: {agentMap[formAgentId]?.knowledgeIds?.length || 0}
                  </p>
                ) : !activeAgents.length ? (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    Create an active agent with a conversation flow first.
                  </p>
                ) : null}
              </div>
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Start calling at
                </Label>
                <DateTimePicker
                  value={formScheduledAt}
                  onChange={setFormScheduledAt}
                  placeholder="Pick when the bot should start dialing"
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  When the bot begins outbound calls automatically.
                </p>
              </div>
              <div>
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Retry count
                </Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  className="mt-1.5"
                  value={formRetryCount}
                  onChange={(e) => setFormRetryCount(e.target.value)}
                />
                <p className="text-xs text-muted-foreground mt-1.5">
                  How many times to retry if the patient does not accept (0–20).
                </p>
              </div>
            </div>
          ) : (
            <div className="py-6 space-y-4">
              <p className="text-sm text-muted-foreground">
                Campaign{" "}
                <span className="font-medium text-foreground">{createdCampaign?.name}</span> is ready.
                Load patients now, or open the patients page later.
              </p>
              <div className="grid gap-3">
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4"
                  disabled={importing}
                  onClick={() => fileRef.current?.click()}
                >
                  {importing ? (
                    <Loader2 className="h-5 w-5 mr-3 animate-spin shrink-0" />
                  ) : (
                    <FileSpreadsheet className="h-5 w-5 mr-3 text-emerald-700 shrink-0" />
                  )}
                  <span className="text-left">
                    <span className="block font-medium">Import patients (Excel)</span>
                    <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                      Opens a mapping modal after you choose a file
                    </span>
                  </span>
                </Button>
                <Button
                  variant="outline"
                  className="justify-start h-auto py-3 px-4"
                  onClick={() => setSyncOpen(true)}
                >
                  <CloudDownload className="h-5 w-5 mr-3 text-sky-700 shrink-0" />
                  <span className="text-left">
                    <span className="block font-medium">Sync patients (API)</span>
                    <span className="block text-xs text-muted-foreground font-normal mt-0.5">
                      Opens a modal to enter the external API URL
                    </span>
                  </span>
                </Button>
              </div>
              {(createdCampaign?.contactCounts?.total || 0) > 0 ? (
                <p className="text-xs text-emerald-700">
                  {createdCampaign?.contactCounts?.total} patient
                  {(createdCampaign?.contactCounts?.total || 0) === 1 ? "" : "s"} loaded
                </p>
              ) : null}
            </div>
          )}

          <DialogFooter className="shrink-0 border-t border-border pt-4">
            {editing || createStep === 1 ? (
              <>
                <Button variant="outline" onClick={closeDialog} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  className="bg-gradient-primary text-primary-foreground"
                  onClick={saveStep1}
                  disabled={saving || !formAgentId}
                >
                  {saving ? "Saving…" : editing ? "Save changes" : "Create"}
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => finishCreate(false)}>
                  Skip for now
                </Button>
                <Button
                  className="bg-gradient-primary text-primary-foreground"
                  onClick={() => finishCreate(true)}
                >
                  Open patients page
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Duplicate campaign</DialogTitle>
            <DialogDescription>
              Choose an existing campaign. We’ll open the create form with its settings
              filled in. Patients and call history are not copied.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <Label className="text-xs text-muted-foreground">Source campaign</Label>
            <ScrollArea className="max-h-72 rounded-xl border border-border/70">
              <div className="p-2 space-y-1">
                {items.map((campaign) => {
                  const selected = duplicateCampaignId === campaign.id;
                  return (
                    <button
                      key={campaign.id}
                      type="button"
                      onClick={() => setDuplicateCampaignId(campaign.id)}
                      className={cn(
                        "w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
                        selected
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-muted/60 border border-transparent"
                      )}
                    >
                      <div
                        className={cn(
                          "mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0",
                          selected
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-muted-foreground/40"
                        )}
                      >
                        {selected ? <Check className="h-2.5 w-2.5" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{campaign.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {campaign.description || campaign.agentTitle || "No description"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge
                            variant="outline"
                            className={cn("text-[10px]", STATUS_STYLE[campaign.status])}
                          >
                            {STATUS_LABEL[campaign.status]}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {campaign.contactCounts?.total ?? 0} patients
                          </Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDuplicateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDuplicate}
              disabled={!duplicateCampaignId}
              className="bg-gradient-primary text-primary-foreground"
            >
              <Copy className="h-4 w-4 mr-1" /> Duplicate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {createdCampaign ? (
        <PatientImportDialog
          open={importDialogOpen}
          campaignId={createdCampaign.id}
          fileName={importFileName}
          analyze={importAnalyze}
          hasExistingContacts={(createdCampaign.contactCounts?.total || 0) > 0}
          onClose={() => {
            setImportDialogOpen(false);
            setImportAnalyze(null);
          }}
          onImported={({ item }) => {
            setCreatedCampaign(item);
            setImportDialogOpen(false);
            setImportAnalyze(null);
            setRefreshKey((k) => k + 1);
          }}
        />
      ) : null}

      {createdCampaign ? (
        <PatientApiSyncDialog
          open={syncOpen}
          campaignId={createdCampaign.id}
          campaignName={createdCampaign.name}
          hasExistingContacts={(createdCampaign.contactCounts?.total || 0) > 0}
          onClose={() => setSyncOpen(false)}
          onSynced={({ item }) => {
            setCreatedCampaign(item);
            setSyncOpen(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      ) : null}

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete campaign?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes “{confirmDelete?.name}” and all loaded patients.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
