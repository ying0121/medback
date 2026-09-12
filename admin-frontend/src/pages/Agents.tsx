import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Bot,
  Check,
  Copy,
  ExternalLink,
  FlaskConical,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import AgentTestLab from "@/components/admin/AgentTestLab";
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
  listAgentModels,
  listAgentVoices,
  listAgentLinkOptions,
  fetchAgentVoicePreviewBlob,
  type Agent,
  type AgentInput,
  type AgentMeetingProvider,
  type AgentModelCatalog,
  type AgentModelDefaults,
  type BotVoice,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const AGENT_STEPS = [
  { id: "general", label: "General" },
  { id: "openai", label: "OpenAI" },
  { id: "voice", label: "Voice" },
  { id: "twilio", label: "Twilio" },
  { id: "meeting", label: "Meeting" },
  { id: "behavior", label: "Flow & knowledge" },
] as const;

type AgentForm = {
  title: string;
  description: string;
  status: "active" | "inactive";
  openaiApiKey: string;
  openaiModel: string;
  openaiRealtimeModel: string;
  openaiTranscriptionModel: string;
  openaiTtsModel: string;
  openaiInboundModel: string;
  openaiVoice: string;
  twilioPhoneNumber: string;
  twilioCallerId: string;
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioApiKeySid: string;
  twilioApiKeySecret: string;
  twilioTwimlAppSid: string;
  meetingProvider: AgentMeetingProvider;
  googleClientId: string;
  googleClientSecret: string;
  googleRefreshToken: string;
  googleCreateMeet: boolean;
  ecwApiEndpoint: string;
  azulApiEndpoint: string;
  flowId: string;
  knowledgeIds: string[];
};

const EMPTY: AgentForm = {
  title: "",
  description: "",
  status: "active",
  openaiApiKey: "",
  openaiModel: "",
  openaiRealtimeModel: "",
  openaiTranscriptionModel: "",
  openaiTtsModel: "",
  openaiInboundModel: "",
  openaiVoice: "",
  twilioPhoneNumber: "",
  twilioCallerId: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioApiKeySid: "",
  twilioApiKeySecret: "",
  twilioTwimlAppSid: "",
  meetingProvider: "google",
  googleClientId: "",
  googleClientSecret: "",
  googleRefreshToken: "",
  googleCreateMeet: false,
  ecwApiEndpoint: "",
  azulApiEndpoint: "",
  flowId: "",
  knowledgeIds: [],
};

