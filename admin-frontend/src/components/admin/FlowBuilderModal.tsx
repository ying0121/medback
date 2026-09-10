import { useEffect, useMemo, useRef, useState, type MouseEvent, type WheelEvent } from "react";
import {
  X,
  Plus,
  MessageSquare,
  HelpCircle,
  Play,
  Square,
  Trash2,
  Save,
  Link2,
  Search,
  BookOpen,
  Building2,
  Check,
  Bot,
  GitFork,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  Dialog,
  DialogDescription,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type {
  Clinic,
  FlowEdge,
  FlowGraph,
  FlowNode,
  FlowNodeType,
  KnowledgeItem,
  FlowSubagentTool,
} from "@/lib/api";
import { FLOW_SUBAGENT_TOOLS } from "@/lib/api";

type Props = {
  open: boolean;
  title: string;
  name: string;
  description: string;
  clinicIds: string[];
  clinics: Clinic[];
  knowledgeItems: KnowledgeItem[];
  graph: FlowGraph;
  saving?: boolean;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onClinicIdsChange: (ids: string[]) => void;
  onGraphChange: (g: FlowGraph) => void;
  onClose: () => void;
  onSave: () => void;
};

type ToolPickerMode = "add" | "change";

const NODE_W = 220;

type SourcePort = { handleId: string | null; label?: string; index: number; total: number };

type ConnectDrag = {
  sourceId: string;
  sourceHandle: string | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

function uid(prefix: string) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function nodeCardHeight(node: FlowNode) {
  const extras =
    (node.type === "question" ? node.data.options?.length || 0 : 0) +
    (node.type === "branch" ? node.data.branches?.length || 0 : 0) +
    (node.type === "subagent" && node.data.toolName ? 1 : 0) +
    (node.data.knowledgeIds?.length && node.type !== "subagent" ? 1 : 0);
  return 78 + Math.min(extras, 4) * 18;
}

function getSourcePorts(node: FlowNode): SourcePort[] {
  if (node.type === "end") return [];
  if (node.type === "question") {
    const opts = node.data.options || [];
    if (!opts.length) return [{ handleId: null, index: 0, total: 1 }];
    return opts.map((o, i) => ({
      handleId: o.id,
      label: o.label,
      index: i,
      total: opts.length,
    }));
  }
  if (node.type === "branch") {
    const branches = node.data.branches || [];
    if (!branches.length) return [{ handleId: null, index: 0, total: 1 }];
    return branches.map((b, i) => ({
      handleId: b.id,
      label: b.label,
      index: i,
      total: branches.length,
    }));
  }
  return [{ handleId: null, index: 0, total: 1 }];
}

function portX(nodeX: number, index: number, total: number) {
  if (total <= 1) return nodeX + NODE_W / 2;
  const pad = 32;
  const span = NODE_W - pad * 2;
  return nodeX + pad + (span * (index + 0.5)) / total;
}

function edgeControlPull(x1: number, y1: number, x2: number, y2: number) {
  const dy = Math.abs(y2 - y1);
  const dx = Math.abs(x2 - x1);
  // Strong vertical pull for a readable S-curve; extra offset when nodes are close
  return Math.max(48, Math.min(160, dy * 0.55 + dx * 0.15));
}

/** Smooth cubic Bezier from source port → target port */
function edgePath(x1: number, y1: number, x2: number, y2: number) {
  const pull = edgeControlPull(x1, y1, x2, y2);
  const c1y = y1 + pull;
  const c2y = y2 - pull;
  return `M ${x1} ${y1} C ${x1} ${c1y}, ${x2} ${c2y}, ${x2} ${y2}`;
}

function edgeLabelPoint(x1: number, y1: number, x2: number, y2: number) {
  // Approximate Bezier midpoint (t = 0.5)
  const pull = edgeControlPull(x1, y1, x2, y2);
  const c1y = y1 + pull;
  const c2y = y2 - pull;
  const t = 0.5;
  const mt = 1 - t;
  const x =
    mt * mt * mt * x1 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x2;
  const y =
    mt * mt * mt * y1 + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * y2;
  return { x, y };
}

/** Arrowhead at Bezier end, oriented along the curve tangent at t=1 */
function edgeArrowPoints(x1: number, y1: number, x2: number, y2: number, size = 10) {
  const pull = edgeControlPull(x1, y1, x2, y2);
  const c2y = y2 - pull;
  // Cubic Bezier derivative at t=1: 3*(P3 - P2)
  let tx = 0;
  let ty = y2 - c2y;
  const len = Math.hypot(tx, ty) || 1;
  tx /= len;
  ty /= len;
  const px = -ty;
  const py = tx;
  const half = size * 0.55;
  const baseX = x2 - tx * size;
  const baseY = y2 - ty * size;
  return `${x2},${y2} ${baseX + px * half},${baseY + py * half} ${baseX - px * half},${baseY - py * half}`;
}

function clinicSelectionSummary(ids: string[], clinics: Clinic[], map: Record<string, Clinic>) {
  if (!ids.length) return { title: "No clinics selected", detail: "Pick clinics from the list" };
  if (clinics.length > 0 && ids.length >= clinics.length) {
    return { title: "All clinics", detail: `${ids.length} selected` };
  }
  const names = ids.map((id) => map[id]?.name || id).filter(Boolean);
  if (names.length === 1) return { title: names[0], detail: "1 clinic" };
  if (names.length === 2) return { title: `${names[0]}, ${names[1]}`, detail: "2 clinics" };
  return {
    title: `${names[0]}, ${names[1]}`,
    detail: `+${names.length - 2} more · ${names.length} total`,
  };
}

const NODE_STYLE: Record<
  FlowNodeType,
  { ring: string; bg: string; icon: typeof Play; title: string; description: string }
> = {
  start: {
    ring: "ring-emerald-500/40",
    bg: "bg-emerald-50 border-emerald-200",
    icon: Play,
    title: "Start",
    description: "Entry point of the conversation. The call begins here.",
  },
  end: {
    ring: "ring-rose-500/40",
    bg: "bg-rose-50 border-rose-200",
    icon: Square,
    title: "End",
    description: "Exit point. When reached, the call finishes automatically.",
  },
  message: {
    ring: "ring-sky-500/40",
    bg: "bg-sky-50 border-sky-200",
    icon: MessageSquare,
    title: "Message",
    description: "Bot speaks a message or prompt to the patient, then continues.",
  },
  question: {
    ring: "ring-amber-500/40",
    bg: "bg-amber-50 border-amber-200",
    icon: HelpCircle,
    title: "Question",
    description: "Ask the patient a question and branch based on their answer.",
  },
  subagent: {
    ring: "ring-violet-500/40",
    bg: "bg-violet-50 border-violet-200",
    icon: Bot,
    title: "Function",
    description: "Run a backend action (appointments, SMS, email, transfer, etc.).",
  },
  branch: {
    ring: "ring-indigo-500/40",
    bg: "bg-indigo-50 border-indigo-200",
    icon: GitFork,
    title: "Branch",
    description: "Split the flow into multiple paths based on conditions.",
  },
};

function knowledgeLabel(item: KnowledgeItem) {
  if (item.promptLabel) return item.promptLabel;
  if (item.documentName) return item.documentName;
  const text = (item.knowledge || "").trim().replace(/\s+/g, " ");
  return text.slice(0, 48) || `Knowledge #${item.id}`;
}

export default function FlowBuilderModal({
  open,
  title,
  name,
  description,
  clinicIds,
  clinics,
  knowledgeItems,
  graph,
  saving,
  onNameChange,
  onDescriptionChange,
  onClinicIdsChange,
  onGraphChange,
  onClose,
  onSave,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>("start");
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectDrag, setConnectDrag] = useState<ConnectDrag | null>(null);
  const [zoom, setZoom] = useState(1);
  const [viewPan, setViewPan] = useState({ x: 48, y: 48 });
  const [isPanning, setIsPanning] = useState(false);
  const panDragRef = useRef<{
    startX: number;
    startY: number;
    origX: number;
    origY: number;
  } | null>(null);
  const didPanRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [clinicQuery, setClinicQuery] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("");
  const [toolPickerOpen, setToolPickerOpen] = useState(false);
  const [toolPickerMode, setToolPickerMode] = useState<ToolPickerMode>("add");
  const [tools] = useState<FlowSubagentTool[]>(() => [...FLOW_SUBAGENT_TOOLS]);

  const selected = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) || null,
    [graph.nodes, selectedId]
  );

  const targetOptions = useMemo(
    () => graph.nodes.map((n) => ({ id: n.id, label: n.data.label || n.type })),
    [graph.nodes]
  );

  const clinicMap = useMemo(
    () => Object.fromEntries(clinics.map((c) => [String(c.id), c])),
    [clinics]
  );

  const filteredClinics = useMemo(() => {
    const q = clinicQuery.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter((c) =>
      [c.name, c.acronym, c.clinicId, c.city].filter(Boolean).join(" ").toLowerCase().includes(q)
    );
  }, [clinics, clinicQuery]);

  const availableKnowledge = useMemo(() => {
    if (!clinicIds.length) return knowledgeItems;
    const allowed = new Set(clinicIds.map(String));
    return knowledgeItems.filter((k) => {
      const ids = (k.clinicIds?.length ? k.clinicIds : k.clinicId ? [k.clinicId] : []).map(String);
      return ids.some((id) => allowed.has(id));
    });
  }, [knowledgeItems, clinicIds]);

  const filteredKnowledge = useMemo(() => {
    const q = knowledgeQuery.trim().toLowerCase();
    if (!q) return availableKnowledge;
    return availableKnowledge.filter((k) =>
      [knowledgeLabel(k), k.knowledge, k.promptKey, k.documentName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [availableKnowledge, knowledgeQuery]);

  const updateNode = (id: string, patch: Partial<FlowNode>) => {
    onGraphChange({
      ...graph,
      nodes: graph.nodes.map((n) => {
        if (n.id !== id) return n;
        return {
          ...n,
          ...patch,
          position: patch.position || n.position,
          data: { ...n.data, ...(patch.data || {}) },
        };
      }),
    });
  };

  const setDefaultEdge = (source: string, target: string) => {
    const without = graph.edges.filter((e) => !(e.source === source && !e.sourceHandle));
    onGraphChange({
      ...graph,
      edges: [...without, { id: uid("e"), source, target, label: "" }],
    });
  };

  const defaultTarget = (nodeId: string) =>
    graph.edges.find((e) => e.source === nodeId && !e.sourceHandle)?.target || "";

  const toggleClinic = (id: string) => {
    if (clinicIds.includes(id)) onClinicIdsChange(clinicIds.filter((x) => x !== id));
    else onClinicIdsChange([...clinicIds, id]);
  };

  const toggleKnowledge = (nodeId: string, knowledgeId: string) => {
    const node = graph.nodes.find((n) => n.id === nodeId);
    if (!node) return;
    const current = node.data.knowledgeIds || [];
    const next = current.includes(knowledgeId)
      ? current.filter((x) => x !== knowledgeId)
      : [...current, knowledgeId];
    updateNode(nodeId, { data: { ...node.data, knowledgeIds: next } });
  };

  const openToolPicker = (mode: ToolPickerMode) => {
    setToolPickerMode(mode);
    setToolPickerOpen(true);
  };

  const addNode = (type: "message" | "question" | "subagent" | "branch", tool?: FlowSubagentTool) => {
    const id = uid(type);
    const canvas = canvasRef.current;
    const placeX = canvas
      ? Math.max(24, (canvas.clientWidth / 2 - viewPan.x) / zoom - NODE_W / 2)
      : 280;
    const placeY = canvas
      ? Math.max(24, (canvas.clientHeight / 2 - viewPan.y) / zoom - 40)
      : 180;

    let data: FlowNode["data"];
    if (type === "subagent" && tool) {
      data = {
        label: tool.name,
        toolId: tool.id,
        toolName: tool.name,
        toolConfig: {},
        knowledgeIds: [],
        guideText: "",
      };
    } else if (type === "branch") {
      data = {
        label: "Branch",
        guideText: "",
        knowledgeIds: [],
        branches: [
          { id: uid("branch"), label: "Path A", target: "" },
          { id: uid("branch"), label: "Path B", target: "" },
        ],
      };
    } else {
      data = {
        label: type === "message" ? "Bot message" : "Ask patient",
        prompt:
          type === "message"
            ? "Hello, this is the clinic assistant."
            : "How can I help you today?",
        guideText: "",
        knowledgeIds: [],
        options:
          type === "question"
            ? [
                { id: uid("opt"), label: "Yes", target: "" },
                { id: uid("opt"), label: "No", target: "" },
              ]
            : [],
      };
    }

    const node: FlowNode = {
      id,
      type,
      position: { x: placeX, y: placeY },
      data,
    };

    // Add as a disconnected node — user links it explicitly via ports or Next node
    onGraphChange({ nodes: [...graph.nodes, node], edges: graph.edges });
    setSelectedId(id);
    setSelectedEdgeId(null);
  };

  const applyToolSelection = (tool: FlowSubagentTool) => {
    if (toolPickerMode === "change" && selected?.type === "subagent") {
      updateNode(selected.id, {
        data: {
          ...selected.data,
          label: selected.data.label === selected.data.toolName ? tool.name : selected.data.label,
          toolId: tool.id,
          toolName: tool.name,
          toolConfig: selected.data.toolConfig || {},
        },
      });
    } else {
      addNode("subagent", tool);
    }
    setToolPickerOpen(false);
  };

  const removeNode = (id: string) => {
    if (id === "start" || id === "end") return;
    const nodes = graph.nodes.filter((n) => n.id !== id);
    const edges = graph.edges.filter((e) => e.source !== id && e.target !== id);
    if (!edges.some((e) => e.source === "start")) {
      edges.push({ id: uid("e"), source: "start", target: "end", label: "" });
    }
    const cleanedNodes = nodes.map((n) => {
      let next = n;
      if (n.data.options?.length) {
        next = {
          ...next,
          data: {
            ...next.data,
            options: next.data.options!.map((o) =>
              o.target === id ? { ...o, target: "end" } : o
            ),
          },
        };
      }
      if (n.data.branches?.length) {
        next = {
          ...next,
          data: {
            ...next.data,
            branches: next.data.branches!.map((b) =>
              b.target === id ? { ...b, target: "end" } : b
            ),
          },
        };
      }
      return next;
    });
    onGraphChange({ nodes: cleanedNodes, edges });
    setSelectedId("start");
    setSelectedEdgeId(null);
  };

  const setLinkedEdge = (
    source: string,
    target: string,
    sourceHandle: string | null,
    label = ""
  ) => {
    if (source === target) return;
    const without = graph.edges.filter(
      (e) => !(e.source === source && (e.sourceHandle || null) === sourceHandle)
    );
    const nextEdges = [
      ...without,
      { id: uid("e"), source, target, label, sourceHandle: sourceHandle || undefined },
    ];

    // Keep question/branch option targets in sync with edges
    const nodes = graph.nodes.map((n) => {
      if (n.id !== source) return n;
      if (n.type === "question" && sourceHandle && n.data.options) {
        return {
          ...n,
          data: {
            ...n.data,
            options: n.data.options.map((o) =>
              o.id === sourceHandle ? { ...o, target } : o
            ),
          },
        };
      }
      if (n.type === "branch" && sourceHandle && n.data.branches) {
        return {
          ...n,
          data: {
            ...n.data,
            branches: n.data.branches.map((b) =>
              b.id === sourceHandle ? { ...b, target } : b
            ),
          },
        };
      }
      return n;
    });

    onGraphChange({ nodes, edges: nextEdges });
  };

  const removeEdge = (edgeId: string) => {
    const edge = graph.edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const edges = graph.edges.filter((e) => e.id !== edgeId);
    const nodes = graph.nodes.map((n) => {
      if (n.id !== edge.source) return n;
      if (edge.sourceHandle && n.type === "question" && n.data.options) {
        return {
          ...n,
          data: {
            ...n.data,
            options: n.data.options.map((o) =>
              o.id === edge.sourceHandle ? { ...o, target: "" } : o
            ),
          },
        };
      }
      if (edge.sourceHandle && n.type === "branch" && n.data.branches) {
        return {
          ...n,
          data: {
            ...n.data,
            branches: n.data.branches.map((b) =>
              b.id === edge.sourceHandle ? { ...b, target: "" } : b
            ),
          },
        };
      }
      return n;
    });
    onGraphChange({ nodes, edges });
    setSelectedEdgeId(null);
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName?.toLowerCase();
      if (
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        el?.isContentEditable
      ) {
        return;
      }
      if (selectedEdgeId) {
        e.preventDefault();
        removeEdge(selectedEdgeId);
        return;
      }
      if (selectedId && selectedId !== "start" && selectedId !== "end") {
        e.preventDefault();
        removeNode(selectedId);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, selectedEdgeId, selectedId, graph, onGraphChange]);

  const clientToCanvas = (el: HTMLDivElement, clientX: number, clientY: number) => {
    const rect = el.getBoundingClientRect();
    return {
      x: (clientX - rect.left - viewPan.x) / zoom,
      y: (clientY - rect.top - viewPan.y) / zoom,
    };
  };

  const onCanvasMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if (connectDrag || dragId) return;
    const target = e.target as HTMLElement;
    if (
      target.closest("[data-flow-node]") ||
      target.closest("[data-edge-hit]") ||
      target.closest("[data-flow-chrome]")
    ) {
      return;
    }
    didPanRef.current = false;
    panDragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: viewPan.x,
      origY: viewPan.y,
    };
    setIsPanning(true);
  };

  const onCanvasMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (panDragRef.current) {
      const dx = e.clientX - panDragRef.current.startX;
      const dy = e.clientY - panDragRef.current.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didPanRef.current = true;
      setViewPan({
        x: panDragRef.current.origX + dx,
        y: panDragRef.current.origY + dy,
      });
      return;
    }

    const { x: canvasX, y: canvasY } = clientToCanvas(e.currentTarget, e.clientX, e.clientY);

    if (connectDrag) {
      setConnectDrag({ ...connectDrag, x2: canvasX, y2: canvasY });
      return;
    }
    if (!dragId) return;
    const x = canvasX - dragOffset.x;
    const y = canvasY - dragOffset.y;
    updateNode(dragId, {
      position: { x: Math.max(16, x), y: Math.max(16, y) },
    });
  };

  const onCanvasMouseUp = () => {
    setDragId(null);
    setConnectDrag(null);
    panDragRef.current = null;
    setIsPanning(false);
  };

  const clampZoom = (value: number) => Math.min(1.75, Math.max(0.5, Math.round(value * 100) / 100));

  const onCanvasWheel = (e: WheelEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.08 : 0.08;
    setZoom((z) => clampZoom(z + delta));
  };

  const onCanvasClick = () => {
    if (didPanRef.current) {
      didPanRef.current = false;
      return;
    }
    setSelectedId(null);
    setSelectedEdgeId(null);
  };

  const clinicSummary = clinicSelectionSummary(clinicIds, clinics, clinicMap);

  const selectedKnowledgeIds = selected?.data.knowledgeIds || [];
  const selectedTool =
    selected?.type === "subagent"
      ? tools.find((t) => t.id === selected.data.toolId) || null
      : null;

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
      <header className="relative flex items-center justify-between gap-4 border-b border-border/80 px-5 py-3.5 shrink-0 bg-card/90 backdrop-blur overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-violet-500/8 via-transparent to-sky-500/6" />
        <div className="relative min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {title}
          </div>
          <Input
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            placeholder="Flow name"
            className="mt-0.5 h-9 max-w-lg font-semibold border-0 shadow-none px-0 text-lg focus-visible:ring-0 bg-transparent"
          />
        </div>
        <div className="relative flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>
            <X className="h-4 w-4 mr-1.5" /> Close
          </Button>
          <Button
            className="bg-gradient-primary text-primary-foreground"
            onClick={onSave}
            disabled={saving}
          >
            <Save className="h-4 w-4 mr-1.5" /> {saving ? "Saving…" : "Save flow"}
          </Button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside className="w-72 shrink-0 border-r border-border p-4 space-y-4 bg-muted/20 overflow-y-auto">
          <div>
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="What this bot work mode does…"
              className="mt-1.5 min-h-[72px]"
            />
          </div>

          <div>
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> Clinics
              </Label>
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => onClinicIdsChange(clinics.map((c) => String(c.id)))}
                >
                  All
                </button>
                <button
                  type="button"
                  className="text-muted-foreground hover:underline"
                  onClick={() => onClinicIdsChange([])}
                >
                  Clear
                </button>
              </div>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {clinicIds.length === 0
                ? "Select at least one clinic"
                : `${clinicIds.length} clinic${clinicIds.length === 1 ? "" : "s"} selected`}
            </p>
            {clinicIds.length > 0 ? (
              <div className="mt-2 rounded-xl border border-border/80 bg-background px-3 py-2.5">
                <div className="text-sm font-medium truncate" title={clinicSummary.title}>
                  {clinicSummary.title}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{clinicSummary.detail}</div>
              </div>
            ) : null}
            <div className="mt-2 rounded-xl border border-border bg-background overflow-hidden">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    value={clinicQuery}
                    onChange={(e) => setClinicQuery(e.target.value)}
                    placeholder="Search clinics…"
                    className="h-8 pl-8 text-sm"
                  />
                </div>
              </div>
              <div className="max-h-40 overflow-y-auto p-1">
                {filteredClinics.map((c) => {
                  const selectedClinic = clinicIds.includes(String(c.id));
                  return (
                    <label
                      key={c.id}
                      className={cn(
                        "flex w-full cursor-pointer items-start gap-2 rounded-lg px-2.5 py-1.5 text-sm hover:bg-secondary",
                        selectedClinic && "bg-secondary/80"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1 h-3.5 w-3.5 accent-primary"
                        checked={selectedClinic}
                        onChange={() => toggleClinic(String(c.id))}
                      />
                      <span className="min-w-0 flex-1">
                        <div className="truncate font-medium text-[13px]">{c.name}</div>
                        <div className="text-[11px] text-muted-foreground truncate">
                          {c.acronym || "-"}
                        </div>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Add node</div>
            <TooltipProvider delayDuration={200}>
              <div className="grid gap-2">
                {(
                  [
                    {
                      type: "message" as const,
                      icon: MessageSquare,
                      color: "text-sky-600",
                      onClick: () => addNode("message"),
                    },
                    {
                      type: "question" as const,
                      icon: HelpCircle,
                      color: "text-amber-600",
                      onClick: () => addNode("question"),
                    },
                    {
                      type: "subagent" as const,
                      icon: Bot,
                      color: "text-violet-600",
                      onClick: () => openToolPicker("add"),
                    },
                    {
                      type: "branch" as const,
                      icon: GitFork,
                      color: "text-indigo-600",
                      onClick: () => addNode("branch"),
                    },
                  ] as const
                ).map((item) => {
                  const meta = NODE_STYLE[item.type];
                  return (
                    <Tooltip key={item.type}>
                      <TooltipTrigger asChild>
                        <Button variant="outline" className="justify-start" onClick={item.onClick}>
                          <item.icon className={cn("h-4 w-4 mr-2", item.color)} /> {meta.title}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-[220px] text-xs leading-relaxed">
                        {meta.description}
                      </TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            </TooltipProvider>
            <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
              Drag from an output port (bottom) to an input port (top) to connect nodes.
            </p>
          </div>
        </aside>

        <div
          ref={canvasRef}
          className={cn(
            "relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,_hsl(var(--border))_1px,_transparent_0)] [background-size:20px_20px]",
            connectDrag && "cursor-crosshair",
            isPanning && "cursor-grabbing",
            !connectDrag && !isPanning && "cursor-grab"
          )}
          onMouseDown={onCanvasMouseDown}
          onMouseMove={onCanvasMouseMove}
          onMouseUp={onCanvasMouseUp}
          onMouseLeave={onCanvasMouseUp}
          onWheel={onCanvasWheel}
          onClick={onCanvasClick}
        >
          <div
            data-flow-chrome
            className="absolute top-3 right-3 z-20 flex items-center gap-1 rounded-xl border border-border bg-card/95 backdrop-blur px-1.5 py-1.5 shadow-soft"
          >
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Zoom out"
              onClick={(e) => {
                e.stopPropagation();
                setZoom((z) => clampZoom(z - 0.1));
              }}
            >
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Zoom in"
              onClick={(e) => {
                e.stopPropagation();
                setZoom((z) => clampZoom(z + 0.1));
              }}
            >
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              title="Reset view"
              onClick={(e) => {
                e.stopPropagation();
                setZoom(1);
                setViewPan({ x: 48, y: 48 });
              }}
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>

          {selectedEdgeId ? (
            <div
              data-flow-chrome
              className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-xl border border-border bg-card/95 backdrop-blur px-3 py-2 shadow-soft"
            >
              <span className="text-xs text-muted-foreground">Connection selected · Del to remove</span>
              <Button size="sm" variant="destructive" onClick={() => removeEdge(selectedEdgeId)}>
                <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
              </Button>
            </div>
          ) : (
            <div
              data-flow-chrome
              className="absolute top-3 left-3 z-10 rounded-lg border border-border/70 bg-card/90 backdrop-blur px-2.5 py-1.5 text-[11px] text-muted-foreground pointer-events-none"
            >
              Drag canvas to pan · Click empty area to clear · Del removes selection
            </div>
          )}

          <div
            className="absolute left-0 top-0 origin-top-left"
            style={{
              width: 1100,
              height: 800,
              transform: `translate(${viewPan.x}px, ${viewPan.y}px) scale(${zoom})`,
              transformOrigin: "0 0",
            }}
          >
          <svg
            className="absolute inset-0 z-0 overflow-visible"
            width={1100}
            height={800}
            style={{ overflow: "visible" }}
          >
            {graph.edges.map((edge) => {
              const from = graph.nodes.find((n) => n.id === edge.source);
              const to = graph.nodes.find((n) => n.id === edge.target);
              if (!from || !to) return null;
              const ports = getSourcePorts(from);
              const port =
                ports.find((p) => p.handleId === (edge.sourceHandle || null)) || ports[0];
              const x1 = portX(from.position.x, port?.index ?? 0, port?.total ?? 1);
              const y1 = from.position.y + nodeCardHeight(from);
              const x2 = to.position.x + NODE_W / 2;
              // End slightly above the target card so the arrow tip sits on the input port
              const y2 = to.position.y + 2;
              const active = selectedEdgeId === edge.id;
              const label =
                edge.label ||
                (edge.sourceHandle
                  ? from.data.options?.find((o) => o.id === edge.sourceHandle)?.label ||
                    from.data.branches?.find((b) => b.id === edge.sourceHandle)?.label ||
                    ""
                  : "");
              const labelPt = edgeLabelPoint(x1, y1, x2, y2);
              // Shorten path slightly so the stroke ends under the arrow tip
              const path = edgePath(x1, y1, x2, y2 - 8);
              const arrow = edgeArrowPoints(x1, y1, x2, y2, active ? 11 : 10);
              const stroke = active ? "#2563eb" : "#64748b";
              return (
                <g key={edge.id}>
                  <path
                    d={path}
                    data-edge-hit
                    stroke="transparent"
                    strokeWidth="22"
                    fill="none"
                    style={{ pointerEvents: "stroke", cursor: "pointer" }}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setSelectedEdgeId(edge.id);
                      setSelectedId(null);
                    }}
                    onMouseDown={(ev) => {
                      // Prevent canvas drag/deselect from stealing the click
                      ev.stopPropagation();
                    }}
                  />
                  <path
                    d={path}
                    stroke={stroke}
                    strokeWidth={active ? 2.5 : 2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                    style={{ pointerEvents: "none" }}
                  />
                  <polygon
                    points={arrow}
                    fill={stroke}
                    stroke={stroke}
                    strokeWidth={1}
                    strokeLinejoin="round"
                    style={{ pointerEvents: "none" }}
                  />
                  {label ? (
                    <g style={{ pointerEvents: "none" }}>
                      <rect
                        x={labelPt.x - Math.min(42, Math.max(18, label.length * 3.4))}
                        y={labelPt.y - 9}
                        width={Math.min(84, Math.max(36, label.length * 6.8))}
                        height={18}
                        rx={9}
                        fill="hsl(var(--card))"
                        stroke="hsl(var(--border))"
                      />
                      <text
                        x={labelPt.x}
                        y={labelPt.y + 3.5}
                        textAnchor="middle"
                        fontSize="10"
                        fontWeight="500"
                        fill="hsl(var(--muted-foreground))"
                      >
                        {label.length > 14 ? `${label.slice(0, 13)}…` : label}
                      </text>
                    </g>
                  ) : null}
                </g>
              );
            })}

            {connectDrag ? (
              <g className="pointer-events-none">
                <path
                  d={edgePath(
                    connectDrag.x1,
                    connectDrag.y1,
                    connectDrag.x2,
                    connectDrag.y2 - 8
                  )}
                  stroke="hsl(221 83% 53% / 0.75)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="5 5"
                  fill="none"
                />
                <polygon
                  points={edgeArrowPoints(
                    connectDrag.x1,
                    connectDrag.y1,
                    connectDrag.x2,
                    connectDrag.y2,
                    10
                  )}
                  fill="#3b82f6"
                  stroke="#3b82f6"
                  strokeWidth={1}
                  strokeLinejoin="round"
                />
              </g>
            ) : null}
          </svg>

          <div
            className="relative z-[1] pointer-events-none"
            style={{ width: 1100, height: 800 }}
          >
            <TooltipProvider delayDuration={250}>
            {graph.nodes.map((node) => {
              const style = NODE_STYLE[node.type];
              const Icon = style.icon;
              const fixed = node.type === "start" || node.type === "end";
              const kCount = node.data.knowledgeIds?.length || 0;
              const ports = getSourcePorts(node);
              const height = nodeCardHeight(node);
              return (
                <Tooltip key={node.id}>
                <TooltipTrigger asChild>
                <div
                  data-flow-node
                  className={cn(
                    "absolute w-[220px] rounded-2xl border shadow-soft p-3 select-none transition-shadow pointer-events-auto cursor-default",
                    style.bg,
                    selectedId === node.id && `ring-2 ${style.ring} shadow-md`
                  )}
                  style={{ left: node.position.x, top: node.position.y, minHeight: height }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(node.id);
                    setSelectedEdgeId(null);
                    setKnowledgeQuery("");
                  }}
                  onMouseUp={(e) => {
                    if (!connectDrag) return;
                    if (node.type === "start") return;
                    if (connectDrag.sourceId === node.id) return;
                    e.stopPropagation();
                    setLinkedEdge(connectDrag.sourceId, node.id, connectDrag.sourceHandle, "");
                    setConnectDrag(null);
                  }}
                  onMouseDown={(e) => {
                    if ((e.target as HTMLElement).closest("[data-port]")) return;
                    e.stopPropagation();
                    setSelectedId(node.id);
                    setSelectedEdgeId(null);
                    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                    setDragOffset({
                      x: (e.clientX - rect.left) / zoom,
                      y: (e.clientY - rect.top) / zoom,
                    });
                    setDragId(node.id);
                  }}
                >
                  {/* Input port */}
                  {node.type !== "start" ? (
                    <button
                      type="button"
                      data-port="in"
                      title="Drop connection here"
                      className={cn(
                        "absolute -top-2 left-1/2 -translate-x-1/2 h-4 w-4 rounded-full border-2 border-emerald-500 bg-white shadow-sm z-10",
                        "hover:scale-110 transition-transform",
                        connectDrag && "ring-2 ring-emerald-400/50 scale-110"
                      )}
                      onMouseUp={(e) => {
                        e.stopPropagation();
                        if (!connectDrag) return;
                        setLinkedEdge(
                          connectDrag.sourceId,
                          node.id,
                          connectDrag.sourceHandle,
                          ""
                        );
                        setConnectDrag(null);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                    />
                  ) : null}

                  <div className="flex items-center gap-2 mb-1.5 cursor-grab active:cursor-grabbing">
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="text-sm font-semibold truncate">
                      {node.data.label || style.title}
                    </div>
                    {fixed ? (
                      <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                        Fixed
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">
                    {node.type === "end"
                      ? "Call finishes automatically"
                      : node.type === "subagent"
                        ? node.data.guideText || node.data.toolName || style.title
                        : node.data.guideText || node.data.prompt || style.title}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {node.type !== "subagent" && kCount > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-white/70 border border-border/70">
                        <BookOpen className="h-3 w-3" /> {kCount} knowledge
                      </span>
                    ) : null}
                    {node.type === "subagent" && node.data.toolName ? (
                      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md bg-white/70 border border-violet-200/80">
                        <Bot className="h-3 w-3" /> {node.data.toolName}
                      </span>
                    ) : null}
                    {node.type === "question" &&
                      node.data.options?.map((o) => (
                        <span
                          key={o.id}
                          className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/70 border border-amber-200/80"
                        >
                          {o.label}
                        </span>
                      ))}
                    {node.type === "branch" &&
                      node.data.branches?.map((b) => (
                        <span
                          key={b.id}
                          className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/70 border border-indigo-200/80"
                        >
                          {b.label}
                        </span>
                      ))}
                  </div>

                  {/* Output ports */}
                  {node.type !== "end"
                    ? ports.map((port) => {
                        const left = portX(0, port.index, port.total);
                        return (
                          <button
                            key={`${node.id}-${port.handleId || "default"}`}
                            type="button"
                            data-port="out"
                            title={port.label ? `Connect: ${port.label}` : "Drag to connect"}
                            className={cn(
                              "absolute -bottom-2 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-sky-500 bg-white shadow-sm z-10",
                              "hover:scale-110 transition-transform cursor-crosshair"
                            )}
                            style={{ left }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              e.preventDefault();
                              const canvas = e.currentTarget.closest(
                                ".relative.flex-1"
                              ) as HTMLDivElement | null;
                              const parent = e.currentTarget.offsetParent as HTMLElement | null;
                              // Use node geometry for start point
                              const x1 = portX(node.position.x, port.index, port.total);
                              const y1 = node.position.y + nodeCardHeight(node);
                              setConnectDrag({
                                sourceId: node.id,
                                sourceHandle: port.handleId,
                                x1,
                                y1,
                                x2: x1,
                                y2: y1,
                              });
                              setDragId(null);
                              void canvas;
                              void parent;
                            }}
                          />
                        );
                      })
                    : null}
                </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[240px] text-xs leading-relaxed z-[80]">
                  <div className="font-medium mb-0.5">{style.title}</div>
                  {style.description}
                </TooltipContent>
                </Tooltip>
              );
            })}
            </TooltipProvider>
          </div>
          </div>
        </div>

        <aside className="w-[22rem] shrink-0 border-l border-border p-4 overflow-y-auto bg-card">
          {!selected ? (
            <div className="text-sm text-muted-foreground">Select a node to edit.</div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    {NODE_STYLE[selected.type].title}
                  </div>
                  <div className="font-semibold">{selected.data.label || selected.id}</div>
                  <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                    {NODE_STYLE[selected.type].description}
                  </p>
                </div>
                {selected.type !== "start" && selected.type !== "end" ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive"
                    onClick={() => removeNode(selected.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>

              {selected.type !== "end" ? (
                <>
                  {selected.type !== "start" ? (
                    <div>
                      <Label>Label</Label>
                      <Input
                        className="mt-1.5"
                        value={selected.data.label || ""}
                        onChange={(e) =>
                          updateNode(selected.id, {
                            data: { ...selected.data, label: e.target.value },
                          })
                        }
                      />
                    </div>
                  ) : null}

                  {selected.type === "message" || selected.type === "question" ? (
                    <div>
                      <Label>
                        {selected.type === "question" ? "Question prompt" : "Message prompt"}
                      </Label>
                      <Textarea
                        className="mt-1.5 min-h-[80px]"
                        value={selected.data.prompt || ""}
                        onChange={(e) =>
                          updateNode(selected.id, {
                            data: { ...selected.data, prompt: e.target.value },
                          })
                        }
                        placeholder="What the bot says…"
                      />
                    </div>
                  ) : null}

                  <div>
                    <Label>Guide text</Label>
                    <Textarea
                      className="mt-1.5 min-h-[90px]"
                      value={selected.data.guideText || ""}
                      onChange={(e) =>
                        updateNode(selected.id, {
                          data: { ...selected.data, guideText: e.target.value },
                        })
                      }
                      placeholder="Instructions for how the bot should handle this step…"
                    />
                  </div>

                  {selected.type !== "subagent" ? (
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <Label className="flex items-center gap-1.5">
                        <BookOpen className="h-3.5 w-3.5" /> Knowledge (multi-select)
                      </Label>
                      {selectedKnowledgeIds.length > 0 ? (
                        <button
                          type="button"
                          className="text-[11px] text-muted-foreground hover:underline"
                          onClick={() =>
                            updateNode(selected.id, {
                              data: { ...selected.data, knowledgeIds: [] },
                            })
                          }
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {selectedKnowledgeIds.length === 0
                        ? "No knowledge attached"
                        : `${selectedKnowledgeIds.length} selected`}
                    </p>
                    {selectedKnowledgeIds.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {selectedKnowledgeIds.map((kid) => {
                          const item = availableKnowledge.find((k) => k.id === kid);
                          return (
                            <Badge key={kid} variant="outline" className="gap-1 pr-1 max-w-full text-[11px]">
                              <span className="truncate">{item ? knowledgeLabel(item) : kid}</span>
                              <button
                                type="button"
                                className="rounded-sm p-0.5 hover:bg-muted"
                                onClick={() => toggleKnowledge(selected.id, kid)}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="mt-2 rounded-xl border border-border bg-muted/20 overflow-hidden">
                      <div className="p-2 border-b border-border bg-background">
                        <div className="relative">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            value={knowledgeQuery}
                            onChange={(e) => setKnowledgeQuery(e.target.value)}
                            placeholder="Search knowledge…"
                            className="h-8 pl-8 text-sm"
                          />
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto p-1">
                        {!clinicIds.length ? (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            Select clinics first to filter knowledge
                          </div>
                        ) : filteredKnowledge.length === 0 ? (
                          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                            No knowledge for selected clinics
                          </div>
                        ) : (
                          filteredKnowledge.map((k) => {
                            const checked = selectedKnowledgeIds.includes(k.id);
                            return (
                              <button
                                key={k.id}
                                type="button"
                                className={cn(
                                  "flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-secondary transition-colors",
                                  checked && "bg-secondary/80"
                                )}
                                onClick={() => toggleKnowledge(selected.id, k.id)}
                              >
                                <span
                                  className={cn(
                                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                                    checked
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background"
                                  )}
                                >
                                  {checked ? <Check className="h-3 w-3" /> : null}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <div className="truncate font-medium text-[13px]">
                                    {knowledgeLabel(k)}
                                  </div>
                                  <div className="text-[11px] text-muted-foreground line-clamp-2">
                                    {(k.knowledge || "").trim().slice(0, 90) || "—"}
                                  </div>
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    </div>
                  </div>
                  ) : null}

                  {selected.type === "subagent" ? (
                    <div>
                      <Label>Function</Label>
                      <div className="mt-1.5 rounded-xl border border-violet-200 bg-violet-50/60 p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <Bot className="h-4 w-4 mt-0.5 text-violet-600 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium">
                              {selected.data.toolName || selectedTool?.name || "No function selected"}
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                              {selectedTool?.description ||
                                "Backend action attached to this function node."}
                            </p>
                            {selected.data.toolId ? (
                              <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                                {selected.data.toolId}
                              </p>
                            ) : null}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={() => openToolPicker("change")}
                        >
                          Change function
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3 text-sm text-rose-900/80">
                  When the conversation reaches this node, the call ends automatically.
                </div>
              )}

              {selected.type === "start" ||
              selected.type === "message" ||
              selected.type === "subagent" ? (
                <div>
                  <Label className="flex items-center gap-1.5">
                    <Link2 className="h-3.5 w-3.5" /> Next node
                  </Label>
                  <Select
                    value={defaultTarget(selected.id) || undefined}
                    onValueChange={(v) => setDefaultEdge(selected.id, v)}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Select next node" />
                    </SelectTrigger>
                    <SelectContent className="z-[80]">
                      {targetOptions
                        .filter((t) => t.id !== selected.id)
                        .map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.label} ({t.id === "end" ? "End" : t.id})
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}

              {selected.type === "question" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Answer branches</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateNode(selected.id, {
                          data: {
                            ...selected.data,
                            options: [
                              ...(selected.data.options || []),
                              { id: uid("opt"), label: "New option", target: "end" },
                            ],
                          },
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                  {(selected.data.options || []).map((opt, idx) => (
                    <div
                      key={opt.id}
                      className="rounded-xl border border-border p-3 space-y-2 bg-muted/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={opt.label}
                          onChange={(e) => {
                            const options = [...(selected.data.options || [])];
                            options[idx] = { ...opt, label: e.target.value };
                            updateNode(selected.id, { data: { ...selected.data, options } });
                          }}
                          placeholder="Answer label"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-destructive"
                          onClick={() => {
                            const options = (selected.data.options || []).filter(
                              (o) => o.id !== opt.id
                            );
                            const without = graph.edges.filter(
                              (e) => !(e.source === selected.id && e.sourceHandle === opt.id)
                            );
                            onGraphChange({
                              ...graph,
                              nodes: graph.nodes.map((n) =>
                                n.id === selected.id
                                  ? { ...n, data: { ...n.data, options } }
                                  : n
                              ),
                              edges: without,
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Select
                        value={opt.target || undefined}
                        onValueChange={(v) => {
                          const options = [...(selected.data.options || [])];
                          options[idx] = { ...opt, target: v };
                          const without = graph.edges.filter(
                            (e) => !(e.source === selected.id && e.sourceHandle === opt.id)
                          );
                          onGraphChange({
                            ...graph,
                            nodes: graph.nodes.map((n) =>
                              n.id === selected.id
                                ? { ...n, data: { ...n.data, options } }
                                : n
                            ),
                            edges: [
                              ...without,
                              {
                                id: uid("e"),
                                source: selected.id,
                                target: v,
                                label: opt.label,
                                sourceHandle: opt.id,
                              },
                            ],
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Goes to…" />
                        </SelectTrigger>
                        <SelectContent className="z-[80]">
                          {targetOptions
                            .filter((t) => t.id !== selected.id)
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : null}

              {selected.type === "branch" ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Paths</Label>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateNode(selected.id, {
                          data: {
                            ...selected.data,
                            branches: [
                              ...(selected.data.branches || []),
                              { id: uid("branch"), label: "New path", target: "end" },
                            ],
                          },
                        })
                      }
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" /> Add
                    </Button>
                  </div>
                  {(selected.data.branches || []).map((branch, idx) => (
                    <div
                      key={branch.id}
                      className="rounded-xl border border-border p-3 space-y-2 bg-muted/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <Input
                          value={branch.label}
                          onChange={(e) => {
                            const branches = [...(selected.data.branches || [])];
                            branches[idx] = { ...branch, label: e.target.value };
                            updateNode(selected.id, { data: { ...selected.data, branches } });
                          }}
                          placeholder="Path label"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="shrink-0 text-destructive"
                          onClick={() => {
                            const branches = (selected.data.branches || []).filter(
                              (b) => b.id !== branch.id
                            );
                            const without = graph.edges.filter(
                              (e) => !(e.source === selected.id && e.sourceHandle === branch.id)
                            );
                            onGraphChange({
                              ...graph,
                              nodes: graph.nodes.map((n) =>
                                n.id === selected.id
                                  ? { ...n, data: { ...n.data, branches } }
                                  : n
                              ),
                              edges: without,
                            });
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <Select
                        value={branch.target || undefined}
                        onValueChange={(v) => {
                          const branches = [...(selected.data.branches || [])];
                          branches[idx] = { ...branch, target: v };
                          const without = graph.edges.filter(
                            (e) => !(e.source === selected.id && e.sourceHandle === branch.id)
                          );
                          onGraphChange({
                            ...graph,
                            nodes: graph.nodes.map((n) =>
                              n.id === selected.id
                                ? { ...n, data: { ...n.data, branches } }
                                : n
                            ),
                            edges: [
                              ...without,
                              {
                                id: uid("e"),
                                source: selected.id,
                                target: v,
                                label: branch.label,
                                sourceHandle: branch.id,
                              },
                            ],
                          });
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Goes to…" />
                        </SelectTrigger>
                        <SelectContent className="z-[80]">
                          {targetOptions
                            .filter((t) => t.id !== selected.id)
                            .map((t) => (
                              <SelectItem key={t.id} value={t.id}>
                                {t.label}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </aside>
      </div>

      <Dialog open={toolPickerOpen} onOpenChange={setToolPickerOpen}>
        <DialogPortal>
          <DialogOverlay className="z-[70]" />
          <DialogPrimitive.Content
            className={cn(
              "fixed left-[50%] top-[50%] z-[70] grid w-full max-w-md max-h-[90vh] min-h-0 translate-x-[-50%] translate-y-[-50%] gap-4 overflow-y-auto border bg-background p-6 shadow-elegant duration-200 sm:rounded-2xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-top-[48%]"
            )}
          >
            <DialogHeader>
              <DialogTitle>Select function</DialogTitle>
              <DialogDescription>
                Functions run backend actions (appointments, SMS, email), not just AI replies.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[min(24rem,50vh)] overflow-y-auto space-y-2 pr-1">
              {tools.map((tool) => (
                <button
                  key={tool.id}
                  type="button"
                  className="flex w-full flex-col gap-0.5 rounded-xl border border-border bg-background px-3.5 py-3 text-left transition-colors hover:bg-secondary"
                  onClick={() => applyToolSelection(tool)}
                >
                  <div className="flex items-center gap-2">
                    <Bot className="h-4 w-4 text-violet-600 shrink-0" />
                    <span className="text-sm font-medium">{tool.name}</span>
                    <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground">
                      {tool.category}
                    </span>
                  </div>
                  <p className="text-[12px] text-muted-foreground leading-relaxed pl-6">
                    {tool.description}
                  </p>
                </button>
              ))}
            </div>
            <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
              <X className="h-4 w-4" />
              <span className="sr-only">Close</span>
            </DialogPrimitive.Close>
          </DialogPrimitive.Content>
        </DialogPortal>
      </Dialog>
    </div>
  );
}
