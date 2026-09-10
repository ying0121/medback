import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  GitBranch,
  Pencil,
  Plus,
  Trash2,
  Building2,
  Play,
  MessageSquare,
  HelpCircle,
  Layers,
  Search,
  X,
  Bot,
  GitFork,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import FlowBuilderModal from "@/components/admin/FlowBuilderModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  listConversationFlows,
  listKnowledge,
  createConversationFlow,
  updateConversationFlow,
  deleteConversationFlow,
  createDefaultFlowGraph,
  type Clinic,
  type ConversationFlowItem,
  type FlowGraph,
  type FlowEdge,
  type KnowledgeItem,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
const pageEase = [0.22, 1, 0.36, 1] as const;

function syncGraphEdges(graph: FlowGraph): FlowGraph {
  const nonBranch = graph.edges.filter((e) => !e.sourceHandle);
  const branchEdges: FlowEdge[] = [];
  for (const node of graph.nodes) {
    const paths =
      node.type === "question"
        ? node.data.options || []
        : node.type === "branch"
          ? node.data.branches || []
          : [];
    for (const opt of paths) {
      if (!opt.target) continue;
      branchEdges.push({
        id: `e-${node.id}-${opt.id}`,
        source: node.id,
        target: opt.target,
        label: opt.label || "",
        sourceHandle: opt.id,
      });
    }
  }
  return { ...graph, edges: [...nonBranch, ...branchEdges] };
}

function nodeCounts(graph?: FlowGraph) {
  const nodes = graph?.nodes || [];
  return {
    total: nodes.length,
    message: nodes.filter((n) => n.type === "message").length,
    question: nodes.filter((n) => n.type === "question").length,
    subagent: nodes.filter((n) => n.type === "subagent").length,
    branch: nodes.filter((n) => n.type === "branch").length,
  };
}