function formFromAgent(agent: Agent, opts?: { asCopy?: boolean; includeSecrets?: boolean }): AgentForm {
  const secrets = opts?.includeSecrets !== false;
  return {
    title: opts?.asCopy ? `${agent.title} (copy)` : agent.title,
    description: agent.description || "",
    status: agent.status,
    openaiApiKey: secrets ? agent.openaiApiKey || "" : "",
    openaiModel: agent.openaiModel || "",
    openaiRealtimeModel: agent.openaiRealtimeModel || "",
    openaiTranscriptionModel: agent.openaiTranscriptionModel || "",
    openaiTtsModel: agent.openaiTtsModel || "",
    openaiInboundModel: agent.openaiInboundModel || "",
    openaiVoice: agent.openaiVoice || "",
    twilioPhoneNumber: agent.twilioPhoneNumber || "",
    twilioCallerId: agent.twilioCallerId || "",
    twilioAccountSid: agent.twilioAccountSid || "",
    twilioAuthToken: secrets ? agent.twilioAuthToken || "" : "",
    twilioApiKeySid: agent.twilioApiKeySid || "",
    twilioApiKeySecret: secrets ? agent.twilioApiKeySecret || "" : "",
    twilioTwimlAppSid: agent.twilioTwimlAppSid || "",
    meetingProvider: agent.meetingProvider || "google",
    googleClientId: agent.googleClientId || "",
    googleClientSecret: secrets ? agent.googleClientSecret || "" : "",
    googleRefreshToken: secrets ? agent.googleRefreshToken || "" : "",
    googleCreateMeet: Boolean(agent.googleCreateMeet),
    ecwApiEndpoint: agent.ecwApiEndpoint || "",
    azulApiEndpoint: agent.azulApiEndpoint || "",
    flowId: agent.flowId || "",
    knowledgeIds: [...(agent.knowledgeIds || [])],
  };
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

function ModelSelect({
  label,
  value,
  options,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  hint?: string;
}) {
  const list = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <Field label={label} hint={hint} className="col-span-12 md:col-span-6">
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select model" />
        </SelectTrigger>
        <SelectContent className="z-[80] max-h-72">
          {list.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function toggleId(list: string[], id: string) {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export default function Agents() {
  const [data, setData] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Agent | null>(null);
  const [form, setForm] = useState<AgentForm>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<Agent | null>(null);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const [duplicateAgentId, setDuplicateAgentId] = useState("");
  const [loadingDuplicate, setLoadingDuplicate] = useState(false);
  const [duplicateSourceTitle, setDuplicateSourceTitle] = useState<string | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<{
    agentId?: string;
    title?: string;
    draft?: Partial<AgentInput> & { title?: string };
  } | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const [models, setModels] = useState<AgentModelCatalog | null>(null);
  const [defaults, setDefaults] = useState<AgentModelDefaults | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [voices, setVoices] = useState<BotVoice[]>([]);
  const [links, setLinks] = useState<Awaited<ReturnType<typeof listAgentLinkOptions>> | null>(
    null
  );

  const cleanupPreview = useCallback(() => {
    previewAudioRef.current?.pause();
    previewAudioRef.current = null;
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewingVoice(null);
  }, []);

  useEffect(() => cleanupPreview, [cleanupPreview]);

  const playVoicePreview = async (voiceId: string) => {
    cleanupPreview();
    try {
      setPreviewingVoice(voiceId);
      const blob = await fetchAgentVoicePreviewBlob({
        voice: voiceId,
        agentId: editing?.id,
        apiKey: form.openaiApiKey || undefined,
        ttsModel: form.openaiTtsModel || undefined,
      });
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => setPreviewingVoice(null);
      audio.onerror = () => {
        toast.error("Could not play preview");
        setPreviewingVoice(null);
      };
      await audio.play();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
      setPreviewingVoice(null);
    }
  };

  const openTestLab = (opts: {
    agentId?: string;
    title?: string;
    draft?: Partial<AgentInput> & { title?: string };
  }) => {
    setTestTarget(opts);
    setTestOpen(true);
  };

  const draftFromForm = (): Partial<AgentInput> & { title?: string } => ({
    title: form.title || "Untitled agent",
    description: form.description,
    openaiApiKey: form.openaiApiKey || undefined,
    openaiModel: form.openaiModel,
    openaiRealtimeModel: form.openaiRealtimeModel,
    openaiTranscriptionModel: form.openaiTranscriptionModel,
    openaiTtsModel: form.openaiTtsModel,
    openaiInboundModel: form.openaiInboundModel,
    openaiVoice: form.openaiVoice,
    flowId: form.flowId || null,
    knowledgeIds: form.knowledgeIds,
  });

  const refresh = () =>
    listAgents()
      .then(setData)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load agents"));

  useEffect(() => {
    refresh();
    listAgentVoices().then(setVoices).catch(() => setVoices([]));
    listAgentLinkOptions()
      .then(setLinks)
      .catch(() => setLinks({ flows: [], knowledge: [] }));
  }, []);

  const loadModels = async (apiKey?: string, agentId?: string) => {
    setLoadingModels(true);
    try {
      const res = await listAgentModels({ apiKey, agentId });
      setModels(res.models);
      setDefaults(res.defaults);
      if (res.models.error && res.models.source === "fallback") {
        toast.message("Using fallback model list", { description: res.models.error });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load models");
    } finally {
      setLoadingModels(false);
    }
  };

  const openCreate = async () => {
    setEditing(null);
    setDuplicateSourceTitle(null);
    setForm(EMPTY);
    setStep(0);
    setOpen(true);
    await loadModels();
    setForm((f) => ({
      ...f,
      openaiModel: defaults?.openaiModel || f.openaiModel,
      openaiRealtimeModel: defaults?.openaiRealtimeModel || f.openaiRealtimeModel,
      openaiTranscriptionModel:
        defaults?.openaiTranscriptionModel || f.openaiTranscriptionModel,
      openaiTtsModel: defaults?.openaiTtsModel || f.openaiTtsModel,
      openaiInboundModel: defaults?.openaiInboundModel || f.openaiInboundModel,
      openaiVoice: defaults?.openaiVoice || f.openaiVoice || "marin",
    }));
  };

  const openDuplicatePicker = () => {
    if (!data.length) {
      toast.error("Create an agent first before duplicating");
      return;
    }
    setDuplicateAgentId(data[0]?.id || "");
    setDuplicateOpen(true);
  };

  const confirmDuplicate = async () => {
    if (!duplicateAgentId) {
      toast.error("Select an agent to duplicate");
      return;
    }
    setLoadingDuplicate(true);
    try {
      const source = await getAgent(duplicateAgentId, true);
      setDuplicateOpen(false);
      setEditing(null);
      setDuplicateSourceTitle(source.title);
      setForm(formFromAgent(source, { asCopy: true, includeSecrets: true }));
      setStep(0);
      setOpen(true);
      await loadModels(source.openaiApiKey || undefined, source.id);
      toast.message("Agent copied into create form", {
        description: "Review the steps, then create the new agent.",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load agent to duplicate");
    } finally {
      setLoadingDuplicate(false);
    }
  };

  const openEdit = async (agent: Agent) => {
    setEditing(agent);
    setDuplicateSourceTitle(null);
    setForm(formFromAgent(agent, { includeSecrets: false }));
    setStep(0);
    setOpen(true);
    await loadModels(undefined, agent.id);
  };

  // Apply defaults once models load on create
  useEffect(() => {
    if (!open || editing || !defaults) return;
    setForm((f) => ({
      ...f,
      openaiModel: f.openaiModel || defaults.openaiModel,
      openaiRealtimeModel: f.openaiRealtimeModel || defaults.openaiRealtimeModel,
      openaiTranscriptionModel:
        f.openaiTranscriptionModel || defaults.openaiTranscriptionModel,
      openaiTtsModel: f.openaiTtsModel || defaults.openaiTtsModel,
      openaiInboundModel: f.openaiInboundModel || defaults.openaiInboundModel,
      openaiVoice: f.openaiVoice || defaults.openaiVoice || "marin",
    }));
  }, [defaults, open, editing]);

  const toPayload = (): AgentInput => {
    const payload: AgentInput = {
      title: form.title.trim(),
      description: form.description.trim(),
      status: form.status,
      openaiModel: form.openaiModel,
      openaiRealtimeModel: form.openaiRealtimeModel,
      openaiTranscriptionModel: form.openaiTranscriptionModel,
      openaiTtsModel: form.openaiTtsModel,
      openaiInboundModel: form.openaiInboundModel,
      openaiVoice: form.openaiVoice,
      twilioPhoneNumber: form.twilioPhoneNumber,
      twilioCallerId: form.twilioCallerId,
      twilioAccountSid: form.twilioAccountSid,
      twilioApiKeySid: form.twilioApiKeySid,
      twilioTwimlAppSid: form.twilioTwimlAppSid,
      meetingProvider: form.meetingProvider,
      googleClientId: form.googleClientId,
      googleCreateMeet: form.googleCreateMeet,
      ecwApiEndpoint: form.ecwApiEndpoint,
      azulApiEndpoint: form.azulApiEndpoint,
      flowId: form.flowId || null,
      knowledgeIds: form.knowledgeIds,
    };
    if (form.openaiApiKey.trim()) payload.openaiApiKey = form.openaiApiKey.trim();
    if (form.twilioAuthToken.trim()) payload.twilioAuthToken = form.twilioAuthToken.trim();
    if (form.twilioApiKeySecret.trim()) {
      payload.twilioApiKeySecret = form.twilioApiKeySecret.trim();
    }
    if (form.googleClientSecret.trim()) {
      payload.googleClientSecret = form.googleClientSecret.trim();
    }
    if (form.googleRefreshToken.trim()) {
      payload.googleRefreshToken = form.googleRefreshToken.trim();
    }
    return payload;
  };

  const save = async () => {
    if (!form.title.trim()) return toast.error("Title is required");
    setSaving(true);
    try {
      if (editing) {
        await updateAgent(editing.id, toPayload());
        toast.success("Agent updated");
      } else {
        await createAgent(toPayload());
        toast.success("Agent created");
      }
      setOpen(false);
      refresh();
      listAgentLinkOptions().then(setLinks).catch(() => null);
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
      refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const flowName = useMemo(() => {
    const map = Object.fromEntries((links?.flows || []).map((f) => [f.id, f.name]));
    return (id: string | null) => (id ? map[id] || id : "—");
  }, [links]);

  const columns: Column<Agent>[] = [
    {
      key: "agent",
      header: "Agent",
      searchable: (r) => `${r.title} ${r.description}`,
      render: (r) => (
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{r.title}</div>
            <div className="text-xs text-muted-foreground truncate">
              {r.description || "No description"}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: "models",
      header: "Models",
      searchable: (r) =>
        `${r.openaiRealtimeModel} ${r.openaiModel} ${r.openaiTranscriptionModel}`,
      render: (r) => (
        <div className="text-xs space-y-0.5 max-w-[200px]">
          <div className="truncate">
            <span className="text-muted-foreground">Realtime </span>
            {r.openaiRealtimeModel || "—"}
          </div>
          <div className="truncate">
            <span className="text-muted-foreground">Chat </span>
            {r.openaiModel || "—"}
          </div>
        </div>
      ),
    },
    {
      key: "voice",
      header: "Voice",
      searchable: (r) => r.openaiVoice,
      render: (r) => <span className="text-sm capitalize">{r.openaiVoice || "—"}</span>,
    },
    {
      key: "links",
      header: "Links",
      searchable: (r) =>
        `${flowName(r.flowId)} ${r.knowledgeIds.join(" ")}`,
      render: (r) => (
        <div className="flex flex-wrap gap-1 max-w-[220px]">
          <Badge variant="secondary" className="text-[10px]">
            Flow: {flowName(r.flowId)}
          </Badge>
          <Badge variant="outline" className="text-[10px]">
            {r.knowledgeIds.length} knowledge
          </Badge>
        </div>
      ),
    },
    {
      key: "config",
      header: "Config",
      searchable: (r) =>
        `${r.twilioConfigured ? "twilio" : ""} ${r.meetingConfigured ? "meeting" : ""}`,
      render: (r) => (
        <div className="flex flex-wrap gap-1">
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              r.twilioConfigured ? "border-med-mint/40 text-med-mint" : "text-muted-foreground"
            )}
          >
            Twilio {r.twilioConfigured ? "✓" : "—"}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              r.meetingConfigured ? "border-med-sky/40 text-med-sky" : "text-muted-foreground"
            )}
          >
            Meeting {r.meetingConfigured ? "✓" : "—"}
          </Badge>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      searchable: (r) => r.status,
      render: (r) => (
        <Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-32 text-right",
      searchable: () => "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="Test agent"
            onClick={() => openTestLab({ agentId: r.id, title: r.title })}
          >
            <FlaskConical className="h-4 w-4 text-primary" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(r)}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="admin-page">
      <PageHeader
        accent={0}
        title="Agents"
        description="Define complete bot behavior — OpenAI models, voice, Twilio, meetings, flows, campaigns, and knowledge."
        actions={
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={openDuplicatePicker}
              disabled={!data.length}
            >
              <Copy className="h-4 w-4 mr-1" /> Duplicate agent
            </Button>
            <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Create agent
            </Button>
          </div>
        }
      />

      <DataTable
        data={data}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search agents…"
      />

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setDuplicateSourceTitle(null);
        }}
      >
        <DialogContent className="max-w-4xl max-h-[92vh] min-h-0 overflow-hidden flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/70">
            <DialogTitle>{editing ? "Edit agent" : "Create agent"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `Step ${step + 1} of ${AGENT_STEPS.length} — ${AGENT_STEPS[step].label}`
                : duplicateSourceTitle
                  ? `Duplicated from “${duplicateSourceTitle}”. Step ${step + 1} of ${AGENT_STEPS.length} — ${AGENT_STEPS[step].label}. Review and save as a new agent.`
                  : `Step ${step + 1} of ${AGENT_STEPS.length} — ${AGENT_STEPS[step].label}. Configure each layer the bot needs to run.`}
            </DialogDescription>
          </DialogHeader>

          <div className="px-6 pt-4 pb-2 space-y-3 border-b border-border/50">
            <div className="flex items-center gap-1.5">
              {AGENT_STEPS.map((sItem, i) => (
                <button
                  key={sItem.id}
                  type="button"
                  title={sItem.label}
                  onClick={() => setStep(i)}
                  className={cn(
                    "h-1.5 flex-1 rounded-full transition-colors",
                    i <= step ? "bg-primary" : "bg-muted"
                  )}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {AGENT_STEPS.map((sItem, i) => (
                <button
                  key={sItem.id}
                  type="button"
                  onClick={() => setStep(i)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] border transition-colors",
                    i === step
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : i < step
                        ? "border-border text-foreground hover:bg-muted/50"
                        : "border-transparent text-muted-foreground hover:bg-muted/40"
                  )}
                >
                  {i + 1}. {sItem.label}
                </button>
              ))}
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 px-6">
              {step === 0 ? (
              <div className="mt-4 pb-4 space-y-4">
                <div className="grid grid-cols-12 gap-4">
                  <Field label="Title *" className="col-span-12 md:col-span-8">
                    <Input
                      value={form.title}
                      onChange={(e) => setForm({ ...form, title: e.target.value })}
                      placeholder="e.g. Outbound campaign agent"
                    />
                  </Field>
                  <Field label="Status" className="col-span-12 md:col-span-4">
                    <Select
                      value={form.status}
                      onValueChange={(v) =>
                        setForm({ ...form, status: v as AgentForm["status"] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[80]">
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Description" className="col-span-12">
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm({ ...form, description: e.target.value })}
                      rows={4}
                      placeholder="What this agent is for…"
                    />
                  </Field>
                </div>
              </div>
            ) : null}

              {step === 1 ? (
              <div className="mt-4 pb-4 space-y-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-muted-foreground">
                    Models are loaded from the OpenAI Models API
                    {models?.source === "api" ? " (live)" : " (fallback list)"}.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingModels}
                    onClick={() =>
                      loadModels(form.openaiApiKey || undefined, editing?.id)
                    }
                  >
                    {loadingModels ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Refresh models
                  </Button>
                </div>
                <div className="grid grid-cols-12 gap-4">
                  <Field
                    label="OpenAI API key"
                    className="col-span-12"
                    hint={
                      editing?.openaiApiKeySet
                        ? "Leave blank to keep the saved key."
                        : "Uses server .env key for model listing if empty."
                    }
                  >
                    <Input
                      type="password"
                      autoComplete="off"
                      value={form.openaiApiKey}
                      onChange={(e) => setForm({ ...form, openaiApiKey: e.target.value })}
                      placeholder={editing?.openaiApiKeySet ? "•••• saved ••••" : "sk-…"}
                    />
                  </Field>
                  <ModelSelect
                    label="Chat model"
                    value={form.openaiModel}
                    options={models?.chat || []}
                    onChange={(v) => setForm({ ...form, openaiModel: v })}
                  />
                  <ModelSelect
                    label="Realtime model"
                    value={form.openaiRealtimeModel}
                    options={models?.realtime || []}
                    onChange={(v) => setForm({ ...form, openaiRealtimeModel: v })}
                    hint="Inbound phone voice session"
                  />
                  <ModelSelect
                    label="Transcription model"
                    value={form.openaiTranscriptionModel}
                    options={models?.transcription || []}
                    onChange={(v) => setForm({ ...form, openaiTranscriptionModel: v })}
                  />
                  <ModelSelect
                    label="TTS model"
                    value={form.openaiTtsModel}
                    options={models?.tts || []}
                    onChange={(v) => setForm({ ...form, openaiTtsModel: v })}
                  />
                  <ModelSelect
                    label="Inbound chat model"
                    value={form.openaiInboundModel}
                    options={models?.chat || []}
                    onChange={(v) => setForm({ ...form, openaiInboundModel: v })}
                    hint="Optional override for non-realtime inbound text"
                  />
                </div>
              </div>
            ) : null}

              {step === 2 ? (
              <div className="mt-4 pb-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  OpenAI Realtime voices. Click a card to select, or preview with the play button.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {voices.map((v) => {
                    const active = form.openaiVoice === v.id;
                    const previewing = previewingVoice === v.id;
                    return (
                      <div
                        key={v.id}
                        className={cn(
                          "rounded-xl border px-4 py-3 transition-colors flex items-start gap-2",
                          active
                            ? "border-primary bg-primary/10 ring-1 ring-primary/30"
                            : "border-border hover:bg-muted/40"
                        )}
                      >
                        <button
                          type="button"
                          className="flex-1 text-left min-w-0"
                          onClick={() => setForm({ ...form, openaiVoice: v.id })}
                        >
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{v.name}</div>
                            {active ? <Check className="h-4 w-4 text-primary shrink-0" /> : null}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {v.description}
                          </div>
                        </button>
                        <Button
                          type="button"
                          size="icon"
                          variant="outline"
                          className="shrink-0 h-8 w-8"
                          title={`Preview ${v.name}`}
                          disabled={previewingVoice !== null && !previewing}
                          onClick={(e) => {
                            e.stopPropagation();
                            void playVoicePreview(v.id);
                          }}
                        >
                          {previewing ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

              {step === 3 ? (
              <div className="mt-4 pb-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Same Twilio account fields used on Clinics — scoped to this agent.
                </p>
                <div className="grid grid-cols-12 gap-4">
                  {(
                    [
                      ["twilioPhoneNumber", "Phone number"],
                      ["twilioCallerId", "Caller ID"],
                      ["twilioAccountSid", "Account SID"],
                      ["twilioAuthToken", "Auth token"],
                      ["twilioApiKeySid", "API key SID"],
                      ["twilioApiKeySecret", "API key secret"],
                      ["twilioTwimlAppSid", "TwiML App SID"],
                    ] as const
                  ).map(([key, label]) => (
                    <Field key={key} label={label} className="col-span-12 md:col-span-6">
                      <Input
                        type={
                          key === "twilioAuthToken" || key === "twilioApiKeySecret"
                            ? "password"
                            : "text"
                        }
                        autoComplete="off"
                        value={form[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        placeholder={
                          key === "twilioAuthToken" && editing?.twilioAuthTokenSet
                            ? "•••• saved ••••"
                            : key === "twilioApiKeySecret" && editing?.twilioApiKeySecretSet
                              ? "•••• saved ••••"
                              : undefined
                        }
                      />
                    </Field>
                  ))}
                </div>
              </div>
            ) : null}

              {step === 4 ? (
              <div className="mt-4 pb-4 space-y-4">
                <div className="grid grid-cols-12 gap-4">
                  <Field label="Meeting provider" className="col-span-12">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["google", "Google Calendar"],
                          ["ecw", "ECW"],
                          ["azul", "Azul"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setForm({ ...form, meetingProvider: value })}
                          className={cn(
                            "rounded-full px-3 py-1.5 text-sm border transition-colors",
                            form.meetingProvider === value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:bg-muted/40"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {form.meetingProvider === "google" ? (
                    <>
                      <Field label="Google client ID" className="col-span-12">
                        <Input
                          value={form.googleClientId}
                          onChange={(e) =>
                            setForm({ ...form, googleClientId: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Google client secret" className="col-span-12 md:col-span-6">
                        <Input
                          type="password"
                          autoComplete="off"
                          value={form.googleClientSecret}
                          onChange={(e) =>
                            setForm({ ...form, googleClientSecret: e.target.value })
                          }
                          placeholder={
                            editing?.googleClientSecretSet ? "•••• saved ••••" : undefined
                          }
                        />
                      </Field>
                      <Field label="Google refresh token" className="col-span-12 md:col-span-6">
                        <Input
                          type="password"
                          autoComplete="off"
                          value={form.googleRefreshToken}
                          onChange={(e) =>
                            setForm({ ...form, googleRefreshToken: e.target.value })
                          }
                          placeholder={
                            editing?.googleRefreshTokenSet ? "•••• saved ••••" : undefined
                          }
                        />
                      </Field>
                      <label className="col-span-12 flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={form.googleCreateMeet}
                          onCheckedChange={(v) =>
                            setForm({ ...form, googleCreateMeet: v === true })
                          }
                        />
                        Also create a Google Meet link
                      </label>
                    </>
                  ) : null}

                  {form.meetingProvider === "ecw" ? (
                    <Field label="ECW API endpoint" className="col-span-12">
                      <Input
                        value={form.ecwApiEndpoint}
                        onChange={(e) =>
                          setForm({ ...form, ecwApiEndpoint: e.target.value })
                        }
                      />
                    </Field>
                  ) : null}

                  {form.meetingProvider === "azul" ? (
                    <Field label="Azul API endpoint" className="col-span-12">
                      <Input
                        value={form.azulApiEndpoint}
                        onChange={(e) =>
                          setForm({ ...form, azulApiEndpoint: e.target.value })
                        }
                      />
                    </Field>
                  ) : null}
                </div>
              </div>
            ) : null}

              {step === 5 ? (
              <div className="mt-4 pb-4 space-y-5">
                <div className="rounded-xl border border-border/70 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">Conversation flow</div>
                      <p className="text-xs text-muted-foreground">
                        Select an existing flow, or create one on the Flows page.
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/flows" target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Create flow
                      </Link>
                    </Button>
                  </div>
                  <Select
                    value={form.flowId || "__none__"}
                    onValueChange={(v) =>
                      setForm({ ...form, flowId: v === "__none__" ? "" : v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select flow" />
                    </SelectTrigger>
                    <SelectContent className="z-[80] max-h-72">
                      <SelectItem value="__none__">No flow</SelectItem>
                      {(links?.flows || []).map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="rounded-xl border border-border/70 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">Knowledge</div>
                      <p className="text-xs text-muted-foreground">
                        Select knowledge entries this agent should use.
                      </p>
                    </div>
                    <Button asChild variant="outline" size="sm">
                      <Link to="/training" target="_blank" rel="noreferrer">
                        <ExternalLink className="h-3.5 w-3.5 mr-1" /> Create knowledge
                      </Link>
                    </Button>
                  </div>
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-border/60 p-2 space-y-1">
                    {(links?.knowledge || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground p-2">No knowledge yet.</p>
                    ) : (
                      (links?.knowledge || []).map((k) => {
                        const checked = form.knowledgeIds.includes(k.id);
                        return (
                          <label
                            key={k.id}
                            className="flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/40 cursor-pointer"
                          >
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() =>
                                setForm({
                                  ...form,
                                  knowledgeIds: toggleId(form.knowledgeIds, k.id),
                                })
                              }
                            />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate">
                                {k.promptKey || `Knowledge #${k.id}`}
                              </span>
                              <span className="block text-[11px] text-muted-foreground line-clamp-2">
                                {k.knowledge}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            ) : null}
            </ScrollArea>

          <DialogFooter className="px-6 py-4 border-t border-border/70 gap-2 sm:gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                openTestLab({
                  agentId: editing?.id,
                  title: form.title || editing?.title,
                  draft: draftFromForm(),
                })
              }
            >
              <FlaskConical className="h-4 w-4 mr-1" /> Test agent
            </Button>
            <div className="flex-1" />
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={step === 0 || saving}
              onClick={() => setStep((prev) => Math.max(0, prev - 1))}
            >
              Back
            </Button>
            {step < AGENT_STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={() => {
                  if (step === 0 && !form.title.trim()) {
                    toast.error("Title is required");
                    return;
                  }
                  setStep((prev) => Math.min(AGENT_STEPS.length - 1, prev + 1));
                }}
                className="bg-gradient-primary text-primary-foreground"
              >
                Next
              </Button>
            ) : (
              <Button
                onClick={save}
                disabled={saving}
                className="bg-gradient-primary text-primary-foreground"
              >
                {saving ? "Saving…" : editing ? "Save changes" : "Create agent"}
              </Button>
            )}
            {editing && step < AGENT_STEPS.length - 1 ? (
              <Button type="button" variant="secondary" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={duplicateOpen} onOpenChange={setDuplicateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Duplicate agent</DialogTitle>
            <DialogDescription>
              Choose an existing agent. We’ll open the create form with its configuration filled
              in so you can adjust and save a new copy.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <Label className="text-xs text-muted-foreground">Source agent</Label>
            <ScrollArea className="max-h-72 rounded-xl border border-border/70">
              <div className="p-2 space-y-1">
                {data.map((agent) => {
                  const selected = duplicateAgentId === agent.id;
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      onClick={() => setDuplicateAgentId(agent.id)}
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
                          selected ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"
                        )}
                      >
                        {selected ? <Check className="h-2.5 w-2.5" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{agent.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {agent.description || "No description"}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <Badge
                            variant={agent.status === "active" ? "default" : "secondary"}
                            className="text-[10px]"
                          >
                            {agent.status}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {agent.openaiVoice || "no voice"}
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setDuplicateOpen(false)}
              disabled={loadingDuplicate}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={confirmDuplicate}
              disabled={!duplicateAgentId || loadingDuplicate}
              className="bg-gradient-primary text-primary-foreground"
            >
              {loadingDuplicate ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" /> Loading…
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4 mr-1" /> Duplicate
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentTestLab
        open={testOpen}
        onOpenChange={setTestOpen}
        agentId={testTarget?.agentId}
        agentTitle={testTarget?.title}
        draft={testTarget?.draft}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete agent?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {confirmDelete?.title} permanently. Linked flows and campaigns are
              not deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
