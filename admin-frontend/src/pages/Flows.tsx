import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Brain,
  Bot,
  Copy,
  GitBranch,
  Loader2,
  Plus,
  Search,
  Eye,
  Wrench,
  Tags,
  Pencil,
  Trash2,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import FlowBuilderModal from "@/components/admin/FlowBuilderModal";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listAgentStudioCatalog,
  getAgentStudioTemplate,
  createAgentBrainTemplate,
  updateAgentBrainTemplate,
  deleteAgentBrainTemplate,
  listAgents,
  listAgentVoices,
  FLOW_SUBAGENT_TOOLS,
  createDefaultFlowGraph,
  type Agent,
  type AgentTypeInfo,
  type AgentTemplateInfo,
  type FlowGraph,
  type BotVoice,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const pageEase = [0.22, 1, 0.36, 1] as const;

type TemplateForm = {
  id?: string;
  typeId: string;
  name: string;
  summary: string;
  description: string;
  defaultTools: string[];
  suggestedVoice: string;
  tags: string;
  graph: FlowGraph;
  source?: "custom" | "fork";
};

const EMPTY_TEMPLATE_FORM = (typeId = "receptionist"): TemplateForm => ({
  typeId,
  name: "",
  summary: "",
  description: "",
  defaultTools: ["transfer_to_human"],
  suggestedVoice: "marin",
  tags: "",
  graph: createDefaultFlowGraph(),
  source: "custom",
});

function toolLabel(id: string) {
  return FLOW_SUBAGENT_TOOLS.find((t) => t.id === id)?.name || id;
}

function cloneGraph(graph?: FlowGraph | null): FlowGraph {
  if (!graph?.nodes?.length) return createDefaultFlowGraph();
  try {
    return JSON.parse(JSON.stringify(graph)) as FlowGraph;
  } catch {
    return createDefaultFlowGraph();
  }
}

function agentHasBrain(agent: Agent) {
  const count = agent.nodeCount ?? agent.graph?.nodes?.length ?? 0;
  return count > 0 || Boolean(agent.graph?.nodes?.length);
}

function isEditableTemplate(t: AgentTemplateInfo) {
  return t.editable === true || t.source === "custom" || t.source === "fork";
}