export default function Flows() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [items, setItems] = useState<ConversationFlowItem[]>([]);
  const [filterClinicId, setFilterClinicId] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  const [builderOpen, setBuilderOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [editing, setEditing] = useState<ConversationFlowItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formClinicIds, setFormClinicIds] = useState<string[]>([]);
  const [formStatus, setFormStatus] = useState<"active" | "inactive">("active");
  const [formGraph, setFormGraph] = useState<FlowGraph>(createDefaultFlowGraph());
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [clinicQuery, setClinicQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConversationFlowItem | null>(null);

  useEffect(() => {
    const allowed = user?.role === "Admin" ? undefined : user?.clinicIds;
    listClinics().then((all) => {
      const filtered = allowed ? all.filter((c) => allowed.includes(c.id)) : all;
      setClinics(filtered);
    });
    listKnowledge({ status: "active" }).then((rows) => {
      const allowedIds = user?.role === "Admin" ? null : new Set(user?.clinicIds || []);
      setKnowledgeItems(
        allowedIds
          ? rows.filter((r) => {
              const ids = r.clinicIds?.length ? r.clinicIds : r.clinicId ? [r.clinicId] : [];
              return ids.some((id) => allowedIds.has(String(id)));
            })
          : rows
      );
    });
  }, [user, refreshKey]);

  const clinicMap = useMemo(
    () => Object.fromEntries(clinics.map((c) => [c.id, c])),
    [clinics]
  );

  const filteredSetupClinics = useMemo(() => {
    const q = clinicQuery.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter((c) =>
      [c.name, c.acronym, c.clinicId, c.city].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [clinics, clinicQuery]);

  const selectedSetupClinics = useMemo(
    () => formClinicIds.map((id) => clinicMap[id]).filter(Boolean),
    [formClinicIds, clinicMap]
  );

  const toggleSetupClinic = (id: string) => {
    setFormClinicIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  useEffect(() => {
    setLoading(true);
    listConversationFlows({
      clinicId: filterClinicId === "all" ? undefined : filterClinicId,
      status: filterStatus === "all" ? undefined : filterStatus,
    })
      .then((rows) => {
        const allowed = user?.role === "Admin" ? null : new Set(user?.clinicIds || []);
        setItems(
          allowed
            ? rows.filter((r) => {
                const ids = r.clinicIds?.length ? r.clinicIds : r.clinicId ? [r.clinicId] : [];
                return ids.some((id) => allowed.has(String(id)));
              })
            : rows
        );
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load flows"))
      .finally(() => setLoading(false));
  }, [filterClinicId, filterStatus, user, refreshKey]);

  const stats = useMemo(() => {
    const active = items.filter((i) => i.status === "active").length;
    const nodes = items.reduce((sum, i) => sum + (i.graph?.nodes?.length || 0), 0);
    const clinicsCovered = new Set(
      items.flatMap((i) => (i.clinicIds?.length ? i.clinicIds : i.clinicId ? [i.clinicId] : []))
    ).size;
    return { total: items.length, active, nodes, clinicsCovered };
  }, [items]);

  const openCreate = () => {
    if (!clinics.length) {
      toast.error("Add a clinic first");
      return;
    }
    setEditing(null);
    setFormName("");
    setFormDescription("");
    setFormStatus("active");
    setFormClinicIds(clinics.length === 1 ? [clinics[0].id] : []);
    setFormGraph(createDefaultFlowGraph());
    setClinicQuery("");
    setSetupOpen(true);
  };

  const continueToBuilder = () => {
    if (!formName.trim()) return toast.error("Flow name is required");
    if (!formClinicIds.length) return toast.error("Select at least one clinic");
    setSetupOpen(false);
    setBuilderOpen(true);
  };

  const openEdit = (row: ConversationFlowItem) => {
    setEditing(row);
    setFormName(row.name);
    setFormDescription(row.description || "");
    setFormStatus(row.status === "inactive" ? "inactive" : "active");
    setFormClinicIds(
      row.clinicIds?.length ? row.clinicIds.map(String) : row.clinicId ? [row.clinicId] : []
    );
    setFormGraph(row.graph?.nodes?.length ? row.graph : createDefaultFlowGraph());
    setBuilderOpen(true);
  };

  const save = async () => {
    if (!formName.trim()) return toast.error("Flow name is required");
    if (!formClinicIds.length) return toast.error("Select at least one clinic");
    setSaving(true);
    try {
      const graph = syncGraphEdges(formGraph);
      if (editing) {
        await updateConversationFlow(editing.id, {
          name: formName.trim(),
          description: formDescription.trim(),
          clinicIds: formClinicIds,
          status: formStatus,
          graph,
        });
        toast.success("Flow updated");
      } else {
        await createConversationFlow({
          name: formName.trim(),
          description: formDescription.trim(),
          clinicIds: formClinicIds,
          graph,
          status: formStatus,
        });
        toast.success("Flow created");
      }
      setBuilderOpen(false);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save flow");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteConversationFlow(confirmDelete.id);
      toast.success("Flow deleted");
      setConfirmDelete(null);
      setRefreshKey((k) => k + 1);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const columns: Column<ConversationFlowItem>[] = [
    {
      key: "name",
      header: "Flow",
      searchable: (r) => `${r.name} ${r.description}`,
      render: (r) => {
        const counts = nodeCounts(r.graph);
        return (
          <div className="flex items-start gap-3 min-w-[220px]">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500/15 to-sky-500/10 flex items-center justify-center ring-1 ring-border/60 shrink-0">
              <GitBranch className="h-4 w-4 text-violet-600" />
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate leading-tight">{r.name}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5 max-w-[280px]">
                {r.description || "No description"}
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" /> {counts.message}
                </span>
                <span className="inline-flex items-center gap-1">
                  <HelpCircle className="h-3 w-3" /> {counts.question}
                </span>
                {counts.subagent ? (
                  <span className="inline-flex items-center gap-1">
                    <Bot className="h-3 w-3" /> {counts.subagent}
                  </span>
                ) : null}
                {counts.branch ? (
                  <span className="inline-flex items-center gap-1">
                    <GitFork className="h-3 w-3" /> {counts.branch}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "clinic",
      header: "Clinics",
      searchable: (r) => {
        const ids = r.clinicIds?.length ? r.clinicIds : r.clinicId ? [r.clinicId] : [];
        return ids.map((id) => clinicMap[id]?.name || id).join(" ");
      },
      render: (r) => {
        const ids = r.clinicIds?.length ? r.clinicIds : r.clinicId ? [r.clinicId] : [];
        const first = clinicMap[ids[0]];
        return (
          <div className="flex items-center gap-2.5 min-w-[180px]">
            <div className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-primary/15 to-muted flex items-center justify-center ring-1 ring-border/60">
              <Building2 className="h-4 w-4 text-primary/80" />
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate leading-tight">
                {first?.name || ids[0] || "—"}
              </div>
              <div className="text-xs text-muted-foreground truncate">
                {ids.length > 1
                  ? `+${ids.length - 1} more clinic${ids.length === 2 ? "" : "s"}`
                  : first?.acronym || "—"}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "nodes",
      header: "Structure",
      render: (r) => {
        const counts = nodeCounts(r.graph);
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-primary border-primary/30 bg-primary/10 tabular-nums">
              {counts.total} nodes
            </Badge>
            <span className="text-xs text-muted-foreground tabular-nums">
              {r.graph?.edges?.length || 0} links
            </span>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      searchable: (r) => r.status,
      render: (r) => (
        <Badge
          variant="outline"
          className={
            r.status === "active"
              ? "text-success border-success/30 bg-success/10"
              : "text-muted-foreground border-border bg-muted/40"
          }
        >
          {r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-28 text-right",
      searchable: () => "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button size="icon" variant="ghost" title="Edit flow" onClick={() => openEdit(r)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="text-destructive"
            title="Delete"
            onClick={() => setConfirmDelete(r)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Conversation flows"
        description="Design the bot’s work mode as a visual graph. Start and End are fixed — reaching End hangs up the call."
        actions={
          <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground">
            <Plus className="h-4 w-4 mr-1.5" /> Create flow
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Total flows", value: stats.total, icon: Layers, color: "#6366f1", hint: "In this view" },
          { label: "Active", value: stats.active, icon: Play, color: "#10b981", hint: "Ready for campaigns" },
          { label: "Nodes defined", value: stats.nodes, icon: GitBranch, color: "#0ea5e9", hint: "Across all flows" },
          { label: "Clinics", value: stats.clinicsCovered, icon: Building2, color: "#8b5cf6", hint: "With at least one flow" },
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
        searchPlaceholder="Search flows…"
        emptyMessage="No conversation flows yet — create one to define how the bot talks"
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
              onValueChange={(v) => setFilterStatus(v as "all" | "active" | "inactive")}
            >
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
      />

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-lg flex max-h-[90vh] flex-col gap-0 overflow-hidden p-6">
          <div className="h-1.5 w-16 rounded-full bg-gradient-primary mb-3" />
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-violet-600" /> Create conversation flow
            </DialogTitle>
            <DialogDescription>
              Choose clinics, add a description, and set status. Then design the flow graph.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 overflow-y-auto -mx-6 px-6 [scrollbar-gutter:stable]">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Name
              </Label>
              <Input
                className="mt-1.5"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Appointment reminder script"
              />
            </div>

            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Description
              </Label>
              <Textarea
                className="mt-1.5 min-h-[90px]"
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="What this bot work mode does…"
              />
            </div>

            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Status
              </Label>
              <Select
                value={formStatus}
                onValueChange={(v) => setFormStatus(v as "active" | "inactive")}
              >
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
              <div className="flex items-center justify-between gap-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Clinics (multi-select)
                </Label>
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
              {formClinicIds.length > 0 ? (
                <div className="mt-2 rounded-xl border border-border/80 bg-muted/20 px-3 py-2.5">
                  <div
                    className="text-sm font-medium truncate"
                    title={
                      formClinicIds.length >= clinics.length && clinics.length > 0
                        ? "All clinics"
                        : selectedSetupClinics.map((c) => c.name).join(", ")
                    }
                  >
                    {formClinicIds.length >= clinics.length && clinics.length > 0
                      ? "All clinics"
                      : selectedSetupClinics.length <= 2
                        ? selectedSetupClinics.map((c) => c.name).join(", ")
                        : `${selectedSetupClinics[0]?.name}, ${selectedSetupClinics[1]?.name}`}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {formClinicIds.length >= clinics.length && clinics.length > 0
                      ? `${formClinicIds.length} selected`
                      : selectedSetupClinics.length <= 2
                        ? `${formClinicIds.length} clinic${formClinicIds.length === 1 ? "" : "s"}`
                        : `+${formClinicIds.length - 2} more · ${formClinicIds.length} total`}
                  </div>
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
                  {filteredSetupClinics.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">
                      No clinics match
                    </div>
                  ) : (
                    filteredSetupClinics.map((c) => {
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
                            onChange={() => toggleSetupClinic(String(c.id))}
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
          </div>

          <DialogFooter className="shrink-0 border-t border-border pt-4">
            <Button variant="outline" onClick={() => setSetupOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-primary text-primary-foreground"
              onClick={continueToBuilder}
            >
              Continue to builder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FlowBuilderModal
        open={builderOpen}
        title={editing ? "Edit conversation flow" : "Create conversation flow"}
        name={formName}
        description={formDescription}
        clinicIds={formClinicIds}
        clinics={clinics}
        knowledgeItems={knowledgeItems}
        graph={formGraph}
        saving={saving}
        onNameChange={setFormName}
        onDescriptionChange={setFormDescription}
        onClinicIdsChange={setFormClinicIds}
        onGraphChange={setFormGraph}
        onClose={() => setBuilderOpen(false)}
        onSave={save}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete flow?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes “{confirmDelete?.name}”. Campaigns using it will need another flow.
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
