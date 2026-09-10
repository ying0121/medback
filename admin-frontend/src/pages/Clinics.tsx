import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Pencil,
  Plus,
  Trash2,
  Building2,
  RefreshCw,
  Upload,
  X,
  FlaskConical,
  ExternalLink,
  Bot,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import AgentTestLab from "@/components/admin/AgentTestLab";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listClinics,
  createClinic,
  updateClinic,
  deleteClinic,
  syncClinicsFromExternalApi,
  listAgents,
  type Clinic,
  type Agent,
  DEFAULT_CLINIC_THEME_COLOR,
} from "@/lib/api";
import {
  CLINIC_THEME_COLORS,
  getThemeColorOption,
  normalizeClinicThemeColor,
  themeGradient,
} from "@/lib/themeColors";
import { cn } from "@/lib/utils";
import {
  processClinicAvatarFile,
  CLINIC_AVATAR_MAX_PX,
  CLINIC_AVATAR_MAX_UPLOAD_PX,
} from "@/lib/clinicAvatar";
import { toast } from "sonner";

type ClinicForm = Omit<Clinic, "id">;

const EMPTY: ClinicForm = {
  clinicId: "",
  name: "",
  acronym: "",
  address1: "",
  address2: "",
  state: "",
  city: "",
  zip: "",
  tel: "",
  web: "",
  portal: "",
  themeColor: DEFAULT_CLINIC_THEME_COLOR,
  avatar: null,
  agentId: null,
};

