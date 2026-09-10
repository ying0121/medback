import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CloudDownload,
  FileSpreadsheet,
  GitBranch,
  Loader2,
  PhoneCall,
  Trash2,
  Upload,
  Users,
  Megaphone,
  CalendarClock,
  RotateCcw,
  History,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  getCampaign,
  analyzeCampaignImport,
  deleteCampaignContact,
  listClinics,
  listConversationFlows,
  type Clinic,
  type ConversationFlowItem,
  type CampaignItem,
  type CampaignContactItem,
  type CampaignStatus,
  type PatientImportAnalyzeResult,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import PatientImportDialog from "@/components/admin/PatientImportDialog";
import PatientApiSyncDialog from "@/components/admin/PatientApiSyncDialog";
import CampaignContactHistoryDrawer from "@/components/admin/CampaignContactHistoryDrawer";

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

function formatSchedule(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Display DOB as MM/DD/YYYY */
function formatDobDisplay(value?: string | null) {
  if (!value) return "—";
  const text = String(value).trim();
  const us = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (us) {
    return `${us[1].padStart(2, "0")}/${us[2].padStart(2, "0")}/${us[3]}`;
  }
  const iso = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (iso) {
    return `${iso[2].padStart(2, "0")}/${iso[3].padStart(2, "0")}/${iso[1]}`;
  }
  return text;
}

export default function CampaignPatients() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignItem | null>(null);
  const [contacts, setContacts] = useState<CampaignContactItem[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [flows, setFlows] = useState<ConversationFlowItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const [importAnalyze, setImportAnalyze] = useState<PatientImportAnalyzeResult | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [historyContact, setHistoryContact] = useState<CampaignContactItem | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!id) return;
      if (!opts?.quiet) setLoading(true);
      else setRefreshing(true);
      try {
        const data = await getCampaign(id);
        setCampaign(data.item);
        setContacts(data.contacts);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load campaign");
        if (!opts?.quiet) navigate("/campaigns");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id, navigate]
  );

  useEffect(() => {
    void load();
    listClinics().then(setClinics).catch(() => undefined);
    listConversationFlows().then(setFlows).catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (!campaign || (campaign.status !== "running" && campaign.status !== "paused")) return;
    const t = window.setInterval(() => void load({ quiet: true }), 8000);
    return () => window.clearInterval(t);
  }, [campaign?.status, load]);

  const clinicName = clinics.find((c) => c.id === campaign?.clinicId)?.name;
  const flowName = flows.find((f) => f.id === campaign?.flowId)?.name;

  const loadStats = useMemo(() => {
    const counts = campaign?.contactCounts || {
      total: contacts.length,
      pending: 0,
      calling: 0,
      success: 0,
      reject: 0,
      interesting: 0,
      not_interesting: 0,
    };
    const total = counts.total ?? contacts.length;
    const pending = counts.pending ?? contacts.filter((c) => c.status === "pending").length;
    const calling = counts.calling ?? contacts.filter((c) => c.status === "calling").length;
    const success = counts.success ?? contacts.filter((c) => c.status === "success").length;
    const reject = counts.reject ?? contacts.filter((c) => c.status === "reject").length;
    const interesting =
      counts.interesting ?? contacts.filter((c) => c.status === "interesting").length;
    const notInteresting =
      counts.not_interesting ?? contacts.filter((c) => c.status === "not_interesting").length;
    const done = success + reject + interesting + notInteresting;
    const pct = total ? Math.round((done / total) * 100) : 0;
    return { total, pending, calling, success, reject, interesting, notInteresting, done, pct };
  }, [campaign, contacts]);

  const RESULT_LABEL: Record<string, string> = {
    pending: "Pending",
    calling: "Calling",
    success: "Success",
    reject: "Reject",
    interesting: "Interesting",
    not_interesting: "Not interesting",
  };

  const RESULT_STYLE: Record<string, string> = {
    pending: "text-muted-foreground border-border bg-muted/40",
    calling: "text-sky-700 border-sky-300/50 bg-sky-50",
    success: "text-emerald-700 border-emerald-300/50 bg-emerald-50",
    reject: "text-rose-700 border-rose-300/50 bg-rose-50",
    interesting: "text-violet-700 border-violet-300/50 bg-violet-50",
    not_interesting: "text-amber-800 border-amber-300/50 bg-amber-50",
  };

  const onImportFile = async (file: File | null) => {
    if (!file || !campaign) return;
    const name = file.name.toLowerCase();
    if (!name.endsWith(".xlsx") && !name.endsWith(".xls") && !name.endsWith(".csv")) {
      return toast.error("Upload an Excel (.xlsx/.xls) or CSV file");
    }
    setImporting(true);
    try {
      const analyzed = await analyzeCampaignImport(campaign.id, file);
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

  const removeContact = async (contact: CampaignContactItem) => {
    if (!campaign) return;
    try {
      await deleteCampaignContact(campaign.id, contact.id);
      setContacts((prev) => prev.filter((c) => c.id !== contact.id));
      toast.success("Patient removed");
      void load({ quiet: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to remove");
    }
  };

  const columns: Column<CampaignContactItem>[] = [
    {
      key: "name",
      header: "Patient",
      searchable: (r) =>
        `${r.patientFirstName || ""} ${r.patientLastName || ""} ${r.patientName} ${r.patientPhone}`,
      render: (r) => {
        const name =
          [r.patientFirstName, r.patientLastName].filter(Boolean).join(" ").trim() ||
          r.patientName;
        return (
          <div className="flex items-center gap-2.5 min-w-[160px]">
            <div className="h-9 w-9 rounded-full bg-gradient-to-br from-primary/20 to-muted flex items-center justify-center text-xs font-semibold text-primary ring-1 ring-border/50">
              {name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="font-medium leading-tight">{name}</div>
              <div className="text-xs text-muted-foreground">{r.patientPhone}</div>
            </div>
          </div>
        );
      },
    },
    {
      key: "dob",
      header: "DOB",
      searchable: (r) => r.patientDob || "",
      render: (r) => (
        <span className={cn("text-sm tabular-nums", !r.patientDob && "text-xs text-muted-foreground")}>
          {formatDobDisplay(r.patientDob)}
        </span>
      ),
    },
    {
      key: "language",
      header: "Language",
      searchable: (r) => r.patientLanguage || "",
      render: (r) => (
        <span className={cn("text-sm", !r.patientLanguage && "text-xs text-muted-foreground")}>
          {r.patientLanguage || "—"}
        </span>
      ),
    },
    {
      key: "member",
      header: "Member #",
      searchable: (r) => r.patientMemberNumber || "",
      render: (r) => (
        <span className={cn("text-sm", !r.patientMemberNumber && "text-xs text-muted-foreground")}>
          {r.patientMemberNumber || "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Result",
      searchable: (r) => r.status,
      render: (r) => (
        <Badge variant="outline" className={RESULT_STYLE[r.status] || RESULT_STYLE.pending}>
          {RESULT_LABEL[r.status] || r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-[88px] text-right",
      searchable: () => "",
      render: (r) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button
            size="icon"
            variant="ghost"
            title="Call history & analysis"
            onClick={() => setHistoryContact(r)}
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            disabled={campaign?.status === "running"}
            onClick={() => removeContact(r)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (loading && !campaign) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[40vh] text-muted-foreground gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading campaign…
      </div>
    );
  }

  if (!campaign) return null;

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        className="hidden"
        onChange={(e) => onImportFile(e.target.files?.[0] || null)}
      />

      <div className="mb-4">
        <Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground" asChild>
          <Link to="/campaigns">
            <ArrowLeft className="h-4 w-4 mr-1.5" /> Back to campaigns
          </Link>
        </Button>
      </div>

      <PageHeader
        title={campaign.name}
        description={campaign.description || "Patient list and call progress for this campaign."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={importing || campaign.status === "running"}
              onClick={() => fileRef.current?.click()}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-4 w-4 mr-2" />
              )}
              Import patients
            </Button>
            <Button
              variant="outline"
              disabled={campaign.status === "running"}
              onClick={() => setSyncOpen(true)}
            >
              <CloudDownload className="h-4 w-4 mr-2" /> Sync patients
            </Button>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-6 text-sm text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Megaphone className="h-3.5 w-3.5" />
          {clinicName || campaign.clinicId}
        </span>
        <span className="text-border">·</span>
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5" />
          {flowName || campaign.flowId}
        </span>
        <span className="text-border">·</span>
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock className="h-3.5 w-3.5" />
          Starts {formatSchedule(campaign.scheduledAt)}
        </span>
        <span className="text-border">·</span>
        <span className="inline-flex items-center gap-1.5">
          <RotateCcw className="h-3.5 w-3.5" />
          {campaign.retryCount ?? 0} retries
        </span>
        <Badge variant="outline" className={STATUS_STYLE[campaign.status]}>
          {STATUS_LABEL[campaign.status]}
        </Badge>
        {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      </div>

      <div className="bg-card border border-border/80 rounded-2xl p-5 shadow-soft mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="font-semibold tracking-tight flex items-center gap-2">
              <PhoneCall className="h-4 w-4 text-orange-600" />
              Loading status
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {campaign.status === "running"
                ? "Outbound calling in progress"
                : campaign.status === "paused"
                  ? "Calling paused — resume from the campaigns list"
                  : loadStats.total
                    ? "Patients loaded — waiting for scheduled start"
                    : "Import or sync patients to prepare this campaign"}
            </p>
          </div>
          <div className="text-sm font-medium tabular-nums">
            {loadStats.done}/{loadStats.total} processed ({loadStats.pct}%)
          </div>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden mb-4">
          <div
            className="h-full rounded-full bg-gradient-primary transition-all"
            style={{ width: `${loadStats.pct}%` }}
          />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { label: "Total", value: loadStats.total },
            { label: "Pending", value: loadStats.pending },
            { label: "Calling", value: loadStats.calling },
            { label: "Success", value: loadStats.success },
            { label: "Interesting", value: loadStats.interesting },
            { label: "Reject / NI", value: loadStats.reject + loadStats.notInteresting },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold tabular-nums mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border/80 rounded-2xl shadow-soft overflow-hidden">
        <div className="flex items-center justify-between gap-3 p-5 border-b border-border/80">
          <div>
            <h3 className="font-semibold tracking-tight flex items-center gap-2">
              <Users className="h-4 w-4" /> Patient data
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              {contacts.length} patient{contacts.length === 1 ? "" : "s"} in this campaign
            </p>
          </div>
          <Button
            size="sm"
            className="bg-gradient-primary text-primary-foreground"
            disabled={importing || campaign.status === "running"}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-4 w-4 mr-1.5" /> Choose Excel
          </Button>
        </div>
        {contacts.length === 0 ? (
          <div className="min-h-[240px] flex flex-col items-center justify-center text-center px-6 py-10">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <Users className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">No patients loaded yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[320px]">
              Use Import patients (Excel) or Sync patients (API). Mapping and duplicate checks open in a
              modal.
            </p>
          </div>
        ) : (
          <div className="p-5 pt-3">
            <DataTable
              data={contacts}
              columns={columns}
              rowKey={(r) => r.id}
              pageSize={10}
              searchPlaceholder="Search patients…"
              emptyMessage="No patients"
            />
          </div>
        )}
      </div>

      <PatientImportDialog
        open={importDialogOpen}
        campaignId={campaign.id}
        fileName={importFileName}
        analyze={importAnalyze}
        hasExistingContacts={(campaign.contactCounts?.total || 0) > 0 || contacts.length > 0}
        onClose={() => {
          setImportDialogOpen(false);
          setImportAnalyze(null);
        }}
        onImported={({ item, contacts: next }) => {
          setCampaign(item);
          setContacts(next);
          setImportDialogOpen(false);
          setImportAnalyze(null);
        }}
      />

      <PatientApiSyncDialog
        open={syncOpen}
        campaignId={campaign.id}
        campaignName={campaign.name}
        hasExistingContacts={(campaign.contactCounts?.total || 0) > 0 || contacts.length > 0}
        onClose={() => setSyncOpen(false)}
        onSynced={({ item, contacts: next }) => {
          setCampaign(item);
          setContacts(next);
          setSyncOpen(false);
        }}
      />

      <CampaignContactHistoryDrawer
        open={!!historyContact}
        campaignId={campaign.id}
        contact={historyContact}
        onClose={() => setHistoryContact(null)}
        onContactUpdated={(next) => {
          setContacts((prev) => prev.map((c) => (c.id === next.id ? { ...c, ...next } : c)));
          setHistoryContact((prev) => (prev?.id === next.id ? { ...prev, ...next } : prev));
        }}
      />
    </div>
  );
}
