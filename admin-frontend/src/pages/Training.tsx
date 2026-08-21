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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  listClinics,
  listKnowledge,
  createKnowledge,
  updateKnowledge,
  toggleKnowledgeStatus,
  deleteKnowledge,
  analyzeKnowledgeDocument,
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
  const [formClinicId, setFormClinicId] = useState("");
  const [clinicQuery, setClinicQuery] = useState("");
  const [clinicMenuOpen, setClinicMenuOpen] = useState(false);
  const [formKnowledge, setFormKnowledge] = useState("");
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [confirmDelete, setConfirmDelete] = useState<KnowledgeItem | null>(null);

  const [dragActive, setDragActive] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [analysisDone, setAnalysisDone] = useState(false);
  const [uploadedName, setUploadedName] = useState<string | null>(null);
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

  useEffect(() => {
    const params = {
      clinicId: filterClinicId === "all" ? undefined : filterClinicId,
      status: filterStatus === "all" ? undefined : filterStatus,
    };
    listKnowledge(params).then((rows) => {
      const allowed = user?.role === "Admin" ? null : new Set(user?.clinicIds || []);
      const filtered = allowed ? rows.filter((r) => allowed.has(String(r.clinicId))) : rows;
      setItems(filtered);
    });
  }, [filterClinicId, filterStatus, user, refreshKey]);

  useEffect(() => {
    if (!clinicMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!clinicPickerRef.current?.contains(event.target as Node)) {
        setClinicMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [clinicMenuOpen]);

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

  const clinicMap = useMemo(() => Object.fromEntries(clinics.map((c) => [String(c.id), c])), [clinics]);
  const selectedClinic = clinicMap[formClinicId] || null;

  const filteredClinics = useMemo(() => {
    const q = clinicQuery.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter((c) =>
      [c.name, c.acronym, c.clinicId, c.city, c.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [clinics, clinicQuery]);

  const openCreate = () => {
    setEditing(null);
    setFormClinicId(clinics[0]?.id || "");
    setClinicQuery("");
    setFormKnowledge("");
    setFormStatus("active");
    setUploadedName(null);
    setAnalysisDone(false);
    setOpen(true);
  };

  const openEdit = (row: KnowledgeItem) => {
    setEditing(row);
    setFormClinicId(String(row.clinicId));
    setClinicQuery("");
    setFormKnowledge(row.knowledge || "");
    setFormStatus(row.status);
    setUploadedName(null);
    setAnalysisDone(false);
    setOpen(true);
  };

  const save = async () => {
    if (!formClinicId) return toast.error("Clinic is required.");
    if (!formKnowledge.trim()) return toast.error("Knowledge is required.");

    if (editing) {
      await updateKnowledge(editing.id, {
        clinicId: formClinicId,
        knowledge: formKnowledge.trim(),
        status: formStatus,
      });
      toast.success("Knowledge updated");
    } else {
      await createKnowledge({
        clinicId: formClinicId,
        knowledge: formKnowledge.trim(),
        status: formStatus,
      });
      toast.success("Knowledge added");
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
        clinicId: formClinicId || undefined,
        clinicName: selectedClinic?.name,
      });
      setAnalysisStep(ANALYSIS_STEPS.length - 1);
      setFormKnowledge(result.knowledge);
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
      searchable: (r) =>
        `${clinicMap[String(r.clinicId)]?.name || ""} ${clinicMap[String(r.clinicId)]?.acronym || ""} ${r.clinicId}`,
      render: (r) => {
        const c = clinicMap[String(r.clinicId)];
        return (
          <div className="flex items-center gap-2 min-w-[180px]">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <Building2 className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate">{c?.name || `Clinic ${r.clinicId}`}</div>
              <div className="text-xs text-muted-foreground truncate">
                {c?.acronym || "-"} · {r.clinicId}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "knowledge",
      header: "Knowledge",
      searchable: (r) => r.knowledge,
      render: (r) => <div className="max-w-[620px] line-clamp-3 whitespace-pre-wrap">{r.knowledge}</div>,
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
        title="Training Model"
        description="Manage knowledge records by clinic for product/training information."
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
            <DialogTitle>{editing ? "Edit knowledge" : "Add knowledge"}</DialogTitle>
            <DialogDescription>
              Search a clinic, drop a document for AI analysis, then review the knowledge text before saving.
            </DialogDescription>
          </DialogHeader>

          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-6 px-6 mt-4 [scrollbar-gutter:stable]"
            role="region"
            aria-label="Knowledge form"
          >
            <div className="space-y-4 py-1 pr-1 pb-4">
              <div ref={clinicPickerRef} className="relative">
                <Label>Clinic</Label>
                <button
                  type="button"
                  className="mt-1.5 flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm text-left hover:bg-secondary/70 transition-colors"
                  onClick={() => {
                    setClinicMenuOpen((v) => !v);
                    setClinicQuery("");
                  }}
                >
                  <span className="truncate">
                    {selectedClinic
                      ? `${selectedClinic.name}${selectedClinic.acronym ? ` (${selectedClinic.acronym})` : ""}`
                      : "Select clinic"}
                  </span>
                  <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                </button>
                {clinicMenuOpen ? (
                  <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-border bg-popover shadow-elegant overflow-hidden">
                    <div className="p-2 border-b border-border">
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                          autoFocus
                          value={clinicQuery}
                          onChange={(e) => setClinicQuery(e.target.value)}
                          placeholder="Search clinic name, acronym, ID…"
                          className="h-9 pl-8"
                        />
                      </div>
                    </div>
                    <div className="max-h-56 overflow-y-auto p-1">
                      {filteredClinics.length === 0 ? (
                        <div className="px-3 py-6 text-center text-sm text-muted-foreground">No clinics match</div>
                      ) : (
                        filteredClinics.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className={cn(
                              "w-full rounded-lg px-3 py-2 text-left text-sm transition-colors hover:bg-secondary",
                              String(c.id) === formClinicId && "bg-secondary font-medium"
                            )}
                            onClick={() => {
                              setFormClinicId(String(c.id));
                              setClinicMenuOpen(false);
                              setClinicQuery("");
                            }}
                          >
                            <div className="truncate">{c.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {c.acronym || "-"} · {c.clinicId}
                              {c.city ? ` · ${c.city}` : ""}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
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
                  {uploadedName ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => setUploadedName(null)}
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
                    placeholder="Enter product / training knowledge details, or drop a document above…"
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
