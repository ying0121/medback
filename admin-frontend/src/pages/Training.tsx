import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Ban,
  Building2,
  Search,
  Upload,
  FileText,
  Loader2,
  Sparkles,
  X,
  Check,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listClinics,
  listKnowledge,
  createKnowledge,
  updateKnowledge,
  toggleKnowledgeStatus,
  deleteKnowledge,
  analyzeKnowledgeDocument,
  knowledgeDocumentUrl,
  type Clinic,
  type KnowledgeItem,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".markdown", ".csv", ".pdf", ".docx"];
const ACCEPT_ATTR = ".txt,.md,.markdown,.csv,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const ANALYSIS_STEPS = [
  "Reading document",
  "Extracting text",
  "AI structuring knowledge",
  "Preparing knowledge field",
] as const;

function fileLooksSupported(file: File) {
  const name = file.name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => name.endsWith(ext));
}

export default function Training() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [filterClinicId, setFilterClinicId] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [refreshKey, setRefreshKey] = useState(0);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [formClinicIds, setFormClinicIds] = useState<string[]>([]);
  const [clinicQuery, setClinicQuery] = useState("");
  const [formKnowledge, setFormKnowledge] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeItem | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
  const [documentMeta, setDocumentMeta] = useState<{
    documentName: string | null;
    documentPath: string | null;
    documentMime: string | null;
    documentSize: number | null;
  }>({
    documentName: null,
    documentPath: null,
    documentMime: null,
    documentSize: null,
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const clinicPickerRef = useRef<HTMLDivElement | null>(null);
  const knowledgeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const allowed = user?.role === "Admin" ? undefined : user?.clinicIds;
    listClinics().then((all) => {
      const filtered = allowed ? all.filter((c) => allowed.includes(c.id)) : all;
      setClinics(filtered);
    });
  }, [user, refreshKey]);

  const clinicMap = useMemo(() => {
    const map: Record<string, Clinic> = {};
    for (const clinic of clinics) {
      map[String(clinic.id)] = clinic;
      if (clinic.clinicId) map[String(clinic.clinicId)] = clinic;
    }
    return map;
  }, [clinics]);

  useEffect(() => {
    const params = {
      clinicId: filterClinicId === "all" ? undefined : filterClinicId,
      status: filterStatus === "all" ? undefined : filterStatus,
    };
    listKnowledge(params).then((rows) => {
      const allowed = user?.role === "Admin" ? null : new Set(user?.clinicIds || []);
      const filtered = allowed
        ? rows.filter((r) => {
            const ids = r.clinicIds?.length ? r.clinicIds : [r.clinicId];
            return ids.some((id) => {
              if (allowed.has(String(id))) return true;
              const clinic = clinicMap[String(id)];
              return clinic ? allowed.has(String(clinic.id)) : false;
            });
          })
        : rows;
      setItems(filtered);
    });
  }, [filterClinicId, filterStatus, user, refreshKey, clinicMap]);

  useEffect(() => {
    if (!analyzing) {
      setAnalysisStep(0);
      return undefined;
    }
    const timers = ANALYSIS_STEPS.slice(1).map((_, index) =>
      window.setTimeout(() => setAnalysisStep(index + 1), (index + 1) * 1400)
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [analyzing]);

  const resolveFormClinicId = (raw: string) => {
    const clinic = clinicMap[String(raw)];
    return clinic ? String(clinic.id) : String(raw);
  };

  const selectedClinics = useMemo(
    () =>
      formClinicIds
        .map((id) => clinicMap[id])
        .filter((clinic): clinic is Clinic => Boolean(clinic)),
    [formClinicIds, clinicMap]
  );

  const filteredClinics = useMemo(() => {
    const q = clinicQuery.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter((c) =>
      [c.name, c.acronym, c.clinicId, c.city, c.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [clinics, clinicQuery]);

  const toggleFormClinic = (clinicId: string) => {
    const id = String(clinicId);
    setFormClinicIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const openCreate = () => {
    setEditing(null);
    setFormClinicIds([]);
    setClinicQuery("");
    setFormKnowledge("");
    setFormStatus("active");
    setUploadedName(null);
    setDocumentMeta({
      documentName: null,
      documentPath: null,
      documentMime: null,
      documentSize: null,
    });
    setAnalysisDone(false);
    setOpen(true);
  };

  const openEdit = (row: KnowledgeItem) => {
    setEditing(row);
    const ids = (row.clinicIds?.length ? row.clinicIds : [row.clinicId])
      .map(resolveFormClinicId)
      .filter(Boolean);
    setFormClinicIds([...new Set(ids)]);
    setClinicQuery("");
    setFormKnowledge(row.knowledge || "");
    setFormStatus(row.status);
    setUploadedName(row.documentName || null);
    setDocumentMeta({
      documentName: row.documentName || null,
      documentPath: row.documentPath || null,
      documentMime: row.documentMime || null,
      documentSize: row.documentSize ?? null,
    });
    setAnalysisDone(false);
    setOpen(true);
  };

  const save = async () => {
    if (!formClinicIds.length) return toast.error("Select at least one clinic.");
    if (!formKnowledge.trim()) return toast.error("Knowledge is required.");

    const payload = {
      clinicIds: formClinicIds,
      knowledge: formKnowledge.trim(),
      status: formStatus,
      documentName: documentMeta.documentPath ? documentMeta.documentName : null,
      documentPath: documentMeta.documentPath,
      documentMime: documentMeta.documentPath ? documentMeta.documentMime : null,
      documentSize: documentMeta.documentPath ? documentMeta.documentSize : null,
    };

    if (editing) {
      await updateKnowledge(editing.id, payload);
      toast.success("Knowledge updated");
    } else {
      await createKnowledge(payload);
      toast.success(
        formClinicIds.length > 1
          ? `Knowledge added for ${formClinicIds.length} clinics`
          : "Knowledge added"
      );
    }
    setOpen(false);
    setRefreshKey((v) => v + 1);
  };

  const onToggleStatus = async (row: KnowledgeItem) => {
    const next = row.status === "active" ? "inactive" : "active";
    await toggleKnowledgeStatus(row.id, next);
    toast.success(`Status changed to ${next}`);
    setRefreshKey((v) => v + 1);
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    await deleteKnowledge(confirmDelete.id);
    setConfirmDelete(null);
    toast.success("Knowledge deleted");
    setRefreshKey((v) => v + 1);
  };

  const runDocumentAnalysis = async (file: File) => {
    if (!fileLooksSupported(file)) {
      toast.error("Unsupported file. Use TXT, MD, CSV, PDF, or DOCX.");
      return;
    }
    try {
      setAnalyzing(true);
      setAnalysisDone(false);
      setUploadedName(file.name);
      const result = await analyzeKnowledgeDocument(file, {
        clinicId: formClinicIds[0] || undefined,
        clinicName: selectedClinics[0]?.name,
      });
      setAnalysisStep(ANALYSIS_STEPS.length - 1);
      setFormKnowledge(result.knowledge);
      setUploadedName(result.documentName || result.filename || file.name);
      setDocumentMeta({
        documentName: result.documentName || result.filename || file.name,
        documentPath: result.documentPath || null,
        documentMime: result.documentMime || file.type || null,
        documentSize: result.documentSize ?? file.size ?? null,
      });
      setAnalysisDone(true);
      window.setTimeout(() => {
        knowledgeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 120);
      toast.success(
        result.truncated
          ? "Document analyzed (long file was truncated). Knowledge filled in."
          : "Document analyzed. Knowledge filled in."
      );
      window.setTimeout(() => setAnalysisDone(false), 2400);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to analyze document";
      toast.error(msg);
      setUploadedName(null);
    } finally {
      setAnalyzing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const onFilePicked = (fileList: FileList | null) => {
    const file = fileList?.[0];
    if (file) void runDocumentAnalysis(file);
  };

  const columns: Column<KnowledgeItem>[] = [
    {
      key: "clinic",
      header: "Clinic",
      searchable: (r) => {
        const ids = r.clinicIds?.length ? r.clinicIds : [r.clinicId];
        return ids
          .map((id) => {
            const c = clinicMap[String(id)];
            return `${c?.name || ""} ${c?.acronym || ""} ${id}`;
          })
          .join(" ");
      },
      render: (r) => {
        const ids = r.clinicIds?.length ? r.clinicIds : [r.clinicId];
        const clinicsForRow = ids.map((id) => {
          const clinic = clinicMap[String(id)];
          return {
            id: String(id),
            name: clinic?.name || `Clinic ${id}`,
            acronym: clinic?.acronym || "",
            businessId: clinic?.clinicId || String(id),
            city: clinic?.city || "",
          };
        });
        const first = clinicsForRow[0];
        const extra = Math.max(0, clinicsForRow.length - 1);
        const cell = (
          <div className="flex items-center gap-2.5 min-w-[200px] max-w-[280px]">
            <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-primary/15 to-muted flex items-center justify-center shrink-0 ring-1 ring-border/60">
              <Building2 className="h-4 w-4 text-primary/80" />
              {clinicsForRow.length > 1 ? (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-semibold leading-[18px] text-center shadow-sm">
                  {clinicsForRow.length}
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate leading-tight">
                {first?.name || "Unknown clinic"}
              </div>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                {extra > 0 ? (
                  <>
                    <span className="truncate">+{extra} more</span>
                    <span className="text-border">·</span>
                    <span className="shrink-0">Hover for list</span>
                  </>
                ) : (
                  <span className="truncate">
                    {first?.acronym || "-"}
                    {first?.businessId ? ` · ${first.businessId}` : ""}
                  </span>
                )}
              </div>
            </div>
          </div>
        );

        if (clinicsForRow.length <= 1) return cell;

        return (
          <Tooltip delayDuration={180}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-left rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {cell}
              </button>
            </TooltipTrigger>
            <TooltipContent
              side="bottom"
              align="start"
              sideOffset={8}
              className="max-w-[340px] p-0 border-border/80 bg-popover shadow-elegant overflow-hidden"
            >
              <div className="px-3.5 py-2.5 border-b border-border/70 bg-muted/40">
                <div className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Assigned clinics</div>
                <div className="mt-0.5 text-sm font-semibold text-foreground">
                  {clinicsForRow.length} clinics
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {clinicsForRow.map((clinic, index) => (
                  <div
                    key={clinic.id}
                    className="flex items-start gap-2.5 rounded-lg px-2.5 py-2 hover:bg-muted/60"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/10 text-[10px] font-semibold text-primary">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium leading-snug truncate">{clinic.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[clinic.acronym || null, clinic.businessId, clinic.city || null]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      key: "type",
      header: "Type",
      searchable: (r) => `${r.promptLabel || ""} ${r.promptKey || ""} knowledge`,
      render: (r) =>
        r.promptKey ? (
          <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10 whitespace-nowrap">
            {r.promptLabel || "Bot prompt"}
          </Badge>
        ) : (
          <span className="text-xs text-muted-foreground">Content</span>
        ),
    },
    {
      key: "document",
      header: "Document",
      searchable: (r) => r.documentName || "",
      render: (r) =>
        r.documentPath ? (
          <a
            href={knowledgeDocumentUrl(r.id)}
            className="inline-flex items-center gap-1 text-sm text-primary hover:underline max-w-[180px]"
            title={r.documentName || "Document"}
          >
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{r.documentName || "File"}</span>
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
    },
    {
      key: "knowledge",
      header: "Knowledge",
      searchable: (r) => r.knowledge,
      render: (r) => (
        <div className="max-w-[420px] line-clamp-2 whitespace-pre-wrap break-words" title={r.knowledge}>
          {r.knowledge}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      searchable: (r) => r.status,
      render: (r) => (
        <Badge
          variant="outline"
          className={cn(
            r.status === "active"
              ? "text-success border-success/30 bg-success/10"
              : "text-muted-foreground border-border bg-muted/40"
          )}
        >
          {r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-40 text-right",
      searchable: () => "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" onClick={() => onToggleStatus(r)} title="Toggle status">
            {r.status === "active" ? (
              <Ban className="h-4 w-4 text-warning" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-success" />
            )}
          </Button>
          <Button size="icon" variant="ghost" onClick={() => openEdit(r)} title="Edit">
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(r)} title="Delete">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Knowledge"
        description="Clinic knowledge drives the bot. Edit assistant, voice, and appointment prompts here, plus product facts."
        actions={
          <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-1.5" />
            Add knowledge
          </Button>
        }
      />

      <DataTable
        data={items}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search knowledge text, clinic…"
        toolbar={
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Select value={filterClinicId} onValueChange={setFilterClinicId}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Filter clinic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All clinics</SelectItem>
                {clinics.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as "all" | "active" | "inactive")}>
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
        emptyMessage="No knowledge records found"
      />

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (analyzing) return;
          setOpen(next);
          if (!next) {
            setClinicMenuOpen(false);
            setUploadedName(null);
            setAnalysisDone(false);
          }
        }}
      >
        <DialogContent className="flex max-h-[90vh] min-h-0 max-w-3xl flex-col gap-0 overflow-hidden p-6 sm:max-w-3xl">
          <DialogHeader className="shrink-0 pr-8">
            <DialogTitle>
              {editing?.promptKey
                ? `Edit ${editing.promptLabel || "bot prompt"}`
                : editing
                  ? "Edit knowledge"
                  : "Add knowledge"}
            </DialogTitle>
            <DialogDescription>
              {editing?.promptKey
                ? "Bot handling instructions. Assign one or more clinics; the same prompt applies to all selected."
                : "Select one or more clinics, optionally import a document, then review the knowledge text before saving."}
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-6 px-6 mt-4 [scrollbar-gutter:stable]"
            role="region"
            aria-label="Knowledge form"
          >
            <div className="space-y-4 py-1 pr-1 pb-4">
              <div ref={clinicPickerRef}>
                <div className="flex items-center justify-between gap-2">
                  <Label>Clinics (multi-select)</Label>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setFormClinicIds(clinics.map((c) => String(c.id)))}
                    >
                      Select all
                    </button>
                    <span className="text-muted-foreground">·</span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground hover:underline"
                      onClick={() => setFormClinicIds([])}
                    >
                      Clear
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {formClinicIds.length === 0
                    ? "No clinics selected"
                    : `${formClinicIds.length} clinic${formClinicIds.length === 1 ? "" : "s"} selected`}
                </p>
                {selectedClinics.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {selectedClinics.map((clinic) => (
                      <Badge key={clinic.id} variant="outline" className="gap-1 pr-1 max-w-full">
                        <span className="truncate">{clinic.name}</span>
                        <button
                          type="button"
                          className="rounded-sm p-0.5 hover:bg-muted"
                          onClick={() => toggleFormClinic(String(clinic.id))}
                          aria-label={`Remove ${clinic.name}`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="mt-2 rounded-xl border border-border bg-background overflow-hidden">
                  <div className="p-2 border-b border-border">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        value={clinicQuery}
                        onChange={(e) => setClinicQuery(e.target.value)}
                        placeholder="Search clinic name, acronym, ID…"
                        className="h-9 pl-8"
                      />
                    </div>
                  </div>
                  <div className="max-h-52 overflow-y-auto p-1">
                    {filteredClinics.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-muted-foreground">No clinics match</div>
                    ) : (
                      filteredClinics.map((c) => {
                        const selected = formClinicIds.includes(String(c.id));
                        return (
                          <label
                            key={c.id}
                            className={cn(
                              "flex w-full cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-secondary",
                              selected && "bg-secondary/80"
                            )}
                          >
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 accent-primary"
                              checked={selected}
                              onChange={() => toggleFormClinic(String(c.id))}
                            />
                            <span className="min-w-0 flex-1">
                              <div className="truncate font-medium">{c.name}</div>
                              <div className="text-xs text-muted-foreground truncate">
                                {c.acronym || "-"} · {c.clinicId}
                                {c.city ? ` · ${c.city}` : ""}
                              </div>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              <div>
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={(v) => setFormStatus(v as "active" | "inactive")}>
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <Label>Import document</Label>
                  {uploadedName || documentMeta.documentPath ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => {
                        setUploadedName(null);
                        setDocumentMeta({
                          documentName: null,
                          documentPath: null,
                          documentMime: null,
                          documentSize: null,
                        });
                      }}
                      disabled={analyzing}
                    >
                      <X className="h-3 w-3" />
                      Clear file
                    </button>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "relative overflow-hidden rounded-xl border border-dashed transition-colors",
                    dragActive ? "border-primary bg-primary/[0.04]" : "border-border bg-muted/30",
                    analyzing && "border-primary/40"
                  )}
                  onDragEnter={(e) => {
                    if (analyzing) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(true);
                  }}
                  onDragOver={(e) => {
                    if (analyzing) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(false);
                  }}
                  onDrop={(e) => {
                    if (analyzing) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setDragActive(false);
                    onFilePicked(e.dataTransfer.files);
                  }}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPT_ATTR}
                    className="hidden"
                    onChange={(e) => onFilePicked(e.target.files)}
                  />

                  <AnimatePresence>
                    {analyzing ? (
                      <motion.div
                        key="analyze-overlay"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 z-10 flex items-center justify-center bg-background/85 backdrop-blur-[2px] px-4 py-5"
                      >
                        <div className="w-full max-w-sm space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="relative h-12 w-12 shrink-0">
                              <motion.span
                                className="absolute inset-0 rounded-full border-2 border-primary/20"
                                animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0.15, 0.5] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                              />
                              <motion.span
                                className="absolute inset-1 rounded-full border-2 border-primary/30 border-t-primary"
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Sparkles className="h-5 w-5 text-primary" />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">Analyzing document</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {uploadedName || "Processing…"}
                              </p>
                            </div>
                          </div>

                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <motion.div
                              className="h-full rounded-full bg-gradient-primary"
                              initial={{ width: "8%" }}
                              animate={{ width: `${Math.min(96, 18 + analysisStep * 22)}%` }}
                              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                            />
                          </div>

                          <ul className="space-y-2">
                            {ANALYSIS_STEPS.map((label, index) => {
                              const done = index < analysisStep;
                              const active = index === analysisStep;
                              return (
                                <motion.li
                                  key={label}
                                  initial={{ opacity: 0, x: -6 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: index * 0.05 }}
                                  className={cn(
                                    "flex items-center gap-2.5 text-sm",
                                    done && "text-foreground",
                                    active && "text-primary font-medium",
                                    !done && !active && "text-muted-foreground"
                                  )}
                                >
                                  <span
                                    className={cn(
                                      "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                                      done && "border-success bg-success/10 text-success",
                                      active && "border-primary bg-primary/10 text-primary",
                                      !done && !active && "border-border bg-background"
                                    )}
                                  >
                                    {done ? <Check className="h-3 w-3" /> : active ? <Loader2 className="h-3 w-3 animate-spin" /> : index + 1}
                                  </span>
                                  <span>{label}</span>
                                </motion.li>
                              );
                            })}
                          </ul>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <div className="relative flex flex-col items-center text-center gap-2 px-4 py-6">
                    <div className="h-11 w-11 rounded-xl bg-background border border-border flex items-center justify-center shadow-sm">
                      <Upload className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">Drop a file here, or browse</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        TXT, MD, CSV, PDF, DOCX · max 8 MB · AI fills the knowledge field automatically
                      </p>
                    </div>
                    {uploadedName && !analyzing ? (
                      <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-xs">
                        <FileText className="h-3.5 w-3.5" />
                        <span className="truncate max-w-[220px]">{uploadedName}</span>
                      </div>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={analyzing}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                      Choose file
                    </Button>
                  </div>
                </div>
              </div>

              <div ref={knowledgeRef} className="scroll-mt-4">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <Label>Knowledge</Label>
                  <AnimatePresence>
                    {analysisDone ? (
                      <motion.span
                        initial={{ opacity: 0, scale: 0.92 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="inline-flex items-center gap-1 text-xs font-medium text-success"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Filled from document
                      </motion.span>
                    ) : null}
                  </AnimatePresence>
                </div>
                <div className="relative">
                  {analyzing ? (
                    <div className="pointer-events-none absolute inset-0 z-[1] rounded-md overflow-hidden border border-primary/20">
                      <div className="absolute inset-0 bg-muted/40" />
                      <motion.div
                        className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-primary/15 to-transparent"
                        animate={{ x: ["-120%", "320%"] }}
                        transition={{ duration: 1.4, repeat: Infinity, ease: "linear" }}
                      />
                    </div>
                  ) : null}
                  <Textarea
                    value={formKnowledge}
                    onChange={(e) => setFormKnowledge(e.target.value)}
                    rows={14}
                    className={cn(
                      "min-h-[280px] font-mono text-[13px] leading-relaxed resize-y",
                      analyzing && "opacity-70",
                      analysisDone && "ring-2 ring-success/30 border-success/30"
                    )}
                    placeholder="Enter product / knowledge details, or drop a document above…"
                    disabled={analyzing}
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="shrink-0 pt-4 mt-2 border-t border-border">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={analyzing}>
              Cancel
            </Button>
            <Button
              onClick={save}
              disabled={analyzing}
              className="bg-gradient-primary text-primary-foreground"
            >
              {editing ? "Save changes" : "Create knowledge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete knowledge?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
