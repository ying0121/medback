import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  FlaskConical,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  LayoutTemplate,
  Trash2,
  Wand2,
  FilePlus2,
  Copy,
  Eye,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import AgentTestLab from "@/components/admin/AgentTestLab";
import FlowBuilderModal from "@/components/admin/FlowBuilderModal";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  listAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  listAgentVoices,
  listAgentLinkOptions,
  listAgentStudioCatalog,
  getAgentStudioTemplate,
  generateAgentDraft,
  listKnowledge,
  createDefaultFlowGraph,
  FLOW_SUBAGENT_TOOLS,
  type Agent,
  type AgentInput,
  type AgentCreationSource,
  type AgentStudioCatalog,
  type AgentStudioTemplateSummary,
  type AgentStudioType,
  type BotVoice,
  type FlowGraph,
  type KnowledgeItem,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const pageEase = [0.22, 1, 0.36, 1] as const;

type CreationMethod = "template" | "custom" | "ai";

type StudioForm = {
  title: string;
  description: string;
  status: "active" | "inactive";
  agentType: string | null;
  creationSource: AgentCreationSource | null;
  templateId: string | null;
  sourceBrief: string;
  defaultTools: string[];
  graph: FlowGraph;
  knowledgeIds: string[];
  openaiVoice: string;
  aiTone: string;
  aiLanguages: string[];
  aiMustHaveTools: string[];
  aiRationale: string;
  aiCombineTemplateIds: string[];
  aiCombinedNames: string[];
};

const EMPTY_FORM = (): StudioForm => ({
  title: "",
  description: "",
  status: "active",
  agentType: null,
  creationSource: null,
  templateId: null,
  sourceBrief: "",
  defaultTools: [],
  graph: createDefaultFlowGraph(),
  knowledgeIds: [],
  openaiVoice: "marin",
  aiTone: "warm professional",
  aiLanguages: ["English"],
  aiMustHaveTools: [],
  aiRationale: "",
  aiCombineTemplateIds: [],
  aiCombinedNames: [],
});

const CREATE_STEPS = [
  { id: "method", label: "Method" },
  { id: "type", label: "Type" },
  { id: "source", label: "Template / AI" },
  { id: "identity", label: "Identity" },
  { id: "brain", label: "Brain" },
  { id: "knowledge", label: "Knowledge" },
  { id: "test", label: "Test" },
  { id: "review", label: "Publish" },
] as const;

const EDIT_STEPS = [
  { id: "identity", label: "Identity" },
  { id: "brain", label: "Brain" },
  { id: "knowledge", label: "Knowledge" },
  { id: "test", label: "Test" },
  { id: "review", label: "Save" },
] as const;

/** Modal size per wizard step — width tracks content density. */
function getStudioModalLayout(
  stepId: string,
  method: CreationMethod | null,
  customStartMode: "blank" | "duplicate"
): { width: number; height: number } {
  switch (stepId) {
    case "method":
      return { width: 760, height: 520 };
    case "type":
      return { width: 980, height: 760 };
    case "source":
      if (method === "ai") return { width: 820, height: 860 };
      if (method === "template") return { width: 980, height: 820 };
      if (method === "custom" && customStartMode === "duplicate") {
        return { width: 920, height: 780 };
      }
      return { width: 560, height: 480 };
    case "identity":
      return { width: 560, height: 620 };
    case "brain":
      return { width: 560, height: 480 };
    case "knowledge":
      return { width: 720, height: 640 };
    case "test":
      return { width: 520, height: 420 };
    case "review":
      return { width: 560, height: 580 };
    default:
      return { width: 720, height: 640 };
  }
}

const SOURCE_LABEL: Record<string, string> = {
  template: "Template",
  custom: "Custom",
  ai: "AI",
  legacy: "Legacy",
};

const AI_LANGUAGES = ["English", "Spanish", "Korean", "Chinese", "Vietnamese", "Tagalog", "Arabic"];

const DEFAULT_TEST_SCENARIOS = [
  {
    id: "hours",
    label: "Clinic hours",
    firstMessage: "Hi, what are your clinic hours this week?",
  },
  {
    id: "book",
    label: "Book visit",
    firstMessage: "I'd like to schedule an appointment with a doctor next week.",
  },
  {
    id: "transfer",
    label: "Speak to staff",
    firstMessage: "Can you transfer me to a human receptionist?",
  },
];

export function formatWorkingTime(seconds?: number | null): string {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  return `${m}m`;
}

function cloneGraph(graph?: FlowGraph | null): FlowGraph {
  if (!graph?.nodes?.length) return createDefaultFlowGraph();
  try {
    return JSON.parse(JSON.stringify(graph)) as FlowGraph;
  } catch {
    return createDefaultFlowGraph();
  }
}

function formFromAgent(agent: Agent): StudioForm {
  return {
    title: agent.title,
    description: agent.description || "",
    status: agent.status,
    agentType: agent.agentType || null,
    creationSource: agent.creationSource || "legacy",
    templateId: agent.templateId || null,
    sourceBrief: agent.sourceBrief || "",
    defaultTools: [...(agent.defaultTools || [])],
    graph: cloneGraph(agent.graph),
    knowledgeIds: [...(agent.knowledgeIds || [])],
    openaiVoice: agent.openaiVoice || "marin",
    aiTone: "warm professional",
    aiLanguages: ["English"],
    aiMustHaveTools: [],
    aiRationale: "",
    aiCombineTemplateIds: [],
    aiCombinedNames: [],
  };
}

function graphNodeCount(graph?: FlowGraph | null) {
  return graph?.nodes?.length || 0;
}

function hasUsableGraph(graph?: FlowGraph | null) {
  return graphNodeCount(graph) >= 2;
}

const AI_GENERATE_PHASES = [
  "Reading your brief…",
  "Matching patient-care templates…",
  "Combining capabilities…",
  "Weaving the conversation brain…",
  "Tuning tools and safety paths…",
  "Almost ready…",
];