export default function Clinics() {
  const [data, setData] = useState<Clinic[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Clinic | null>(null);
  const [form, setForm] = useState<ClinicForm>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<Clinic | null>(null);
  const [syncingExternal, setSyncingExternal] = useState(false);
  const [savingAgentId, setSavingAgentId] = useState<string | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTarget, setTestTarget] = useState<{ agentId: string; title: string } | null>(
    null
  );
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const refresh = () => listClinics().then(setData);
  const refreshAgents = () =>
    listAgents()
      .then(setAgents)
      .catch(() => setAgents([]));

  useEffect(() => {
    refresh();
    refreshAgents();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY);
    setOpen(true);
  };

  const onAvatarFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      setAvatarUploading(true);
      const dataUrl = await processClinicAvatarFile(file);
      setForm((prev) => ({ ...prev, avatar: dataUrl }));
      toast.success("Avatar loaded");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not load image";
      toast.error(msg);
    } finally {
      setAvatarUploading(false);
    }
  };

  const clearAvatar = () => {
    setForm((prev) => ({ ...prev, avatar: null }));
    toast.message("Avatar cleared");
  };

  const openEdit = (c: Clinic) => {
    setEditing(c);
    const { id, ...rest } = c;
    setForm({
      ...EMPTY,
      ...rest,
      themeColor: normalizeClinicThemeColor(rest.themeColor),
      agentId: rest.agentId || null,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    const payload = {
      ...form,
      agentId: form.agentId || null,
    };
    if (editing) {
      await updateClinic(editing.id, payload);
      toast.success("Clinic updated");
    } else {
      await createClinic(payload);
      toast.success("Clinic added");
    }
    setOpen(false);
    refresh();
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    await deleteClinic(confirmDelete.id);
    toast.success("Clinic deleted");
    setConfirmDelete(null);
    refresh();
  };

  const assignAgent = async (clinic: Clinic, agentId: string | null) => {
    try {
      setSavingAgentId(clinic.id);
      const updated = await updateClinic(clinic.id, {
        ...clinic,
        agentId,
      });
      setData((prev) => prev.map((c) => (c.id === clinic.id ? { ...c, ...updated } : c)));
      toast.success(agentId ? "Agent assigned" : "Agent cleared");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to assign agent");
    } finally {
      setSavingAgentId(null);
    }
  };

  const openTestForClinic = (clinic: Clinic) => {
    if (!clinic.agentId) {
      toast.error("Assign an agent first");
      return;
    }
    const agent = agents.find((a) => a.id === clinic.agentId);
    setTestTarget({
      agentId: clinic.agentId,
      title: agent?.title || clinic.agentTitle || "Agent",
    });
    setTestOpen(true);
  };

  const onSyncExternal = async () => {
    try {
      setSyncingExternal(true);
      const result = await syncClinicsFromExternalApi();
      toast.success(`Clinics synced. Created ${result.created}, skipped ${result.skipped}.`);
      refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to sync clinics from external API.");
    } finally {
      setSyncingExternal(false);
    }
  };

  const activeAgents = agents.filter((a) => a.status === "active");
  const agentOptions = agents;

  const columns: Column<Clinic>[] = [
    {
      key: "name",
      header: "Clinic",
      searchable: (r) => `${r.name} ${r.acronym} ${r.clinicId}`,
      render: (r) => (
        <div className="min-w-[180px]">
          <div className="font-medium truncate">{r.name}</div>
          <div className="text-xs text-muted-foreground">
            {r.acronym} · {r.clinicId}
          </div>
        </div>
      ),
    },
    {
      key: "avatar",
      header: "Avatar",
      className: "w-[88px]",
      searchable: () => "",
      render: (r) => <ClinicAvatarThumb avatar={r.avatar} name={r.name} size="sm" />,
    },
    {
      key: "address",
      header: "Address",
      searchable: (r) => `${r.address1} ${r.city} ${r.state}`,
      render: (r) => (
        <div className="text-sm">
          <div>
            {r.address1}
            {r.address2 ? `, ${r.address2}` : ""}
          </div>
          <div className="text-muted-foreground text-xs">
            {r.city}, {r.state} {r.zip}
          </div>
        </div>
      ),
    },
    {
      key: "tel",
      header: "Phone",
      searchable: (r) => r.tel,
      render: (r) => <span className="font-mono text-xs">{r.tel}</span>,
    },
    {
      key: "agent",
      header: "Agent",
      className: "min-w-[240px]",
      searchable: (r) => `${r.agentTitle || ""} ${r.agentId || ""}`,
      render: (r) => (
        <div className="flex items-center gap-2 max-w-[320px]">
          <Select
            value={r.agentId || "__none__"}
            disabled={savingAgentId === r.id}
            onValueChange={(v) => void assignAgent(r, v === "__none__" ? null : v)}
          >
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Select agent" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">No agent</SelectItem>
              {agentOptions.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.title}
                  {a.status !== "active" ? " (inactive)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="outline"
            className="shrink-0 h-9 w-9"
            title={r.agentId ? "Test assigned agent" : "Assign an agent to test"}
            disabled={!r.agentId}
            onClick={() => openTestForClinic(r)}
          >
            <FlaskConical className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
    {
      key: "actions",
      header: "",
      className: "w-24 text-right",
      searchable: () => "",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
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
        accent={1}
        title="Clinic Management"
        description="Assign an agent to each clinic. Bot voice, Twilio, meetings, and flows are configured on the agent."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onSyncExternal} disabled={syncingExternal}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncingExternal ? "animate-spin" : ""}`} />
              {syncingExternal ? "Syncing..." : "Import from API"}
            </Button>
            <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Add clinic
            </Button>
          </div>
        }
      />

      <DataTable
        data={data}
        columns={columns}
        rowKey={(r) => r.id}
        searchPlaceholder="Search clinics by name, city, ID…"
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[90vh] min-h-0 max-w-2xl flex-col gap-0 overflow-hidden p-6 sm:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>{editing ? "Edit clinic" : "Add new clinic"}</DialogTitle>
            <DialogDescription>
              Clinic profile and which agent handles calls and chat for this location.
            </DialogDescription>
          </DialogHeader>
          <div
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-6 px-6 [scrollbar-gutter:stable]"
            role="region"
            aria-label="Clinic form"
          >
            <div className="grid grid-cols-12 gap-x-4 gap-y-4 py-2 pr-2 pb-4">
              <Field label="Clinic ID" className="col-span-12 sm:col-span-3">
                <Input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1}
                  value={form.clinicId}
                  onChange={(e) =>
                    setForm({ ...form, clinicId: e.target.value.replace(/[^\d]/g, "") })
                  }
                  placeholder="e.g. 1001"
                />
              </Field>
              <Field label="Name *" className="col-span-12 sm:col-span-6">
                <Input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </Field>
              <Field label="Acronym" className="col-span-12 sm:col-span-3">
                <Input
                  value={form.acronym}
                  onChange={(e) => setForm({ ...form, acronym: e.target.value })}
                />
              </Field>

              <Field label="Assigned agent" className="col-span-12">
                <div className="flex flex-wrap items-center gap-2">
                  <Select
                    value={form.agentId || "__none__"}
                    onValueChange={(v) =>
                      setForm({ ...form, agentId: v === "__none__" ? null : v })
                    }
                  >
                    <SelectTrigger className="flex-1 min-w-[200px]">
                      <SelectValue placeholder="Select agent" />
                    </SelectTrigger>
                    <SelectContent className="z-[80]">
                      <SelectItem value="__none__">No agent</SelectItem>
                      {agentOptions.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          <span className="inline-flex items-center gap-2">
                            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                            {a.title}
                            {a.status !== "active" ? " (inactive)" : ""}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/agents" target="_blank" rel="noreferrer">
                      <ExternalLink className="h-3.5 w-3.5 mr-1" /> Manage agents
                    </Link>
                  </Button>
                </div>
                {activeAgents.length === 0 ? (
                  <p className="text-xs text-muted-foreground mt-1.5">
                    No active agents yet — create one on the Agents page.
                  </p>
                ) : null}
              </Field>

              <Field label="Avatar" className="col-span-12">
                <div className="flex flex-wrap items-start gap-4">
                  <ClinicAvatarThumb avatar={form.avatar} name={form.name || "Clinic"} size="lg" />
                  <div className="space-y-2 min-w-[200px]">
                    <input
                      ref={avatarFileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={onAvatarFileChange}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={avatarUploading}
                      onClick={() => avatarFileInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4 mr-1" />
                      {avatarUploading ? "Processing…" : "Upload image"}
                    </Button>
                    {form.avatar ? (
                      <Button type="button" variant="ghost" size="sm" onClick={clearAvatar}>
                        <X className="h-4 w-4 mr-1" /> Clear
                      </Button>
                    ) : null}
                    <p className="text-xs text-muted-foreground max-w-xs">
                      Max upload {CLINIC_AVATAR_MAX_UPLOAD_PX}px; stored at {CLINIC_AVATAR_MAX_PX}×
                      {CLINIC_AVATAR_MAX_PX}.
                    </p>
                  </div>
                </div>
              </Field>

              <Field label="Address 1" className="col-span-12 sm:col-span-6">
                <Input
                  value={form.address1}
                  onChange={(e) => setForm({ ...form, address1: e.target.value })}
                />
              </Field>
              <Field label="Address 2" className="col-span-12 sm:col-span-6">
                <Input
                  value={form.address2 || ""}
                  onChange={(e) => setForm({ ...form, address2: e.target.value })}
                />
              </Field>
              <Field label="City" className="col-span-12 sm:col-span-4">
                <Input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                />
              </Field>
              <Field label="State" className="col-span-12 sm:col-span-4">
                <Input
                  value={form.state}
                  onChange={(e) => setForm({ ...form, state: e.target.value })}
                />
              </Field>
              <Field label="ZIP" className="col-span-12 sm:col-span-4">
                <Input
                  value={form.zip}
                  onChange={(e) => setForm({ ...form, zip: e.target.value })}
                />
              </Field>
              <Field label="Phone" className="col-span-12 sm:col-span-4">
                <Input
                  value={form.tel}
                  onChange={(e) => setForm({ ...form, tel: e.target.value })}
                />
              </Field>
              <Field label="Website" className="col-span-12 sm:col-span-4">
                <Input
                  value={form.web || ""}
                  onChange={(e) => setForm({ ...form, web: e.target.value })}
                />
              </Field>
              <Field label="Portal" className="col-span-12 sm:col-span-4">
                <Input
                  value={form.portal || ""}
                  onChange={(e) => setForm({ ...form, portal: e.target.value })}
                />
              </Field>

              <Field label="Theme color" className="col-span-12">
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {CLINIC_THEME_COLORS.map((value) => {
                    const opt = getThemeColorOption(value);
                    const selected = form.themeColor === value;
                    return (
                      <button
                        key={value}
                        type="button"
                        title={opt.value}
                        onClick={() => setForm({ ...form, themeColor: value })}
                        className={cn(
                          "rounded-lg border p-1.5 text-left transition-colors",
                          selected
                            ? "border-primary ring-1 ring-primary/40"
                            : "border-border hover:bg-muted/40"
                        )}
                      >
                        <div
                          className="h-7 w-full rounded-md"
                          style={{ background: themeGradient(opt.from, opt.to) }}
                        />
                        <span className="mt-1 block truncate text-[10px] leading-tight text-muted-foreground">
                          {opt.value}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Sent to the chat app on connect as <code className="text-xs">themeColor</code>.
                </p>
              </Field>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border/60 pt-4 sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} className="bg-gradient-primary text-primary-foreground">
              {editing ? "Save changes" : "Create clinic"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AgentTestLab
        open={testOpen}
        onOpenChange={setTestOpen}
        agentId={testTarget?.agentId}
        agentTitle={testTarget?.title}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => !v && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes {confirmDelete?.name} permanently.
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

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function ClinicAvatarThumb({
  avatar,
  name,
  size = "sm",
}: {
  avatar?: string | null;
  name: string;
  size?: "sm" | "lg";
}) {
  const dim = size === "lg" ? "h-[250px] w-[250px]" : "h-10 w-10";
  const icon = size === "lg" ? "h-12 w-12" : "h-5 w-5";
  const label = name.trim() || "Clinic";

  if (avatar) {
    return (
      <img
        src={avatar}
        alt={`${label} avatar`}
        className={cn(dim, "rounded-lg object-cover border border-border/60 bg-muted shrink-0")}
      />
    );
  }

  return (
    <div
      className={cn(
        dim,
        "rounded-lg border border-border/60 bg-muted flex items-center justify-center text-muted-foreground shrink-0"
      )}
      aria-label={`${label} avatar placeholder`}
    >
      <Building2 className={icon} />
    </div>
  );
}