function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export default function Flows() {
  const [tab, setTab] = useState<"templates" | "agents">("templates");
  const [types, setTypes] = useState<AgentTypeInfo[]>([]);
  const [templates, setTemplates] = useState<AgentTemplateInfo[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [voices, setVoices] = useState<BotVoice[]>([]);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [templateQuery, setTemplateQuery] = useState("");
  const [agentQuery, setAgentQuery] = useState("");
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailTemplate, setDetailTemplate] = useState<AgentTemplateInfo | null>(null);
  const [loadingGraph, setLoadingGraph] = useState(false);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorSaving, setEditorSaving] = useState(false);
  const [form, setForm] = useState<TemplateForm>(EMPTY_TEMPLATE_FORM);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AgentTemplateInfo | null>(null);
  /** When creating (no form.id): blank canvas vs duplicate an existing brain */
  const [createStartMode, setCreateStartMode] = useState<"blank" | "duplicate">("blank");
  const [duplicateQuery, setDuplicateQuery] = useState("");
  const [duplicateBaseId, setDuplicateBaseId] = useState<string | null>(null);
  const [loadingDuplicate, setLoadingDuplicate] = useState(false);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerReadOnly, setViewerReadOnly] = useState(true);
  const [viewerTitle, setViewerTitle] = useState("Brain graph");
  const [viewerName, setViewerName] = useState("");
  const [viewerDescription, setViewerDescription] = useState("");
  const [viewerGraph, setViewerGraph] = useState<FlowGraph>(createDefaultFlowGraph());

  useEffect(() => {
    setLoadingTemplates(true);
    listAgentStudioCatalog()
      .then((catalog) => {
        setTypes(catalog.types || []);
        setTemplates(catalog.templates || []);
      })
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Failed to load brain templates")
      )
      .finally(() => setLoadingTemplates(false));
  }, [refreshKey]);

  useEffect(() => {
    setLoadingAgents(true);
    listAgents()
      .then((rows) => setAgents(rows))
      .catch((err) =>
        toast.error(err instanceof Error ? err.message : "Failed to load agents")
      )
      .finally(() => setLoadingAgents(false));
  }, []);

  useEffect(() => {
    listAgentVoices()
      .then((rows) => setVoices(rows))
      .catch(() => setVoices([]));
  }, []);

  const typeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of types) map.set(t.id, t.name);
    return map;
  }, [types]);

  const typeColorById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of types) if (t.color) map.set(t.id, t.color);
    return map;
  }, [types]);

  const typeById = useMemo(() => {
    const map = new Map<string, AgentTypeInfo>();
    for (const t of types) map.set(t.id, t);
    return map;
  }, [types]);

  const filteredTemplates = useMemo(() => {
    const q = templateQuery.trim().toLowerCase();
    return templates.filter((t) => {
      if (typeFilter !== "all" && t.typeId !== typeFilter) return false;
      if (!q) return true;
      const hay = [t.name, t.summary, t.description, t.typeId, ...(t.tags || [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [templates, typeFilter, templateQuery]);

  const duplicatePickerTemplates = useMemo(() => {
    const q = duplicateQuery.trim().toLowerCase();
    return templates.filter((t) => {
      if (form.typeId && t.typeId !== form.typeId) return false;
      if (!q) return true;
      const hay = [t.name, t.summary, t.description, ...(t.tags || [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [templates, form.typeId, duplicateQuery]);

  const publishedAgents = useMemo(() => {
    const q = agentQuery.trim().toLowerCase();
    return agents.filter((a) => {
      if (!agentHasBrain(a)) return false;
      if (!q) return true;
      const hay = [a.title, a.description, a.agentType || "", a.status]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [agents, agentQuery]);

  const patchForm = (patch: Partial<TemplateForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const reloadTemplates = () => setRefreshKey((k) => k + 1);

  const openTemplateDetail = (tpl: AgentTemplateInfo) => {
    setDetailTemplate(tpl);
    setDetailOpen(true);
  };

  const openNewTemplate = () => {
    const defaultType = types[0];
    const typeId = defaultType?.id || "receptionist";
    setForm({
      ...EMPTY_TEMPLATE_FORM(typeId),
      defaultTools: defaultType?.defaultTools?.length
        ? [...defaultType.defaultTools]
        : ["transfer_to_human"],
    });
    setCreateStartMode("blank");
    setDuplicateQuery("");
    setDuplicateBaseId(null);
    setCanvasOpen(false);
    setEditorOpen(true);
  };

  const openEditTemplate = async (tpl: AgentTemplateInfo) => {
    setLoadingGraph(true);
    try {
      const full = await getAgentStudioTemplate(tpl.id);
      setForm({
        id: full.id,
        typeId: full.typeId,
        name: full.name,
        summary: full.summary || "",
        description: full.description || "",
        defaultTools: full.defaultTools?.length ? [...full.defaultTools] : [],
        suggestedVoice: full.suggestedVoice || "marin",
        tags: (full.tags || []).join(", "),
        graph: cloneGraph(full.graph),
        source: full.source === "fork" ? "fork" : "custom",
      });
      setCreateStartMode("blank");
      setDuplicateBaseId(null);
      setDetailOpen(false);
      setCanvasOpen(false);
      setEditorOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load template");
    } finally {
      setLoadingGraph(false);
    }
  };

  const applyDuplicatedTemplate = async (
    tpl: AgentTemplateInfo,
    options?: { openEditor?: boolean; nameSuffix?: string }
  ) => {
    const openEditor = options?.openEditor !== false;
    const suffix = options?.nameSuffix ?? " (copy)";
    setLoadingGraph(true);
    setLoadingDuplicate(true);
    try {
      const full = await getAgentStudioTemplate(tpl.id);
      const baseName = full.name.replace(/\s*\((custom|copy)\)\s*$/i, "").trim() || full.name;
      setForm({
        typeId: full.typeId,
        name: `${baseName}${suffix}`,
        summary: full.summary || "",
        description: full.description || "",
        defaultTools: full.defaultTools?.length ? [...full.defaultTools] : [],
        suggestedVoice: full.suggestedVoice || "marin",
        tags: (full.tags || []).join(", "),
        graph: cloneGraph(full.graph),
        source: "fork",
      });
      setDuplicateBaseId(full.id);
      setCreateStartMode("duplicate");
      if (openEditor) {
        setDetailOpen(false);
        setCanvasOpen(false);
        setEditorOpen(true);
      }
      toast.success("Template duplicated — edit and save as a new custom brain");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not duplicate template");
    } finally {
      setLoadingGraph(false);
      setLoadingDuplicate(false);
    }
  };

  const duplicateAsCustom = async (tpl: AgentTemplateInfo) => {
    await applyDuplicatedTemplate(tpl, { openEditor: true, nameSuffix: " (copy)" });
  };

  const resetToBlankCreate = () => {
    const t = typeById.get(form.typeId) || types[0];
    const typeId = t?.id || form.typeId || "receptionist";
    setForm({
      ...EMPTY_TEMPLATE_FORM(typeId),
      defaultTools: t?.defaultTools?.length ? [...t.defaultTools] : ["transfer_to_human"],
    });
    setDuplicateBaseId(null);
    setCreateStartMode("blank");
  };

  const saveTemplate = async () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    if (!form.typeId) {
      toast.error("Type is required");
      return;
    }
    if (!form.id && createStartMode === "duplicate" && !duplicateBaseId) {
      toast.error("Pick a template to duplicate, or switch to blank canvas");
      return;
    }
    setEditorSaving(true);
    try {
      const payload = {
        typeId: form.typeId,
        name: form.name.trim(),
        summary: form.summary.trim(),
        description: form.description.trim(),
        defaultTools: form.defaultTools,
        suggestedVoice: form.suggestedVoice || "marin",
        tags: parseTags(form.tags),
        graph: form.graph,
      };
      if (form.id) {
        await updateAgentBrainTemplate(form.id, payload);
        toast.success("Template updated");
      } else {
        await createAgentBrainTemplate({
          ...payload,
          source: form.source === "fork" ? "fork" : "custom",
        });
        toast.success("Template created");
      }
      setEditorOpen(false);
      setCanvasOpen(false);
      reloadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setEditorSaving(false);
    }
  };

  const onDeleteTemplate = async () => {
    if (!confirmDelete) return;
    try {
      await deleteAgentBrainTemplate(confirmDelete.id);
      toast.success("Template deleted");
      setConfirmDelete(null);
      setDetailOpen(false);
      setDetailTemplate(null);
      reloadTemplates();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete template");
    }
  };

  const openTemplateGraph = async () => {
    if (!detailTemplate) return;
    setLoadingGraph(true);
    try {
      const full = await getAgentStudioTemplate(detailTemplate.id);
      setViewerTitle("Template brain");
      setViewerName(full.name);
      setViewerDescription(full.description || full.summary || "");
      setViewerGraph(cloneGraph(full.graph));
      setViewerReadOnly(true);
      setViewerOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load template graph");
    } finally {
      setLoadingGraph(false);
    }
  };

  const openAgentGraph = (agent: Agent) => {
    setViewerTitle("Published agent brain");
    setViewerName(agent.title);
    setViewerDescription(agent.description || "");
    setViewerGraph(cloneGraph(agent.graph));
    setViewerReadOnly(true);
    setViewerOpen(true);
  };

  const onTypeChange = (typeId: string) => {
    const t = typeById.get(typeId);
    const editing = Boolean(form.id);
    patchForm({
      typeId,
      defaultTools: t?.defaultTools?.length ? [...t.defaultTools] : form.defaultTools,
    });
    if (
      !editing &&
      createStartMode === "duplicate" &&
      duplicateBaseId &&
      templates.find((x) => x.id === duplicateBaseId)?.typeId !== typeId
    ) {
      setDuplicateBaseId(null);
      setForm((prev) => ({
        ...prev,
        typeId,
        defaultTools: t?.defaultTools?.length ? [...t.defaultTools] : prev.defaultTools,
        graph: createDefaultFlowGraph(),
        source: "fork",
        name: prev.name.replace(/\s*\(copy\)\s*$/i, "").trim(),
      }));
    }
  };

  const toggleTool = (toolId: string) => {
    patchForm({
      defaultTools: form.defaultTools.includes(toolId)
        ? form.defaultTools.filter((id) => id !== toolId)
        : [...form.defaultTools, toolId],
    });
  };

  const detailEditable = detailTemplate ? isEditableTemplate(detailTemplate) : false;
  const isEditingExisting = Boolean(form.id);

  return (
    <div className="admin-page">
      <PageHeader
        accent={3}
        title="Brain library"
        description="Browse system templates, duplicate them into custom brains, and preview published agent graphs."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              className="bg-gradient-primary text-primary-foreground"
              onClick={openNewTemplate}
            >
              <Plus className="h-4 w-4 mr-1.5" /> New template
            </Button>
            <Button asChild variant="outline">
              <Link to="/agents">
                <Plus className="h-4 w-4 mr-1.5" /> Create agent
              </Link>
            </Button>
          </div>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as "templates" | "agents")}
        className="space-y-5"
      >
        <TabsList className="grid w-full max-w-md grid-cols-2 h-auto p-1">
          <TabsTrigger value="templates" className="gap-1.5 py-2">
            <Brain className="h-3.5 w-3.5" /> Templates
          </TabsTrigger>
          <TabsTrigger value="agents" className="gap-1.5 py-2">
            <Bot className="h-3.5 w-3.5" /> Published agents
          </TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-0 space-y-4 focus-visible:ring-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={templateQuery}
                onChange={(e) => setTemplateQuery(e.target.value)}
                placeholder="Search templates…"
                className="pl-8"
              />
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {loadingTemplates ? "Loading…" : `${filteredTemplates.length} templates`}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTypeFilter("all")}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                typeFilter === "all"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:bg-muted/60"
              )}
            >
              All types
            </button>
            {types.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTypeFilter(t.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  typeFilter === t.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-card text-muted-foreground hover:bg-muted/60"
                )}
                style={
                  typeFilter === t.id && t.color
                    ? { borderColor: t.color, color: t.color, background: `${t.color}14` }
                    : undefined
                }
              >
                {t.name}
              </button>
            ))}
          </div>

          {loadingTemplates ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading templates…
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
              No templates match this filter.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredTemplates.map((tpl, index) => {
                const color = typeColorById.get(tpl.typeId);
                const editable = isEditableTemplate(tpl);
                return (
                  <motion.div
                    key={tpl.id}
                    className="text-left rounded-2xl border border-border/80 bg-card p-4 shadow-soft hover:border-primary/40 hover:shadow-md transition-all"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 * Math.min(index, 12), duration: 0.3, ease: pageEase }}
                  >
                    <button
                      type="button"
                      onClick={() => openTemplateDetail(tpl)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-border/60"
                          style={{
                            background: color ? `${color}18` : undefined,
                            color: color || undefined,
                          }}
                        >
                          <Brain className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium leading-tight truncate">{tpl.name}</div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            <Badge
                              variant="outline"
                              className="text-[10px]"
                              style={
                                color
                                  ? { borderColor: `${color}55`, color, background: `${color}12` }
                                  : undefined
                              }
                            >
                              {typeNameById.get(tpl.typeId) || tpl.typeId}
                            </Badge>
                            {editable ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] border-primary/30 bg-primary/10 text-primary"
                              >
                                Custom
                              </Badge>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <p className="mt-3 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                        {tpl.summary || "No summary"}
                      </p>
                      {tpl.tags?.length ? (
                        <div className="mt-3 flex flex-wrap gap-1">
                          {tpl.tags.slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 rounded-md bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              <Tags className="h-2.5 w-2.5" /> {tag}
                            </span>
                          ))}
                          {tpl.tags.length > 4 ? (
                            <span className="text-[10px] text-muted-foreground">
                              +{tpl.tags.length - 4}
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </button>
                    <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-end gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs"
                        disabled={loadingGraph}
                        onClick={(e) => {
                          e.stopPropagation();
                          void duplicateAsCustom(tpl);
                        }}
                      >
                        <Copy className="h-3.5 w-3.5 mr-1.5" /> Duplicate
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="agents" className="mt-0 space-y-4 focus-visible:ring-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative max-w-sm w-full">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={agentQuery}
                onChange={(e) => setAgentQuery(e.target.value)}
                placeholder="Search published agents…"
                className="pl-8"
              />
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              {loadingAgents ? "Loading…" : `${publishedAgents.length} with brains`}
            </div>
          </div>

          {loadingAgents ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
            </div>
          ) : publishedAgents.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-16 text-center text-sm text-muted-foreground">
              No published agents with conversation graphs yet.{" "}
              <Link to="/agents" className="text-primary underline-offset-2 hover:underline">
                Create an agent
              </Link>{" "}
              to publish a brain.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {publishedAgents.map((agent, index) => {
                const nodeCount = agent.nodeCount ?? agent.graph?.nodes?.length ?? 0;
                const typeLabel = agent.agentType
                  ? typeNameById.get(agent.agentType) || agent.agentType
                  : null;
                return (
                  <motion.button
                    key={agent.id}
                    type="button"
                    onClick={() => openAgentGraph(agent)}
                    className="text-left rounded-2xl border border-border/80 bg-card p-4 shadow-soft hover:border-primary/40 hover:shadow-md transition-all"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.02 * Math.min(index, 12), duration: 0.3, ease: pageEase }}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 ring-1 ring-border/60">
                        <GitBranch className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium leading-tight truncate">{agent.title}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge
                            variant="outline"
                            className={
                              agent.status === "active"
                                ? "text-success border-success/30 bg-success/10 text-[10px]"
                                : "text-[10px]"
                            }
                          >
                            {agent.status}
                          </Badge>
                          {typeLabel ? (
                            <Badge variant="outline" className="text-[10px]">
                              {typeLabel}
                            </Badge>
                          ) : null}
                          <Badge variant="outline" className="text-[10px] tabular-nums">
                            {nodeCount} nodes
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground line-clamp-2 leading-relaxed">
                      {agent.description || "No description"}
                    </p>
                    <div className="mt-3 text-[11px] text-primary inline-flex items-center gap-1">
                      <Eye className="h-3 w-3" /> View graph
                    </div>
                  </motion.button>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="sm:max-w-lg flex max-h-[90vh] flex-col gap-0 overflow-hidden p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2 pr-6">
              <Brain className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">{detailTemplate?.name || "Template"}</span>
            </DialogTitle>
            <DialogDescription>
              {detailTemplate
                ? typeNameById.get(detailTemplate.typeId) || detailTemplate.typeId
                : "Template details"}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6 max-h-[50vh]">
            <div className="space-y-4 py-2 pr-3">
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {detailTemplate?.description || detailTemplate?.summary || "No description"}
              </p>

              {detailTemplate?.defaultTools?.length ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
                    <Wrench className="h-3 w-3" /> Default tools
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detailTemplate.defaultTools.map((id) => (
                      <Badge key={id} variant="secondary" className="text-[11px] font-normal">
                        {toolLabel(id)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {detailTemplate?.tags?.length ? (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    Tags
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detailTemplate.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-[11px] font-normal">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 border-t border-border pt-4 gap-2 sm:gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
            <Button
              variant="outline"
              onClick={openTemplateGraph}
              disabled={loadingGraph || !detailTemplate}
            >
              {loadingGraph ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Loading…
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-1.5" /> Preview graph
                </>
              )}
            </Button>
            {detailTemplate ? (
              <Button
                variant="outline"
                onClick={() => void duplicateAsCustom(detailTemplate)}
                disabled={loadingGraph}
              >
                <Copy className="h-4 w-4 mr-1.5" /> Duplicate
              </Button>
            ) : null}
            {detailEditable && detailTemplate ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => void openEditTemplate(detailTemplate)}
                  disabled={loadingGraph}
                >
                  <Pencil className="h-4 w-4 mr-1.5" /> Edit
                </Button>
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(detailTemplate)}
                >
                  <Trash2 className="h-4 w-4 mr-1.5" /> Delete
                </Button>
              </>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editorOpen && !canvasOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditorOpen(false);
            setCanvasOpen(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-xl flex max-h-[90vh] flex-col gap-0 overflow-hidden p-6">
          <DialogHeader className="shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-primary shrink-0" />
              {isEditingExisting ? "Edit template" : "New template"}
            </DialogTitle>
            <DialogDescription>
              {isEditingExisting
                ? "Update metadata and conversation graph for this custom brain."
                : "Create a custom brain from scratch or duplicate an existing template to refine."}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 -mx-6 px-6 max-h-[55vh]">
            <div className="space-y-4 py-2 pr-3">
              {!isEditingExisting ? (
                <div className="space-y-3 rounded-xl border border-border/70 bg-muted/15 p-3">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Start from
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={resetToBlankCreate}
                      className={cn(
                        "rounded-xl border p-3 text-left text-sm transition-all",
                        createStartMode === "blank"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                          : "border-border/80 bg-card hover:border-primary/30"
                      )}
                    >
                      <div className="font-medium">Blank canvas</div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Start and End nodes only.
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCreateStartMode("duplicate");
                        if (!duplicateBaseId) {
                          setForm((prev) => ({
                            ...prev,
                            source: "fork",
                          }));
                        }
                      }}
                      className={cn(
                        "rounded-xl border p-3 text-left text-sm transition-all",
                        createStartMode === "duplicate"
                          ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                          : "border-border/80 bg-card hover:border-primary/30"
                      )}
                    >
                      <div className="font-medium flex items-center gap-1.5">
                        <Copy className="h-3.5 w-3.5" /> Duplicate template
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        Copy an existing brain, then customize.
                      </p>
                    </button>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Agent type</Label>
                    <Select value={form.typeId} onValueChange={onTypeChange}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        {types.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {createStartMode === "duplicate" ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                        <Label className="text-xs text-muted-foreground">
                          Pick a template to copy
                          {form.typeId
                            ? ` · ${typeNameById.get(form.typeId) || form.typeId}`
                            : ""}
                        </Label>
                        <Input
                          className="sm:max-w-[200px] h-8 text-xs"
                          placeholder="Filter…"
                          value={duplicateQuery}
                          onChange={(e) => setDuplicateQuery(e.target.value)}
                        />
                      </div>
                      {loadingDuplicate ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading brain…
                        </div>
                      ) : (
                        <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60 divide-y divide-border/50">
                          {duplicatePickerTemplates.map((tpl) => {
                            const selected = duplicateBaseId === tpl.id;
                            return (
                              <button
                                key={tpl.id}
                                type="button"
                                disabled={loadingDuplicate}
                                onClick={() =>
                                  void applyDuplicatedTemplate(tpl, {
                                    openEditor: false,
                                    nameSuffix: " (copy)",
                                  })
                                }
                                className={cn(
                                  "w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors",
                                  selected && "bg-primary/10"
                                )}
                              >
                                <div className="font-medium truncate flex items-center gap-2">
                                  {tpl.name}
                                  {selected ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] border-primary/30 text-primary"
                                    >
                                      Selected
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                                  {tpl.summary || "No summary"}
                                </p>
                              </button>
                            );
                          })}
                          {!duplicatePickerTemplates.length ? (
                            <p className="text-xs text-muted-foreground px-3 py-4 text-center">
                              No templates for this type. Try another type or clear the filter.
                            </p>
                          ) : null}
                        </div>
                      )}
                      {duplicateBaseId ? (
                        <p className="text-[11px] text-muted-foreground">
                          Graph loaded ({form.graph?.nodes?.length || 0} nodes). Edit fields below,
                          then open the canvas to refine.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="tpl-name">Name</Label>
                <Input
                  id="tpl-name"
                  value={form.name}
                  onChange={(e) => patchForm({ name: e.target.value })}
                  placeholder="e.g. Front desk after-hours"
                />
              </div>

              {isEditingExisting ? (
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={form.typeId} onValueChange={onTypeChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="tpl-summary">Summary</Label>
                <Input
                  id="tpl-summary"
                  value={form.summary}
                  onChange={(e) => patchForm({ summary: e.target.value })}
                  placeholder="Short card blurb"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="tpl-description">Description</Label>
                <Textarea
                  id="tpl-description"
                  value={form.description}
                  onChange={(e) => patchForm({ description: e.target.value })}
                  placeholder="What this brain is for…"
                  className="min-h-[88px]"
                />
              </div>

              <div className="space-y-2">
                <Label>Suggested voice</Label>
                <Select
                  value={form.suggestedVoice || undefined}
                  onValueChange={(v) => patchForm({ suggestedVoice: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select voice" />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {voices.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tpl-tags">Tags</Label>
                <Input
                  id="tpl-tags"
                  value={form.tags}
                  onChange={(e) => patchForm({ tags: e.target.value })}
                  placeholder="Comma-separated, e.g. after-hours, phone"
                />
              </div>

              <div className="space-y-2">
                <Label>Default tools</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto rounded-xl border border-border/60 p-3">
                  {FLOW_SUBAGENT_TOOLS.map((tool) => {
                    const on = form.defaultTools.includes(tool.id);
                    return (
                      <label
                        key={tool.id}
                        className="flex items-start gap-2 text-sm cursor-pointer"
                      >
                        <Checkbox checked={on} onCheckedChange={() => toggleTool(tool.id)} />
                        <span>
                          <span className="font-medium">{tool.name}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {tool.description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-border/70 bg-muted/20 p-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-sm text-muted-foreground">
                  Conversation graph ·{" "}
                  <span className="tabular-nums text-foreground font-medium">
                    {form.graph?.nodes?.length || 0} nodes
                  </span>
                </div>
                <Button type="button" variant="outline" onClick={() => setCanvasOpen(true)}>
                  <GitBranch className="h-4 w-4 mr-1.5" /> Open conversation canvas
                </Button>
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 border-t border-border pt-4 gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setEditorOpen(false);
                setCanvasOpen(false);
              }}
              disabled={editorSaving}
            >
              Cancel
            </Button>
            <Button
              className="bg-gradient-primary text-primary-foreground"
              onClick={() => void saveTemplate()}
              disabled={editorSaving}
            >
              {editorSaving ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              {isEditingExisting ? "Save template" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FlowBuilderModal
        open={canvasOpen}
        readOnly={false}
        title="Template conversation brain"
        name={form.name || "Untitled template"}
        description={form.description}
        knowledgeItems={[]}
        graph={form.graph}
        onNameChange={(v) => patchForm({ name: v })}
        onDescriptionChange={(v) => patchForm({ description: v })}
        onGraphChange={(g) => patchForm({ graph: g })}
        onClose={() => setCanvasOpen(false)}
        onSave={() => {
          setCanvasOpen(false);
          toast.success("Brain updated");
        }}
      />

      <FlowBuilderModal
        open={viewerOpen}
        readOnly={viewerReadOnly}
        title={viewerTitle}
        name={viewerName}
        description={viewerDescription}
        knowledgeItems={[]}
        graph={viewerGraph}
        onClose={() => setViewerOpen(false)}
      />

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete template?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{confirmDelete?.name}</strong>. Agents that were
              created from it keep their own graphs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void onDeleteTemplate()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