function AiGeneratingPanel({
  active,
  combining,
}: {
  active: boolean;
  combining: boolean;
}) {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    if (!active) {
      setPhase(0);
      return;
    }
    const id = window.setInterval(() => {
      setPhase((p) => (p + 1) % AI_GENERATE_PHASES.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [active]);

  if (!active) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="relative overflow-hidden rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.07] via-card to-sky-500/[0.06] p-6 sm:p-8"
    >
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.div
          className="absolute -top-16 -right-10 h-40 w-40 rounded-full bg-primary/15 blur-3xl"
          animate={{ scale: [1, 1.25, 1], opacity: [0.35, 0.55, 0.35] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          className="absolute -bottom-20 -left-8 h-44 w-44 rounded-full bg-sky-400/15 blur-3xl"
          animate={{ scale: [1.1, 0.95, 1.1], opacity: [0.3, 0.5, 0.3] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      <div className="relative flex flex-col sm:flex-row items-center gap-6">
        <div className="relative h-28 w-28 shrink-0">
          <motion.div
            className="absolute inset-0 rounded-full border border-primary/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 12, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-2 rounded-full border border-dashed border-sky-500/30"
            animate={{ rotate: -360 }}
            transition={{ duration: 9, repeat: Infinity, ease: "linear" }}
          />
          <motion.div
            className="absolute inset-0"
            animate={{ rotate: 360 }}
            transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
          >
            {[0, 1, 2, 3].map((i) => (
              <span
                key={i}
                className="absolute left-1/2 top-1/2 h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_12px_hsl(var(--primary)/0.55)]"
                style={{
                  transform: `translate(-50%, -50%) rotate(${i * 90}deg) translateY(-46px)`,
                }}
              />
            ))}
          </motion.div>
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              className="h-14 w-14 rounded-2xl bg-gradient-primary text-primary-foreground flex items-center justify-center shadow-lift"
              animate={{ scale: [1, 1.06, 1] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <Sparkles className="h-6 w-6" />
            </motion.div>
          </div>
        </div>

        <div className="min-w-0 flex-1 text-center sm:text-left space-y-3">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
              Building agent brain
            </div>
            <AnimatePresence mode="wait">
              <motion.p
                key={phase}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.25 }}
                className="mt-1.5 text-base font-medium"
              >
                {AI_GENERATE_PHASES[phase]}
              </motion.p>
            </AnimatePresence>
            <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
              {combining
                ? "Merging selected and auto-matched templates into one patient-facing conversation."
                : "Designing a medicine-focused draft from your brief. This usually takes a few seconds."}
            </p>
          </div>

          <div className="h-1.5 w-full max-w-sm mx-auto sm:mx-0 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary via-sky-500 to-primary bg-[length:200%_100%]"
              initial={{ x: "-40%", width: "40%" }}
              animate={{ x: ["-40%", "100%"] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>

          <div className="flex flex-wrap justify-center sm:justify-start gap-2 pt-0.5">
            {(combining
              ? ["Brief", "Templates", "Merge", "Graph"]
              : ["Brief", "Type", "Tools", "Graph"]
            ).map((label, i) => (
              <motion.span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-2.5 py-1 text-[10px] text-muted-foreground"
                animate={{
                  borderColor:
                    phase % 4 === i
                      ? "hsl(var(--primary) / 0.45)"
                      : "hsl(var(--border) / 0.7)",
                  color:
                    phase % 4 === i
                      ? "hsl(var(--primary))"
                      : "hsl(var(--muted-foreground))",
                }}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    phase % 4 === i ? "bg-primary" : "bg-muted-foreground/40"
                  )}
                />
                {label}
              </motion.span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Field({
  label,
  className,
  hint,
  children,
}: {
  label: string;
  className?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground mt-1">{hint}</p> : null}
    </div>
  );
}

function StudioStepper({
  steps,
  currentIndex,
  onStepClick,
  allowJump,
}: {
  steps: { id: string; label: string }[];
  currentIndex: number;
  onStepClick: (index: number) => void;
  allowJump: boolean;
}) {
  const current = steps[currentIndex];
  return (
    <div className="space-y-3 pt-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Step {currentIndex + 1} of {steps.length}
          </div>
          <div className="text-sm font-medium mt-0.5 truncate">{current?.label}</div>
        </div>
        <div className="hidden sm:block h-1.5 w-28 rounded-full bg-muted overflow-hidden shrink-0">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / steps.length) * 100}%` }}
          />
        </div>
      </div>

      <ol className="flex items-start w-full">
        {steps.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const clickable = allowJump || i <= currentIndex;
          return (
            <li key={step.id} className="flex-1 flex items-start min-w-0">
              <div className="flex flex-col items-center w-full min-w-0">
                <div className="flex items-center w-full">
                  {i > 0 ? (
                    <div
                      className={cn(
                        "h-px flex-1 transition-colors",
                        done || active ? "bg-primary/50" : "bg-border"
                      )}
                    />
                  ) : (
                    <div className="flex-1" />
                  )}
                  <button
                    type="button"
                    disabled={!clickable}
                    onClick={() => clickable && onStepClick(i)}
                    className={cn(
                      "relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-all",
                      active &&
                        "border-primary bg-primary text-primary-foreground shadow-soft ring-4 ring-primary/15",
                      done &&
                        !active &&
                        "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15",
                      !done &&
                        !active &&
                        "border-border bg-card text-muted-foreground",
                      clickable && !active && "cursor-pointer",
                      !clickable && "cursor-default opacity-60"
                    )}
                    title={step.label}
                  >
                    {done ? <Check className="h-3.5 w-3.5" strokeWidth={2.5} /> : i + 1}
                  </button>
                  {i < steps.length - 1 ? (
                    <div
                      className={cn(
                        "h-px flex-1 transition-colors",
                        done ? "bg-primary/50" : "bg-border"
                      )}
                    />
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
                <span
                  className={cn(
                    "mt-2 text-[10px] leading-tight text-center px-0.5 max-w-[4.5rem] truncate",
                    active
                      ? "font-semibold text-foreground"
                      : done
                        ? "font-medium text-primary/80"
                        : "text-muted-foreground"
                  )}
                >
                  {step.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  color,
  index = 0,
}: {
  icon: typeof Bot;
  label: string;
  value: string | number;
  hint: string;
  color: string;
  index?: number;
}) {
  return (
    <motion.div
      className="bg-card border border-border/80 rounded-2xl p-4 shadow-soft"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.35, ease: pageEase }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold tracking-tight mt-1 tabular-nums">{value}</div>
          <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>
        </div>
        <div
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, color }}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}

function ComplexityDots({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`Complexity ${value}/5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            i < value ? "bg-primary" : "bg-muted-foreground/25"
          )}
        />
      ))}
    </div>
  );
}

export default function Agents() {
  const [data, setData] = useState<Agent[]>([]);
  const [catalog, setCatalog] = useState<AgentStudioCatalog | null>(null);
  const [voices, setVoices] = useState<BotVoice[]>([]);
  const [knowledgeItems, setKnowledgeItems] = useState<KnowledgeItem[]>([]);
  const [linkKnowledge, setLinkKnowledge] = useState<
    { id: string; knowledge: string; promptKey: string; status: string }[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [studioOpen, setStudioOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState<StudioForm>(EMPTY_FORM);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Agent | null>(null);

  const [method, setMethod] = useState<CreationMethod | null>(null);
  const [templateQuery, setTemplateQuery] = useState("");
  const [expandedTypeId, setExpandedTypeId] = useState<string | null>(null);
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);
  const [loadingTemplate, setLoadingTemplate] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [canvasOpen, setCanvasOpen] = useState(false);
  /** Custom method: blank canvas vs duplicate an existing template brain */
  const [customStartMode, setCustomStartMode] = useState<"blank" | "duplicate">("blank");
  const [customBaseTemplateId, setCustomBaseTemplateId] = useState<string | null>(null);
  /** AI combine: show templates across all types (not only preferred type) */
  const [aiCombineAllTypes, setAiCombineAllTypes] = useState(true);
  const [aiCombineQuery, setAiCombineQuery] = useState("");

  const [testOpen, setTestOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<{
    agentId?: string;
    title?: string;
    draft?: Partial<AgentInput> & { title?: string };
  } | null>(null);

  const isEdit = Boolean(editing);
  const steps = isEdit ? EDIT_STEPS : CREATE_STEPS;
  const currentStep = steps[stepIndex]?.id || "identity";
  const studioLayout = useMemo(
    () => getStudioModalLayout(currentStep, method, customStartMode),
    [currentStep, method, customStartMode]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [agents, studio, voiceList, knowledge, links] = await Promise.all([
        listAgents(),
        listAgentStudioCatalog(),
        listAgentVoices(),
        listKnowledge({ status: "active" }).catch(() => [] as KnowledgeItem[]),
        listAgentLinkOptions().catch(() => ({ flows: [], knowledge: [] })),
      ]);
      setData(agents);
      setCatalog(studio);
      setVoices(voiceList);
      setKnowledgeItems(knowledge);
      setLinkKnowledge(links.knowledge || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const typeMap = useMemo(() => {
    const map = new Map<string, AgentStudioType>();
    for (const t of catalog?.types || []) map.set(t.id, t);
    return map;
  }, [catalog]);

  const filteredTemplates = useMemo(() => {
    const q = templateQuery.trim().toLowerCase();
    let list = catalog?.templates || [];
    if (form.agentType) list = list.filter((t) => t.typeId === form.agentType);
    if (!q) return list;
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [catalog, form.agentType, templateQuery]);

  const aiCombineTemplates = useMemo(() => {
    const q = aiCombineQuery.trim().toLowerCase();
    let list = catalog?.templates || [];
    if (!aiCombineAllTypes && form.agentType) {
      list = list.filter((t) => t.typeId === form.agentType);
    }
    if (!q) return list;
    return list.filter((t) => {
      const hay = [t.name, t.summary, t.description, t.typeId, ...(t.tags || [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, form.agentType, aiCombineAllTypes, aiCombineQuery]);

  const knowledgeOptions = useMemo(() => {
    if (knowledgeItems.length) return knowledgeItems;
    return linkKnowledge.map((k) => ({
      id: k.id,
      knowledge: k.knowledge,
      promptKey: k.promptKey,
      status: k.status as "active" | "inactive",
      clinicId: "",
      clinicIds: [] as string[],
    }));
  }, [knowledgeItems, linkKnowledge]);

  const stats = useMemo(() => {
    const total = data.length;
    const active = data.filter((a) => a.status === "active").length;
    const workingSeconds = data.reduce(
      (sum, a) => sum + (a.workingTime?.totalSeconds || 0),
      0
    );
    return {
      total,
      active,
      workingSeconds,
      templates: catalog?.templateCount ?? 0,
    };
  }, [data, catalog]);

  const patchForm = (patch: Partial<StudioForm>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM());
    setMethod(null);
    setStepIndex(0);
    setTemplateQuery("");
    setExpandedTypeId(null);
    setExpandedTemplateId(null);
    setCustomStartMode("blank");
    setCustomBaseTemplateId(null);
    setAiCombineAllTypes(true);
    setAiCombineQuery("");
    setStudioOpen(true);
  };

  const openEdit = async (agent: Agent) => {
    try {
      const full = await getAgent(agent.id);
      setEditing(full);
      setForm(formFromAgent(full));
      setMethod((full.creationSource as CreationMethod) || null);
      setStepIndex(0);
      setStudioOpen(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load agent");
    }
  };

  const openTest = (agent?: Agent, draft?: Partial<AgentInput> & { title?: string }) => {
    setTestTarget({
      agentId: agent?.id,
      title: agent?.title || draft?.title || form.title,
      draft: draft || (agent
        ? {
            title: agent.title,
            description: agent.description,
            openaiVoice: agent.openaiVoice,
            knowledgeIds: agent.knowledgeIds,
            graph: agent.graph || undefined,
            agentType: agent.agentType,
            defaultTools: agent.defaultTools,
          }
        : undefined),
    });
    setTestOpen(true);
  };

  const selectMethod = (m: CreationMethod) => {
    setMethod(m);
    setCustomStartMode("blank");
    setCustomBaseTemplateId(null);
    patchForm({
      creationSource: m,
      templateId: m === "template" ? form.templateId : null,
      sourceBrief: m === "ai" ? form.sourceBrief : "",
      graph: m === "custom" ? createDefaultFlowGraph() : form.graph,
    });
  };

  const selectType = (typeId: string) => {
    const t = typeMap.get(typeId);
    patchForm({
      agentType: typeId,
      defaultTools: t?.defaultTools ? [...t.defaultTools] : form.defaultTools,
    });
    if (
      method === "custom" &&
      customStartMode === "duplicate" &&
      customBaseTemplateId &&
      catalog?.templates.find((x) => x.id === customBaseTemplateId)?.typeId !== typeId
    ) {
      setCustomBaseTemplateId(null);
      patchForm({
        agentType: typeId,
        defaultTools: t?.defaultTools ? [...t.defaultTools] : form.defaultTools,
        graph: createDefaultFlowGraph(),
        title: "",
        description: "",
      });
    }
  };

  const selectTemplate = async (tpl: AgentStudioTemplateSummary) => {
    setLoadingTemplate(true);
    try {
      const full = await getAgentStudioTemplate(tpl.id);
      patchForm({
        templateId: full.id,
        agentType: full.typeId || form.agentType,
        title: form.title || full.name,
        description: form.description || full.summary,
        defaultTools: [...(full.defaultTools || [])],
        openaiVoice: full.suggestedVoice || form.openaiVoice,
        graph: cloneGraph(full.graph),
        creationSource: "template",
      });
      toast.success("Template brain loaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load template");
    } finally {
      setLoadingTemplate(false);
    }
  };

  const startCustomBlank = () => {
    setCustomStartMode("blank");
    setCustomBaseTemplateId(null);
    const t = form.agentType ? typeMap.get(form.agentType) : null;
    patchForm({
      creationSource: "custom",
      templateId: null,
      graph: createDefaultFlowGraph(),
      defaultTools: t?.defaultTools ? [...t.defaultTools] : form.defaultTools,
    });
  };

  const duplicateTemplateForCustom = async (tpl: AgentStudioTemplateSummary) => {
    setLoadingTemplate(true);
    try {
      const full = await getAgentStudioTemplate(tpl.id);
      const baseName = full.name.replace(/\s*\((custom|copy)\)\s*$/i, "").trim() || full.name;
      setCustomStartMode("duplicate");
      setCustomBaseTemplateId(full.id);
      patchForm({
        creationSource: "custom",
        templateId: null,
        agentType: full.typeId || form.agentType,
        title: form.title.trim() ? form.title : `${baseName} (custom)`,
        description: form.description.trim() ? form.description : full.summary || "",
        defaultTools: [...(full.defaultTools || [])],
        openaiVoice: full.suggestedVoice || form.openaiVoice,
        graph: cloneGraph(full.graph),
      });
      toast.success("Template duplicated — refine on the canvas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to duplicate template");
    } finally {
      setLoadingTemplate(false);
    }
  };

  const toggleAiCombineTemplate = (tpl: AgentStudioTemplateSummary) => {
    const on = form.aiCombineTemplateIds.includes(tpl.id);
    const nextIds = on
      ? form.aiCombineTemplateIds.filter((id) => id !== tpl.id)
      : form.aiCombineTemplateIds.length >= 8
        ? form.aiCombineTemplateIds
        : [...form.aiCombineTemplateIds, tpl.id];
    if (!on && form.aiCombineTemplateIds.length >= 8) {
      toast.error("You can combine up to 8 templates");
      return;
    }
    const nextNames = nextIds.map(
      (id) => catalog?.templates.find((t) => t.id === id)?.name || id
    );
    patchForm({
      aiCombineTemplateIds: nextIds,
      aiCombinedNames: nextNames,
    });
  };

  const runAiGenerate = async () => {
    if (!form.sourceBrief.trim()) {
      toast.error("Describe what this agent should do");
      return;
    }
    setGenerating(true);
    try {
      const draft = await generateAgentDraft({
        brief: form.sourceBrief.trim(),
        agentType: form.agentType || undefined,
        titleHint: form.title || undefined,
        mustHaveTools: form.aiMustHaveTools,
        tone: form.aiTone,
        languages: form.aiLanguages,
        combineTemplateIds: form.aiCombineTemplateIds,
      });
      const combinedIds = draft.combinedTemplateIds?.length
        ? draft.combinedTemplateIds
        : form.aiCombineTemplateIds;
      const combinedNames = combinedIds
        .map((id) => catalog?.templates.find((t) => t.id === id)?.name || id)
        .filter(Boolean);
      patchForm({
        title: draft.title || form.title,
        description: draft.description || form.description,
        agentType: draft.agentType || form.agentType,
        defaultTools: draft.defaultTools || form.defaultTools,
        openaiVoice: draft.openaiVoice || form.openaiVoice,
        templateId: draft.templateId,
        graph: cloneGraph(draft.graph),
        aiRationale: draft.rationale || "",
        aiCombineTemplateIds: combinedIds,
        aiCombinedNames: combinedNames,
        creationSource: "ai",
      });
      toast.success(
        combinedIds.length > 1
          ? `Combined ${combinedIds.length} templates into one agent brain`
          : "Draft generated"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Generate failed");
    } finally {
      setGenerating(false);
    }
  };

  const canContinue = (): boolean => {
    switch (currentStep) {
      case "method":
        return Boolean(method);
      case "type":
        return Boolean(form.agentType);
      case "source":
        if (method === "template") return Boolean(form.templateId) && hasUsableGraph(form.graph);
        if (method === "ai") return hasUsableGraph(form.graph) && Boolean(form.title || form.aiRationale);
        if (method === "custom" && customStartMode === "duplicate") {
          return Boolean(customBaseTemplateId) && hasUsableGraph(form.graph);
        }
        return true;
      case "identity":
        return Boolean(form.title.trim());
      case "brain":
        return hasUsableGraph(form.graph);
      case "knowledge":
      case "test":
      case "review":
        return true;
      default:
        return true;
    }
  };

  const goNext = () => {
    if (!canContinue()) {
      if (currentStep === "brain") toast.error("Open the conversation canvas and build a brain first");
      else if (currentStep === "source" && method === "template")
        toast.error("Select a template to continue");
      else if (currentStep === "source" && method === "custom" && customStartMode === "duplicate")
        toast.error("Pick a template to duplicate, or switch to blank canvas");
      else if (currentStep === "source" && method === "ai")
        toast.error("Generate a draft from your brief first");
      else if (currentStep === "identity") toast.error("Title is required");
      else toast.error("Complete this step to continue");
      return;
    }
    if (currentStep === "method" && method === "custom") {
      // After type step, custom skips template/AI content — still need type
    }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => setStepIndex((i) => Math.max(i - 1, 0));

  const buildPayload = (): AgentInput => ({
    title: form.title.trim(),
    description: form.description.trim(),
    status: form.status,
    agentType: form.agentType,
    creationSource: form.creationSource || (isEdit ? editing?.creationSource || "custom" : method),
    templateId: form.templateId,
    sourceBrief: form.sourceBrief,
    defaultTools: form.defaultTools,
    graph: form.graph,
    knowledgeIds: form.knowledgeIds,
    openaiVoice: form.openaiVoice,
  });

  const onSave = async () => {
    if (!form.title.trim()) {
      toast.error("Title is required");
      return;
    }
    if (!hasUsableGraph(form.graph)) {
      toast.error("Conversation brain is required");
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editing) {
        await updateAgent(editing.id, payload);
        toast.success("Agent updated");
      } else {
        await createAgent(payload);
        toast.success("Agent published");
      }
      setStudioOpen(false);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteAgent(confirmDelete.id);
      toast.success("Agent deleted");
      setConfirmDelete(null);
      void refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const draftForTest = (): Partial<AgentInput> & { title?: string } => ({
    title: form.title || "Untitled agent",
    description: form.description,
    openaiVoice: form.openaiVoice,
    knowledgeIds: form.knowledgeIds,
    graph: form.graph,
    agentType: form.agentType,
    defaultTools: form.defaultTools,
    status: form.status,
  });

  const columns: Column<Agent>[] = [
    {
      key: "agent",
      header: "Agent",
      searchable: (r) =>
        `${r.title} ${r.description} ${r.agentType || ""} ${r.creationSource || ""}`,
      render: (r) => {
        const type = r.agentType ? typeMap.get(r.agentType) : null;
        return (
          <div className="flex items-center gap-3 min-w-[220px]">
            <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-primary/15 to-sky-500/10 flex items-center justify-center ring-1 ring-border/60 shrink-0">
              <Bot className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="font-medium truncate leading-tight">{r.title}</div>
              <div className="text-xs text-muted-foreground truncate mt-0.5 max-w-[280px]">
                {r.description || "No description"}
              </div>
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {type ? (
                  <Badge
                    variant="outline"
                    className="text-[10px]"
                    style={
                      type.color
                        ? {
                            borderColor: `${type.color}55`,
                            color: type.color,
                            background: `${type.color}12`,
                          }
                        : undefined
                    }
                  >
                    {type.name}
                  </Badge>
                ) : r.agentType ? (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {r.agentType}
                  </Badge>
                ) : null}
                {r.creationSource ? (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    {SOURCE_LABEL[r.creationSource] || r.creationSource}
                  </Badge>
                ) : null}
              </div>
            </div>
          </div>
        );
      },
    },
    {
      key: "brain",
      header: "Structure",
      searchable: (r) => String(r.nodeCount ?? ""),
      render: (r) => {
        const nodes = r.nodeCount ?? graphNodeCount(r.graph);
        return (
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-primary border-primary/30 bg-primary/10 tabular-nums"
            >
              {nodes} nodes
            </Badge>
          </div>
        );
      },
    },
    {
      key: "voice",
      header: "Voice",
      searchable: (r) => r.openaiVoice,
      render: (r) => (
        <span className="text-sm text-muted-foreground capitalize">{r.openaiVoice || "—"}</span>
      ),
    },
    {
      key: "working",
      header: "Working time",
      searchable: (r) => formatWorkingTime(r.workingTime?.totalSeconds),
      render: (r) => (
        <span className="text-sm tabular-nums text-muted-foreground">
          {formatWorkingTime(r.workingTime?.totalSeconds)}
        </span>
      ),
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
      header: "Actions",
      className: "w-36 text-right",
      searchable: () => "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="Test agent"
            onClick={() => openTest(r)}
          >
            <FlaskConical className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Delete agent"
            className="text-destructive"
            onClick={() => setConfirmDelete(r)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="View agent details"
            onClick={() => void openEdit(r)}
          >
            <Eye className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const sourceStepLabel =
    method === "ai" ? "AI brief" : method === "custom" ? "Custom" : "Template";

  const stepLabels = steps.map((s) =>
    s.id === "source" ? { ...s, label: sourceStepLabel } : s
  );

  return (
    <div className="admin-page">
      <PageHeader
        title="Agents"
        description="Each agent owns one conversation brain. Assign agents to clinics for webchat, inbound, and campaigns."
        accent={1}
        actions={
          <Button className="bg-gradient-primary text-primary-foreground" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1.5" /> Create agent
          </Button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          index={0}
          icon={Bot}
          label="Total agents"
          value={loading ? "—" : stats.total}
          hint="In this view"
          color="#0ea5e9"
        />
        <StatCard
          index={1}
          icon={Check}
          label="Active"
          value={loading ? "—" : stats.active}
          hint="Ready for clinics"
          color="#10b981"
        />
        <StatCard
          index={2}
          icon={Clock}
          label="Working time"
          value={loading ? "—" : formatWorkingTime(stats.workingSeconds)}
          hint="Inbound + campaign talk time"
          color="#0d9488"
        />
        <StatCard
          index={3}
          icon={Layers}
          label="Templates"
          value={loading ? "—" : stats.templates}
          hint="Available in catalog"
          color="#8b5cf6"
        />
      </div>

      <DataTable
        columns={columns}
        data={data}
        rowKey={(r) => r.id}
        searchPlaceholder="Search agents…"
        emptyMessage="No agents yet — create one from a template, blank canvas, or AI brief"
      />

      {/* Studio wizard — stay mounted while canvas is open (hidden) so outside-click dismiss works */}
      <Dialog
        open={studioOpen}
        onOpenChange={(open) => {
          // Only intentional dismiss (X / Cancel / Escape) — never backdrop click.
          if (!open) {
            if (canvasOpen) return;
            setStudioOpen(false);
          }
        }}
      >
        <DialogContent
          className={cn(
            "flex flex-col p-0 gap-0 overflow-hidden rounded-2xl !max-w-none",
            "transition-[width,height,max-width] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[width,height]",
            canvasOpen && "invisible pointer-events-none"
          )}
          style={
            {
              width: `min(${studioLayout.width}px, 96vw)`,
              maxWidth: `min(${studioLayout.width}px, 96vw)`,
              height: `min(${studioLayout.height}px, 94vh)`,
            } as CSSProperties
          }
          overlayClassName={cn(canvasOpen && "invisible pointer-events-none")}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => {
            if (canvasOpen) e.preventDefault();
          }}
        >
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/70 shrink-0 bg-gradient-to-r from-primary/[0.04] via-transparent to-sky-500/[0.03]">
            <DialogTitle className="text-xl tracking-tight">
              {isEdit ? `Edit · ${editing?.title}` : "Agent Studio"}
            </DialogTitle>
            <DialogDescription>
              {isEdit
                ? "Update identity, brain, knowledge, then save."
                : "Build a clinic agent from a template, blank canvas, or AI brief."}
            </DialogDescription>
            <StudioStepper
              steps={stepLabels}
              currentIndex={stepIndex}
              allowJump={isEdit}
              onStepClick={(i) => {
                if (i <= stepIndex || isEdit) setStepIndex(i);
              }}
            />
          </DialogHeader>

          <ScrollArea className="flex-1 min-h-0">
            <div className="px-6 py-5">
              <AnimatePresence mode="wait">
                <motion.div
                  key={`${currentStep}-${method || "none"}-${customStartMode}`}
                  initial={{ opacity: 0, x: 14, filter: "blur(2px)" }}
                  animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, x: -10, filter: "blur(2px)" }}
                  transition={{ duration: 0.28, ease: pageEase }}
                >
                  {/* 1 Method */}
                  {currentStep === "method" ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-display text-lg font-semibold">How do you want to start?</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Pick a path — you can refine the brain later on the canvas.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {(
                          [
                            {
                              id: "template" as const,
                              title: "From template",
                              desc: "Start from a proven outpatient conversation pattern.",
                              icon: LayoutTemplate,
                            },
                            {
                              id: "custom" as const,
                              title: "Custom",
                              desc: "Blank canvas, or duplicate an existing template and refine it.",
                              icon: FilePlus2,
                            },
                            {
                              id: "ai" as const,
                              title: "Build with AI",
                              desc: "Describe the job and optionally combine multiple templates into one brain.",
                              icon: Wand2,
                            },
                          ] as const
                        ).map((card) => {
                          const Icon = card.icon;
                          const selected = method === card.id;
                          return (
                            <button
                              key={card.id}
                              type="button"
                              onClick={() => selectMethod(card.id)}
                              className={cn(
                                "text-left rounded-2xl border p-5 transition-all shadow-soft hover:shadow-lift",
                                selected
                                  ? "border-primary bg-primary/5 ring-2 ring-primary/30"
                                  : "border-border/80 bg-card hover:border-primary/30"
                              )}
                            >
                              <div
                                className={cn(
                                  "h-11 w-11 rounded-xl flex items-center justify-center mb-3",
                                  selected
                                    ? "bg-gradient-primary text-primary-foreground"
                                    : "bg-muted text-muted-foreground"
                                )}
                              >
                                <Icon className="h-5 w-5" />
                              </div>
                              <div className="font-medium">{card.title}</div>
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                {card.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* 2 Type */}
                  {currentStep === "type" ? (
                    <div className="space-y-4">
                      <div>
                        <h3 className="font-display text-lg font-semibold">Choose an agent type</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Types set default tools and guide template / AI suggestions.
                        </p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(catalog?.types || []).map((t) => {
                          const selected = form.agentType === t.id;
                          const expanded = expandedTypeId === t.id;
                          return (
                            <div
                              key={t.id}
                              className={cn(
                                "rounded-2xl border p-4 transition-all",
                                selected
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                                  : "border-border/80 bg-card"
                              )}
                            >
                              <button
                                type="button"
                                className="w-full text-left"
                                onClick={() => selectType(t.id)}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span
                                      className="h-2.5 w-2.5 rounded-full shrink-0"
                                      style={{ background: t.color || "hsl(var(--primary))" }}
                                    />
                                    <span className="font-medium truncate">{t.name}</span>
                                  </div>
                                  <ComplexityDots value={t.complexity} />
                                </div>
                                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                                  {t.shortDescription}
                                </p>
                              </button>
                              <button
                                type="button"
                                className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary"
                                onClick={() =>
                                  setExpandedTypeId(expanded ? null : t.id)
                                }
                              >
                                {expanded ? "Hide details" : "More"}
                                <ChevronDown
                                  className={cn("h-3 w-3 transition-transform", expanded && "rotate-180")}
                                />
                              </button>
                              {expanded ? (
                                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed border-t border-border/50 pt-2">
                                  {t.longDescription}
                                </p>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  {/* 3 Template / AI / Custom */}
                  {currentStep === "source" ? (
                    <div className="space-y-4">
                      {method === "template" ? (
                        <>
                          <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
                            <div>
                              <h3 className="font-display text-lg font-semibold">Pick a template</h3>
                              <p className="text-sm text-muted-foreground mt-1">
                                Selecting a card loads its full conversation graph.
                              </p>
                            </div>
                            <Input
                              className="sm:max-w-xs"
                              placeholder="Filter by name or tag…"
                              value={templateQuery}
                              onChange={(e) => setTemplateQuery(e.target.value)}
                            />
                          </div>
                          {loadingTemplate ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                              <Loader2 className="h-4 w-4 animate-spin" /> Loading template brain…
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {filteredTemplates.map((tpl) => {
                                const selected = form.templateId === tpl.id;
                                const expanded = expandedTemplateId === tpl.id;
                                return (
                                  <div
                                    key={tpl.id}
                                    className={cn(
                                      "rounded-2xl border p-4 transition-all",
                                      selected
                                        ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                                        : "border-border/80 bg-card"
                                    )}
                                  >
                                    <button
                                      type="button"
                                      className="w-full text-left"
                                      onClick={() => void selectTemplate(tpl)}
                                    >
                                      <div className="font-medium">{tpl.name}</div>
                                      <p className="text-xs text-muted-foreground mt-1.5">
                                        {tpl.summary}
                                      </p>
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {tpl.tags.slice(0, 4).map((tag) => (
                                          <Badge key={tag} variant="outline" className="text-[10px]">
                                            {tag}
                                          </Badge>
                                        ))}
                                      </div>
                                      <div className="flex flex-wrap gap-1 mt-2">
                                        {tpl.defaultTools.slice(0, 4).map((tool) => (
                                          <Badge key={tool} variant="secondary" className="text-[10px]">
                                            {tool.replace(/_/g, " ")}
                                          </Badge>
                                        ))}
                                      </div>
                                    </button>
                                    <button
                                      type="button"
                                      className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary"
                                      onClick={() =>
                                        setExpandedTemplateId(expanded ? null : tpl.id)
                                      }
                                    >
                                      {expanded ? "Hide details" : "Full description"}
                                      <ChevronDown
                                        className={cn(
                                          "h-3 w-3 transition-transform",
                                          expanded && "rotate-180"
                                        )}
                                      />
                                    </button>
                                    {expanded ? (
                                      <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed border-t border-border/50 pt-2">
                                        {tpl.description}
                                      </p>
                                    ) : null}
                                  </div>
                                );
                              })}
                              {!filteredTemplates.length ? (
                                <p className="text-sm text-muted-foreground col-span-full py-8 text-center">
                                  No templates match this filter.
                                </p>
                              ) : null}
                            </div>
                          )}
                        </>
                      ) : null}

                      {method === "ai" ? (
                        <div className="space-y-4 max-w-3xl">
                          <div>
                            <h3 className="font-display text-lg font-semibold">Build with AI</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Describe the agent. If you ask to combine templates — or the brief
                              clearly needs multiple jobs (triage + booking + refills, etc.) — AI
                              will automatically merge matching templates into one brain
                              {form.agentType
                                ? ` · preferred type: ${typeMap.get(form.agentType)?.name || form.agentType}`
                                : ""}
                              .
                            </p>
                          </div>
                          <Field label="Brief">
                            <Textarea
                              rows={5}
                              placeholder="e.g. After-hours pediatric agent that triages fever calls, books next-day sick visits, and routes prescription refill questions…"
                              value={form.sourceBrief}
                              onChange={(e) => patchForm({ sourceBrief: e.target.value })}
                            />
                          </Field>

                          <div className="rounded-2xl border border-border/70 bg-muted/15 p-4 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div>
                                <div className="font-medium text-sm flex items-center gap-2">
                                  <Layers className="h-4 w-4 text-primary" />
                                  Combine templates
                                  {form.aiCombineTemplateIds.length ? (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] border-primary/30 text-primary"
                                    >
                                      {form.aiCombineTemplateIds.length} selected
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                                  Optional manual picks (up to 8). Leave empty and AI still
                                  auto-combines when your brief asks for it or spans multiple
                                  patient-care capabilities.
                                </p>
                              </div>
                              <div className="flex flex-col gap-2 sm:items-end shrink-0">
                                <label className="inline-flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                                  <Checkbox
                                    checked={aiCombineAllTypes}
                                    onCheckedChange={(v) => setAiCombineAllTypes(v === true)}
                                  />
                                  All agent types
                                </label>
                                <Input
                                  className="sm:w-52 h-8 text-xs"
                                  placeholder="Filter templates…"
                                  value={aiCombineQuery}
                                  onChange={(e) => setAiCombineQuery(e.target.value)}
                                />
                              </div>
                            </div>

                            {form.aiCombineTemplateIds.length ? (
                              <div className="flex flex-wrap gap-1.5">
                                {form.aiCombineTemplateIds.map((id) => {
                                  const tpl = catalog?.templates.find((t) => t.id === id);
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      onClick={() => tpl && toggleAiCombineTemplate(tpl)}
                                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] text-primary hover:bg-primary/15"
                                      title="Click to remove"
                                    >
                                      {tpl?.name || id}
                                      <span className="opacity-60">×</span>
                                    </button>
                                  );
                                })}
                                <button
                                  type="button"
                                  className="text-[11px] text-muted-foreground underline-offset-2 hover:underline px-1"
                                  onClick={() =>
                                    patchForm({
                                      aiCombineTemplateIds: [],
                                      aiCombinedNames: [],
                                    })
                                  }
                                >
                                  Clear all
                                </button>
                              </div>
                            ) : null}

                            <div className="max-h-56 overflow-y-auto rounded-xl border border-border/60 divide-y divide-border/50 bg-card">
                              {aiCombineTemplates.slice(0, 60).map((tpl) => {
                                const on = form.aiCombineTemplateIds.includes(tpl.id);
                                const typeName = typeMap.get(tpl.typeId)?.name || tpl.typeId;
                                return (
                                  <label
                                    key={tpl.id}
                                    className={cn(
                                      "flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/40",
                                      on && "bg-primary/5"
                                    )}
                                  >
                                    <Checkbox
                                      className="mt-0.5"
                                      checked={on}
                                      onCheckedChange={() => toggleAiCombineTemplate(tpl)}
                                    />
                                    <span className="min-w-0 flex-1">
                                      <span className="font-medium text-sm block truncate">
                                        {tpl.name}
                                      </span>
                                      <span className="text-[11px] text-muted-foreground line-clamp-1">
                                        {typeName}
                                        {tpl.summary ? ` · ${tpl.summary}` : ""}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                              {!aiCombineTemplates.length ? (
                                <p className="text-xs text-muted-foreground px-3 py-6 text-center">
                                  No templates match this filter.
                                </p>
                              ) : null}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Field label="Tone">
                              <Input
                                value={form.aiTone}
                                onChange={(e) => patchForm({ aiTone: e.target.value })}
                                placeholder="warm professional"
                              />
                            </Field>
                            <Field label="Languages">
                              <div className="flex flex-wrap gap-2 pt-1">
                                {AI_LANGUAGES.map((lang) => {
                                  const on = form.aiLanguages.includes(lang);
                                  return (
                                    <button
                                      key={lang}
                                      type="button"
                                      onClick={() =>
                                        patchForm({
                                          aiLanguages: on
                                            ? form.aiLanguages.filter((l) => l !== lang)
                                            : [...form.aiLanguages, lang],
                                        })
                                      }
                                      className={cn(
                                        "rounded-full border px-2.5 py-1 text-xs",
                                        on
                                          ? "border-primary bg-primary/10 text-primary"
                                          : "border-border text-muted-foreground"
                                      )}
                                    >
                                      {lang}
                                    </button>
                                  );
                                })}
                              </div>
                            </Field>
                          </div>
                          <Field label="Must-have tools" hint="Selected tools are forced into the draft.">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto rounded-xl border border-border/60 p-3">
                              {FLOW_SUBAGENT_TOOLS.map((tool) => {
                                const on = form.aiMustHaveTools.includes(tool.id);
                                return (
                                  <label
                                    key={tool.id}
                                    className="flex items-start gap-2 text-sm cursor-pointer"
                                  >
                                    <Checkbox
                                      checked={on}
                                      onCheckedChange={() =>
                                        patchForm({
                                          aiMustHaveTools: on
                                            ? form.aiMustHaveTools.filter((id) => id !== tool.id)
                                            : [...form.aiMustHaveTools, tool.id],
                                        })
                                      }
                                    />
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
                          </Field>
                          <Button
                            type="button"
                            className="bg-gradient-primary text-primary-foreground"
                            disabled={generating || !form.sourceBrief.trim()}
                            onClick={() => void runAiGenerate()}
                          >
                            {generating ? (
                              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4 mr-1.5" />
                            )}
                            {generating
                              ? "Generating…"
                              : form.aiCombineTemplateIds.length > 1
                                ? `Generate from ${form.aiCombineTemplateIds.length} templates`
                                : "Generate draft"}
                          </Button>

                          <AnimatePresence>
                            {generating ? (
                              <AiGeneratingPanel
                                active={generating}
                                combining={
                                  form.aiCombineTemplateIds.length > 1 ||
                                  /\b(combin|merge|and also|as well as)\b/i.test(
                                    form.sourceBrief
                                  )
                                }
                              />
                            ) : null}
                          </AnimatePresence>

                          {form.aiRationale && !generating ? (
                            <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 space-y-2">
                              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                Rationale
                              </div>
                              <p className="text-sm leading-relaxed">{form.aiRationale}</p>
                              {form.aiCombinedNames.length > 1 ? (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {form.aiCombinedNames.map((name) => (
                                    <Badge key={name} variant="secondary" className="text-[10px]">
                                      {name}
                                    </Badge>
                                  ))}
                                </div>
                              ) : null}
                              <div className="text-xs text-muted-foreground">
                                Preview: {form.title || "—"} · {graphNodeCount(form.graph)} nodes ·{" "}
                                {form.defaultTools.length} tools
                              </div>
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {method === "custom" ? (
                        <div className="space-y-4">
                          <div>
                            <h3 className="font-display text-lg font-semibold">Custom brain</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Start blank or duplicate an existing template so you can build a better,
                              more advanced version.
                            </p>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-2xl">
                            <button
                              type="button"
                              onClick={startCustomBlank}
                              className={cn(
                                "text-left rounded-2xl border p-4 transition-all",
                                customStartMode === "blank"
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                                  : "border-border/80 bg-card hover:border-primary/30"
                              )}
                            >
                              <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-2">
                                <FilePlus2 className="h-5 w-5" />
                              </div>
                              <div className="font-medium">Blank canvas</div>
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                Start and End nodes only — design every step yourself.
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setCustomStartMode("duplicate");
                                if (!customBaseTemplateId) {
                                  patchForm({ creationSource: "custom", templateId: null });
                                }
                              }}
                              className={cn(
                                "text-left rounded-2xl border p-4 transition-all",
                                customStartMode === "duplicate"
                                  ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                                  : "border-border/80 bg-card hover:border-primary/30"
                              )}
                            >
                              <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center mb-2">
                                <Copy className="h-5 w-5" />
                              </div>
                              <div className="font-medium">Duplicate template</div>
                              <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                                Copy a catalog brain, then refine it into your custom agent.
                              </p>
                            </button>
                          </div>

                          {customStartMode === "blank" ? (
                            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-6 max-w-xl">
                              <p className="text-sm text-muted-foreground leading-relaxed">
                                Continue to Identity, then open the conversation canvas to design the
                                brain from scratch.
                              </p>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
                                <p className="text-sm text-muted-foreground">
                                  Templates for{" "}
                                  <span className="text-foreground font-medium">
                                    {typeMap.get(form.agentType || "")?.name ||
                                      form.agentType ||
                                      "this type"}
                                  </span>
                                </p>
                                <Input
                                  className="sm:max-w-xs"
                                  placeholder="Filter by name or tag…"
                                  value={templateQuery}
                                  onChange={(e) => setTemplateQuery(e.target.value)}
                                />
                              </div>
                              {loadingTemplate ? (
                                <div className="flex items-center gap-2 text-sm text-muted-foreground py-8 justify-center">
                                  <Loader2 className="h-4 w-4 animate-spin" /> Loading template brain…
                                </div>
                              ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                  {filteredTemplates.map((tpl) => {
                                    const selected = customBaseTemplateId === tpl.id;
                                    const expanded = expandedTemplateId === tpl.id;
                                    return (
                                      <div
                                        key={tpl.id}
                                        className={cn(
                                          "rounded-2xl border p-4 transition-all",
                                          selected
                                            ? "border-primary bg-primary/5 ring-1 ring-primary/25"
                                            : "border-border/80 bg-card"
                                        )}
                                      >
                                        <button
                                          type="button"
                                          className="w-full text-left"
                                          onClick={() => void duplicateTemplateForCustom(tpl)}
                                        >
                                          <div className="font-medium flex items-center gap-2">
                                            {tpl.name}
                                            {selected ? (
                                              <Badge
                                                variant="outline"
                                                className="text-[10px] border-primary/30 text-primary"
                                              >
                                                Selected
                                              </Badge>
                                            ) : null}
                                          </div>
                                          <p className="text-xs text-muted-foreground mt-1.5">
                                            {tpl.summary}
                                          </p>
                                          <div className="flex flex-wrap gap-1 mt-2">
                                            {tpl.tags.slice(0, 4).map((tag) => (
                                              <Badge
                                                key={tag}
                                                variant="outline"
                                                className="text-[10px]"
                                              >
                                                {tag}
                                              </Badge>
                                            ))}
                                          </div>
                                        </button>
                                        <button
                                          type="button"
                                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-primary"
                                          onClick={() =>
                                            setExpandedTemplateId(expanded ? null : tpl.id)
                                          }
                                        >
                                          {expanded ? "Hide details" : "Full description"}
                                          <ChevronDown
                                            className={cn(
                                              "h-3 w-3 transition-transform",
                                              expanded && "rotate-180"
                                            )}
                                          />
                                        </button>
                                        {expanded ? (
                                          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed border-t border-border/50 pt-2">
                                            {tpl.description}
                                          </p>
                                        ) : null}
                                      </div>
                                    );
                                  })}
                                  {!filteredTemplates.length ? (
                                    <p className="text-sm text-muted-foreground col-span-full py-8 text-center">
                                      No templates match this filter.
                                    </p>
                                  ) : null}
                                </div>
                              )}
                              {customBaseTemplateId ? (
                                <p className="text-xs text-muted-foreground">
                                  Copied {graphNodeCount(form.graph)} nodes. Source stays{" "}
                                  <span className="font-medium text-foreground">Custom</span> — edit
                                  freely on the canvas.
                                </p>
                              ) : null}
                            </>
                          )}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* 4 Identity */}
                  {currentStep === "identity" ? (
                    <div className="space-y-4 max-w-xl">
                      <div>
                        <h3 className="font-display text-lg font-semibold">Identity</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Name, description, status, and speaking voice.
                        </p>
                      </div>
                      <Field label="Title">
                        <Input
                          value={form.title}
                          onChange={(e) => patchForm({ title: e.target.value })}
                          placeholder="e.g. Front desk assistant"
                        />
                      </Field>
                      <Field label="Description">
                        <Textarea
                          rows={4}
                          value={form.description}
                          onChange={(e) => patchForm({ description: e.target.value })}
                          placeholder="What this agent owns for the clinic…"
                        />
                      </Field>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Status">
                          <Select
                            value={form.status}
                            onValueChange={(v) =>
                              patchForm({ status: v as "active" | "inactive" })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </Field>
                        <Field label="Voice">
                          <Select
                            value={form.openaiVoice || undefined}
                            onValueChange={(v) => patchForm({ openaiVoice: v })}
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
                        </Field>
                      </div>
                      {form.agentType ? (
                        <p className="text-xs text-muted-foreground">
                          Type:{" "}
                          <span className="font-medium text-foreground">
                            {typeMap.get(form.agentType)?.name || form.agentType}
                          </span>
                          {form.creationSource ? (
                            <>
                              {" "}
                              · Source:{" "}
                              <span className="font-medium text-foreground">
                                {SOURCE_LABEL[form.creationSource] || form.creationSource}
                              </span>
                            </>
                          ) : null}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* 5 Brain */}
                  {currentStep === "brain" ? (
                    <div className="space-y-4 max-w-xl">
                      <div>
                        <h3 className="font-display text-lg font-semibold">Conversation brain</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Each agent owns one flow graph. Open the canvas to edit nodes and tools.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-soft space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-xl bg-primary/15 text-primary flex items-center justify-center">
                            <Brain className="h-6 w-6" />
                          </div>
                          <div>
                            <div className="font-medium">
                              {graphNodeCount(form.graph)} nodes · {form.graph.edges?.length || 0}{" "}
                              edges
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {hasUsableGraph(form.graph)
                                ? "Brain ready — refine anytime before publish."
                                : "Add conversation steps before publishing."}
                            </p>
                          </div>
                        </div>
                        <Button
                          type="button"
                          className="bg-gradient-primary text-primary-foreground"
                          onClick={() => setCanvasOpen(true)}
                        >
                          <Brain className="h-4 w-4 mr-1.5" /> Open conversation canvas
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {/* 6 Knowledge */}
                  {currentStep === "knowledge" ? (
                    <div className="space-y-4 max-w-2xl">
                      <div>
                        <h3 className="font-display text-lg font-semibold">Knowledge</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Attach clinic knowledge snippets this agent can ground on.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/70 max-h-80 overflow-y-auto divide-y divide-border/50">
                        {knowledgeOptions.length ? (
                          knowledgeOptions.map((k) => {
                            const on = form.knowledgeIds.includes(k.id);
                            return (
                              <label
                                key={k.id}
                                className="flex items-start gap-3 p-3 cursor-pointer hover:bg-muted/30"
                              >
                                <Checkbox
                                  checked={on}
                                  onCheckedChange={() =>
                                    patchForm({
                                      knowledgeIds: on
                                        ? form.knowledgeIds.filter((id) => id !== k.id)
                                        : [...form.knowledgeIds, k.id],
                                    })
                                  }
                                  className="mt-0.5"
                                />
                                <span className="min-w-0">
                                  <span className="text-sm font-medium block truncate">
                                    {k.promptKey || k.knowledge?.slice(0, 48) || k.id}
                                  </span>
                                  <span className="text-xs text-muted-foreground line-clamp-2">
                                    {k.knowledge}
                                  </span>
                                </span>
                              </label>
                            );
                          })
                        ) : (
                          <p className="text-sm text-muted-foreground p-6 text-center">
                            No knowledge items yet. You can publish without any and attach later.
                          </p>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {form.knowledgeIds.length} selected
                      </p>
                    </div>
                  ) : null}

                  {/* 7 Test */}
                  {currentStep === "test" ? (
                    <div className="space-y-4 max-w-xl">
                      <div>
                        <h3 className="font-display text-lg font-semibold">Test lab</h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Try the current draft across webchat, inbound, or campaign channels.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/80 bg-muted/20 p-6 space-y-3">
                        <p className="text-sm text-muted-foreground">
                          Opens Agent Test Lab with this draft&apos;s graph, voice, and knowledge —
                          no need to publish first.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            openTest(editing || undefined, draftForTest())
                          }
                        >
                          <FlaskConical className="h-4 w-4 mr-1.5" /> Open test lab
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {/* 8 Review */}
                  {currentStep === "review" ? (
                    <div className="space-y-4 max-w-xl">
                      <div>
                        <h3 className="font-display text-lg font-semibold">
                          {isEdit ? "Review & save" : "Review & publish"}
                        </h3>
                        <p className="text-sm text-muted-foreground mt-1">
                          Confirm details, then save this agent.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border/80 divide-y divide-border/60 overflow-hidden">
                        {(
                          [
                            ["Title", form.title || "—"],
                            [
                              "Type",
                              typeMap.get(form.agentType || "")?.name || form.agentType || "—",
                            ],
                            [
                              "Source",
                              SOURCE_LABEL[form.creationSource || ""] || form.creationSource || "—",
                            ],
                            ["Voice", form.openaiVoice || "—"],
                            ["Status", form.status],
                            ["Brain", `${graphNodeCount(form.graph)} nodes`],
                            ["Knowledge", `${form.knowledgeIds.length} items`],
                            ["Tools", form.defaultTools.length ? form.defaultTools.join(", ") : "—"],
                            ...(form.aiCombinedNames.length > 1
                              ? ([
                                  [
                                    "Combined",
                                    form.aiCombinedNames.join(" · "),
                                  ],
                                ] as const)
                              : []),
                          ] as const
                        ).map(([k, v]) => (
                          <div key={k} className="flex gap-4 px-4 py-3 text-sm">
                            <span className="w-28 shrink-0 text-muted-foreground">{k}</span>
                            <span className="min-w-0 break-words">{v}</span>
                          </div>
                        ))}
                      </div>
                      {form.description ? (
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {form.description}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>
          </ScrollArea>

          <DialogFooter className="px-6 py-4 border-t border-border/60 shrink-0 flex-row justify-between sm:justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => (stepIndex === 0 ? setStudioOpen(false) : goBack())}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {stepIndex === 0 ? "Cancel" : "Back"}
            </Button>
            <div className="flex gap-2">
              {currentStep === "review" ? (
                <Button
                  type="button"
                  className="bg-gradient-primary text-primary-foreground"
                  disabled={saving}
                  onClick={() => void onSave()}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  {isEdit ? "Save agent" : "Publish agent"}
                </Button>
              ) : (
                <Button
                  type="button"
                  className="bg-gradient-primary text-primary-foreground"
                  onClick={goNext}
                >
                  Continue <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FlowBuilderModal
        open={canvasOpen}
        readOnly={false}
        title="Agent conversation brain"
        name={form.title || "Untitled agent"}
        description={form.description}
        knowledgeItems={knowledgeOptions as KnowledgeItem[]}
        graph={form.graph}
        onNameChange={(v) => patchForm({ title: v })}
        onDescriptionChange={(v) => patchForm({ description: v })}
        onGraphChange={(g) => patchForm({ graph: g })}
        onClose={() => setCanvasOpen(false)}
        onSave={() => {
          setCanvasOpen(false);
          toast.success("Brain updated");
        }}
      />

      <AgentTestLab
        open={testOpen}
        onOpenChange={setTestOpen}
        agentId={testTarget?.agentId}
        agentTitle={testTarget?.title}
        draft={testTarget?.draft}
        scenarios={DEFAULT_TEST_SCENARIOS}
      />

      <AlertDialog
        open={Boolean(confirmDelete)}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes <strong>{confirmDelete?.title}</strong> and its linked brain
              association. Clinics using this agent will need a new assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void onDelete()}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
