import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Pencil, Plus, Trash2, Building2, RefreshCw, AudioLines, Phone, Eye, EyeOff, MessageSquareText, Upload, X } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import VoicePickerDialog from "@/components/admin/VoicePickerDialog";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listClinics,
  createClinic,
  updateClinic,
  deleteClinic,
  syncClinicsFromExternalApi,
  getClinicTwilioConfig,
  updateClinicTwilioConfig,
  updateClinicBotVoice,
  getClinicGreetings,
  updateClinicGreetings,
  previewClinicGreeting,
  type Clinic,
  type ClinicTwilioConfigInput,
  type GreetingPlaceholder,
  DEFAULT_CLINIC_THEME_COLOR,
  type ClinicThemeColor,
} from "@/lib/api";
import {
  CLINIC_THEME_COLORS,
  getThemeColorOption,
  normalizeClinicThemeColor,
  themeGradient,
} from "@/lib/themeColors";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  processClinicAvatarFile,
  CLINIC_AVATAR_MAX_PX,
  CLINIC_AVATAR_MAX_UPLOAD_PX,
} from "@/lib/clinicAvatar";
import { toast } from "sonner";

type ClinicForm = Omit<Clinic, "id">;

const EMPTY: ClinicForm = {
  clinicId: "",
  name: "", acronym: "", address1: "", address2: "", state: "", city: "", zip: "",
  tel: "", web: "", portal: "",
  themeColor: DEFAULT_CLINIC_THEME_COLOR,
  avatar: null,
};

const EMPTY_TWILIO_FORM: ClinicTwilioConfigInput = {
  twilioPhoneNumber: "",
  twilioCallerId: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioApiKeySid: "",
  twilioApiKeySecret: "",
  twilioTwimlAppSid: ""
};

function normalizeUsPhoneForSave(value: string) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length === 10) return `+1${digits}`;
  return "";
}

function formatUsPhoneForDisplay(value: string) {
  const digits = String(value || "").replace(/[^\d]/g, "");
  const local = digits.startsWith("1") ? digits.slice(1, 11) : digits.slice(0, 10);
  const a = local.slice(0, 3);
  const b = local.slice(3, 6);
  const c = local.slice(6, 10);
  if (!a) return "+1";
  if (!b) return `+1 (${a}`;
  if (!c) return `+1 (${a}) ${b}`;
  return `+1 (${a}) ${b}-${c}`;
}

export default function Clinics() {
  const [data, setData] = useState<Clinic[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Clinic | null>(null);
  const [form, setForm] = useState<ClinicForm>(EMPTY);
  const [confirmDelete, setConfirmDelete] = useState<Clinic | null>(null);
  const [syncingExternal, setSyncingExternal] = useState(false);
  const [twilioClinic, setTwilioClinic] = useState<Clinic | null>(null);
  const [twilioForm, setTwilioForm] = useState<ClinicTwilioConfigInput>(EMPTY_TWILIO_FORM);
  const [twilioPhoneDisplay, setTwilioPhoneDisplay] = useState("+1");
  const [savingTwilio, setSavingTwilio] = useState(false);
  const [loadingTwilio, setLoadingTwilio] = useState(false);
  const [voiceModalClinic, setVoiceModalClinic] = useState<Clinic | null>(null);
  const [savingVoice, setSavingVoice] = useState(false);

  const [greetingClinic, setGreetingClinic] = useState<Clinic | null>(null);
  const [greetingTab, setGreetingTab] = useState<"inbound" | "chat">("inbound");
  const [inboundGreetingDraft, setInboundGreetingDraft] = useState("");
  const [chatGreetingDraft, setChatGreetingDraft] = useState("");
  const [inboundGreetingDefault, setInboundGreetingDefault] = useState("");
  const [chatGreetingDefault, setChatGreetingDefault] = useState("");
  const [greetingPlaceholders, setGreetingPlaceholders] = useState<GreetingPlaceholder[]>([]);
  const [inboundGreetingPreview, setInboundGreetingPreview] = useState("");
  const [chatGreetingPreview, setChatGreetingPreview] = useState("");
  const [loadingGreeting, setLoadingGreeting] = useState(false);
  const [savingGreeting, setSavingGreeting] = useState(false);
  const greetingPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    if (!greetingClinic) return;
    if (greetingPreviewTimerRef.current) clearTimeout(greetingPreviewTimerRef.current);
    const draft = greetingTab === "chat" ? chatGreetingDraft : inboundGreetingDraft;
    greetingPreviewTimerRef.current = setTimeout(() => {
      previewClinicGreeting(greetingClinic.id, greetingTab, draft)
        .then((text) => {
          if (greetingTab === "chat") setChatGreetingPreview(text);
          else setInboundGreetingPreview(text);
        })
        .catch(() => {
          /* keep last preview */
        });
    }, 350);
    return () => {
      if (greetingPreviewTimerRef.current) clearTimeout(greetingPreviewTimerRef.current);
    };
  }, [greetingClinic, greetingTab, inboundGreetingDraft, chatGreetingDraft]);

  const refresh = () => listClinics().then(setData);
  useEffect(() => { refresh(); }, []);

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
      themeColor: normalizeClinicThemeColor(rest.themeColor)
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error("Name is required");
    if (editing) {
      await updateClinic(editing.id, form);
      toast.success("Clinic updated");
    } else {
      await createClinic(form);
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

  const openGreeting = async (c: Clinic) => {
    setGreetingClinic(c);
    setGreetingTab("inbound");
    setInboundGreetingDraft("");
    setChatGreetingDraft("");
    setInboundGreetingPreview("");
    setChatGreetingPreview("");
    setGreetingPlaceholders([]);
    try {
      setLoadingGreeting(true);
      const data = await getClinicGreetings(c.id);
      setInboundGreetingDraft(data.inbound.greeting);
      setChatGreetingDraft(data.chat.greeting);
      setInboundGreetingDefault(data.defaultInboundGreeting);
      setChatGreetingDefault(data.defaultChatGreeting);
      setGreetingPlaceholders(data.placeholders);
      setInboundGreetingPreview(data.inbound.resolvedPreview);
      setChatGreetingPreview(data.chat.resolvedPreview);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load greetings";
      toast.error(msg);
      setGreetingClinic(null);
    } finally {
      setLoadingGreeting(false);
    }
  };

  const insertGreetingToken = (token: string) => {
    const apply = (prev: string) => {
      const trimmed = prev.trimEnd();
      return trimmed ? `${trimmed} ${token}` : token;
    };
    if (greetingTab === "chat") setChatGreetingDraft(apply);
    else setInboundGreetingDraft(apply);
  };

  const resetActiveGreetingToDefault = () => {
    if (greetingTab === "chat") {
      setChatGreetingDraft("");
      toast.message("Cleared custom chat greeting — system default will be used on save.");
    } else {
      setInboundGreetingDraft("");
      toast.message("Cleared custom inbound greeting — system default will be used on save.");
    }
  };

  const saveGreeting = async () => {
    if (!greetingClinic) return;
    try {
      setSavingGreeting(true);
      const result = await updateClinicGreetings(greetingClinic.id, {
        inboundGreeting: inboundGreetingDraft.trim(),
        chatGreeting: chatGreetingDraft.trim()
      });
      setInboundGreetingPreview(result.inbound.resolvedPreview);
      setChatGreetingPreview(result.chat.resolvedPreview);
      toast.success("Greetings saved");
      setGreetingClinic(null);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save greetings";
      toast.error(msg);
    } finally {
      setSavingGreeting(false);
    }
  };

  const openTwilio = async (c: Clinic) => {
    setTwilioClinic(c);
    setTwilioForm(EMPTY_TWILIO_FORM);
    setTwilioPhoneDisplay("+1");
    try {
      setLoadingTwilio(true);
      const data = await getClinicTwilioConfig(c.id);
      setTwilioForm({
        ...data,
        twilioPhoneNumber: normalizeUsPhoneForSave(data.twilioPhoneNumber) || data.twilioPhoneNumber,
        twilioCallerId: String(data.twilioCallerId || "")
      });
      setTwilioPhoneDisplay(formatUsPhoneForDisplay(data.twilioPhoneNumber || ""));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load Twilio settings";
      toast.error(msg);
    } finally {
      setLoadingTwilio(false);
    }
  };

  const saveVoiceSelection = async (voiceId: string) => {
    if (!voiceModalClinic) return;
    try {
      setSavingVoice(true);
      await updateClinicBotVoice(voiceModalClinic.id, voiceId);
      toast.success("Bot voice saved");
      setVoiceModalClinic(null);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save voice";
      toast.error(msg);
      throw err;
    } finally {
      setSavingVoice(false);
    }
  };

  const saveTwilio = async () => {
    if (!twilioClinic) return;
    const payload: ClinicTwilioConfigInput = {
      twilioPhoneNumber: twilioForm.twilioPhoneNumber.trim(),
      twilioCallerId: twilioForm.twilioCallerId.trim(),
      twilioAccountSid: twilioForm.twilioAccountSid.trim(),
      twilioAuthToken: twilioForm.twilioAuthToken.trim(),
      twilioApiKeySid: twilioForm.twilioApiKeySid.trim(),
      twilioApiKeySecret: twilioForm.twilioApiKeySecret.trim(),
      twilioTwimlAppSid: twilioForm.twilioTwimlAppSid.trim()
    };
    if (Object.values(payload).some((value) => !value)) {
      return toast.error("All Twilio fields are required");
    }
    try {
      setSavingTwilio(true);
      await updateClinicTwilioConfig(twilioClinic.id, payload);
      toast.success("Twilio account saved");
      setTwilioClinic(null);
      setTwilioForm(EMPTY_TWILIO_FORM);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save Twilio settings";
      toast.error(msg);
    } finally {
      setSavingTwilio(false);
    }
  };

  const onSyncExternal = async () => {
    try {
      setSyncingExternal(true);
      const result = await syncClinicsFromExternalApi();
      toast.success(
        `Clinics synced. Created ${result.created}, skipped ${result.skipped}.`
      );
      refresh();
    } catch (err: any) {
      toast.error(err?.message || "Failed to sync clinics from external API.");
    } finally {
      setSyncingExternal(false);
    }
  };

  const columns: Column<Clinic>[] = [
    {
      key: "name",
      header: "Clinic",
      searchable: (r) => `${r.name} ${r.acronym} ${r.clinicId}`,
      render: (r) => (
        <div className="min-w-[180px]">
          <div className="font-medium truncate">{r.name}</div>
          <div className="text-xs text-muted-foreground">{r.acronym} · {r.clinicId}</div>
        </div>
      ),
    },
    {
      key: "avatar",
      header: "Avatar",
      className: "w-[88px]",
      searchable: () => "",
      render: (r) => (
        <ClinicAvatarThumb avatar={r.avatar} name={r.name} size="sm" />
      ),
    },
    { key: "address", header: "Address", searchable: (r) => `${r.address1} ${r.city} ${r.state}`, render: (r) => (
      <div className="text-sm">
        <div>{r.address1}{r.address2 ? `, ${r.address2}` : ""}</div>
        <div className="text-muted-foreground text-xs">{r.city}, {r.state} {r.zip}</div>
      </div>
    )},
    { key: "tel", header: "Phone", searchable: (r) => r.tel, render: (r) => <span className="font-mono text-xs">{r.tel}</span> },
    { key: "web", header: "Web", searchable: (r) => r.web ?? "", render: (r) => r.web ? (
      <a href={r.web} target="_blank" rel="noreferrer" className="text-primary hover:underline text-sm truncate inline-block max-w-[180px]">{r.web}</a>
    ) : <span className="text-muted-foreground text-sm">—</span> },
    { key: "actions", header: "", className: "w-64 text-right", searchable: () => "", render: (r) => (
      <div className="flex items-center justify-end gap-1">
        <Button
          size="icon"
          variant="ghost"
          onClick={() => openGreeting(r)}
          title={
            r.greetingConfigured && r.chatGreetingConfigured
              ? "Inbound & chat greetings — custom"
              : r.greetingConfigured
                ? "Inbound greeting — custom"
                : r.chatGreetingConfigured
                  ? "Chat greeting — custom"
                  : "Greetings — using defaults"
          }
        >
          <MessageSquareText
            className={`h-4 w-4 ${
              r.greetingConfigured || r.chatGreetingConfigured
                ? "text-sky-600"
                : "text-muted-foreground"
            }`}
          />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => openTwilio(r)}
          title={r.twilioConfigured ? "Twilio account — configured" : "Twilio account"}
        >
          <Phone className={`h-4 w-4 ${r.twilioConfigured ? "text-emerald-600" : "text-muted-foreground"}`} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setVoiceModalClinic(r)}
          title={
            r.botVoiceConfigured
              ? `Bot voice — ${r.openaiVoice || "configured"}`
              : "Choose bot voice (OpenAI Realtime)"
          }
        >
          <AudioLines className={`h-4 w-4 ${r.botVoiceConfigured ? "text-violet-600" : "text-muted-foreground"}`} />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => setConfirmDelete(r)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
      </div>
    )},
  ];

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Clinic Management"
        description="Add, update and remove clinics in the network."
        actions={(
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onSyncExternal} disabled={syncingExternal}>
              <RefreshCw className={`h-4 w-4 mr-1 ${syncingExternal ? "animate-spin" : ""}`} />
              {syncingExternal ? "Syncing..." : "Import from API"}
            </Button>
            <Button onClick={openCreate} className="bg-gradient-primary text-primary-foreground">
              <Plus className="h-4 w-4 mr-1" /> Add clinic
            </Button>
          </div>
        )}
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
              Set clinic information including editable clinic ID.
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
                  onChange={(e) => setForm({ ...form, clinicId: e.target.value.replace(/[^\d]/g, "") })}
                  placeholder="e.g. 1001"
                />
              </Field>
              <Field label="Name *" className="col-span-12 sm:col-span-6">
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </Field>
              <Field label="Acronym" className="col-span-12 sm:col-span-3">
                <Input value={form.acronym} onChange={(e) => setForm({ ...form, acronym: e.target.value })} />
              </Field>
              <Field label="Avatar" className="col-span-12">
                <div className="flex flex-col sm:flex-row gap-4 items-start">
                  <ClinicAvatarThumb avatar={form.avatar} name={form.name || "Clinic"} size="lg" />
                  <div className="flex flex-col gap-2 pt-1">
                    <input
                      ref={avatarFileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/gif,image/webp"
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
                      <Upload className="h-4 w-4 mr-1.5" />
                      {avatarUploading ? "Processing…" : "Upload image"}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={!form.avatar || avatarUploading}
                      onClick={clearAvatar}
                    >
                      <X className="h-4 w-4 mr-1.5" />
                      Clear avatar
                    </Button>
                    <p className="text-xs text-muted-foreground max-w-xs">
                      JPEG, PNG, GIF, or WebP. Max upload {CLINIC_AVATAR_MAX_UPLOAD_PX}×{CLINIC_AVATAR_MAX_UPLOAD_PX} px
                      (larger images are rejected). Saved up to {CLINIC_AVATAR_MAX_PX}×{CLINIC_AVATAR_MAX_PX} px.
                    </p>
                  </div>
                </div>
              </Field>
              <Field label="Address 1" className="col-span-12 sm:col-span-6">
                <Input value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} />
              </Field>
              <Field label="Address 2" className="col-span-12 sm:col-span-6">
                <Input value={form.address2 ?? ""} onChange={(e) => setForm({ ...form, address2: e.target.value })} />
              </Field>
              <Field label="City" className="col-span-12 sm:col-span-3">
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
              <Field label="State" className="col-span-12 sm:col-span-3">
                <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
              </Field>
              <Field label="ZIP" className="col-span-12 sm:col-span-3">
                <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
              </Field>
              <Field label="Tel" className="col-span-12 sm:col-span-3">
                <Input value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} />
              </Field>
              <Field label="Web" className="col-span-12 sm:col-span-6">
                <Input value={form.web ?? ""} onChange={(e) => setForm({ ...form, web: e.target.value })} />
              </Field>
              <Field label="Portal" className="col-span-12 sm:col-span-6">
                <Input value={form.portal ?? ""} onChange={(e) => setForm({ ...form, portal: e.target.value })} />
              </Field>
              <Field label="Theme color" className="col-span-12">
                <div className="flex items-center gap-3 mb-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                  <div
                    className="h-9 w-14 shrink-0 rounded-md shadow-sm"
                    style={{
                      background: themeGradient(
                        getThemeColorOption(form.themeColor).from,
                        getThemeColorOption(form.themeColor).to
                      )
                    }}
                    aria-hidden
                  />
                  <div className="min-w-0 text-sm">
                    <span className="font-medium">{getThemeColorOption(form.themeColor).label}</span>
                    <span className="text-muted-foreground ml-2 font-mono text-xs">
                      {form.themeColor || DEFAULT_CLINIC_THEME_COLOR}
                    </span>
                  </div>
                </div>
                <div
                  className="grid grid-cols-4 sm:grid-cols-8 gap-2"
                  role="radiogroup"
                  aria-label="Theme color"
                >
                  {CLINIC_THEME_COLORS.map((opt) => {
                    const selected = (form.themeColor || DEFAULT_CLINIC_THEME_COLOR) === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        title={`${opt.label} (${opt.from} → ${opt.to})`}
                        onClick={() => setForm({ ...form, themeColor: opt.value as ClinicThemeColor })}
                        className={cn(
                          "rounded-lg border-2 p-1.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "border-primary shadow-sm" : "border-transparent hover:border-border"
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
                  Sent to the chat app on connect as <code className="text-xs">themeColor</code> (one of 16 palette ids).
                </p>
              </Field>
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t border-border/60 pt-4 sm:justify-end">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-gradient-primary text-primary-foreground">{editing ? "Save changes" : "Create clinic"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VoicePickerDialog
        open={!!voiceModalClinic}
        onOpenChange={(o) => {
          if (!o) setVoiceModalClinic(null);
        }}
        clinic={voiceModalClinic ? { id: voiceModalClinic.id, name: voiceModalClinic.name } : null}
        initialSelectedVoiceId={voiceModalClinic?.openaiVoice || ""}
        saving={savingVoice}
        onSave={saveVoiceSelection}
      />

      <Dialog
        open={!!twilioClinic}
        onOpenChange={(o) => {
          if (!o) {
            setTwilioClinic(null);
            setTwilioForm(EMPTY_TWILIO_FORM);
            setTwilioPhoneDisplay("+1");
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Twilio account</DialogTitle>
            <DialogDescription>
              {twilioClinic ? (
                <>
                  Set Twilio credentials for <strong>{twilioClinic.name}</strong>. These are saved per clinic.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-1">
            <Field label="Twilio phone number *">
              <Input
                autoComplete="off"
                placeholder="+1 (555) 123-4567"
                value={twilioPhoneDisplay}
                onChange={(e) => {
                  const raw = e.target.value || "";
                  setTwilioPhoneDisplay(formatUsPhoneForDisplay(raw));
                  setTwilioForm({
                    ...twilioForm,
                    twilioPhoneNumber: normalizeUsPhoneForSave(raw)
                  });
                }}
              />
            </Field>
            <Field label="Caller ID (shown to doctor) *">
              <Input
                autoComplete="off"
                placeholder="Clinic, phone number, or text"
                value={twilioForm.twilioCallerId}
                onChange={(e) => {
                  setTwilioForm({
                    ...twilioForm,
                    twilioCallerId: e.target.value
                  });
                }}
              />
            </Field>
            <Field label="Twilio account SID *">
              <SecretInput
                autoComplete="off"
                placeholder="AC..."
                value={twilioForm.twilioAccountSid}
                onChange={(e) => setTwilioForm({ ...twilioForm, twilioAccountSid: e.target.value })}
              />
            </Field>
            <Field label="Twilio auth token *">
              <SecretInput
                autoComplete="off"
                value={twilioForm.twilioAuthToken}
                onChange={(e) => setTwilioForm({ ...twilioForm, twilioAuthToken: e.target.value })}
              />
            </Field>
            <Field label="Twilio API key SID *">
              <SecretInput
                autoComplete="off"
                placeholder="SK..."
                value={twilioForm.twilioApiKeySid}
                onChange={(e) => setTwilioForm({ ...twilioForm, twilioApiKeySid: e.target.value })}
              />
            </Field>
            <Field label="Twilio API key secret *">
              <SecretInput
                autoComplete="off"
                value={twilioForm.twilioApiKeySecret}
                onChange={(e) => setTwilioForm({ ...twilioForm, twilioApiKeySecret: e.target.value })}
              />
            </Field>
            <Field label="Twilio TwiML app SID *">
              <SecretInput
                autoComplete="off"
                placeholder="AP..."
                value={twilioForm.twilioTwimlAppSid}
                onChange={(e) => setTwilioForm({ ...twilioForm, twilioTwimlAppSid: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setTwilioClinic(null);
                setTwilioForm(EMPTY_TWILIO_FORM);
                setTwilioPhoneDisplay("+1");
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveTwilio} disabled={savingTwilio || loadingTwilio} className="bg-gradient-primary text-primary-foreground">
              {loadingTwilio ? "Loading..." : savingTwilio ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!greetingClinic}
        onOpenChange={(o) => {
          if (!o) setGreetingClinic(null);
        }}
      >
        <DialogContent className="flex max-h-[90vh] min-h-0 max-w-2xl flex-col gap-0 overflow-hidden p-6 sm:max-w-2xl">
          <DialogHeader className="shrink-0">
            <DialogTitle>Clinic greetings</DialogTitle>
            <DialogDescription>
              {greetingClinic ? (
                <>
                  Separate scripts for <strong>{greetingClinic.name}</strong>: inbound phone calls and web chat.
                  Leave empty to use each system default.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <Tabs
            value={greetingTab}
            onValueChange={(v) => setGreetingTab(v as "inbound" | "chat")}
            className="flex flex-1 min-h-0 flex-col"
          >
            <TabsList className="grid w-full grid-cols-2 shrink-0">
              <TabsTrigger value="inbound">Inbound phone</TabsTrigger>
              <TabsTrigger value="chat">Web chat</TabsTrigger>
            </TabsList>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-6 px-6 mt-4 [scrollbar-gutter:stable]">
              <TabsContent value="inbound" className="mt-0 space-y-4 pb-4 focus-visible:outline-none">
                <GreetingTabPanel
                  draft={inboundGreetingDraft}
                  setDraft={setInboundGreetingDraft}
                  preview={inboundGreetingPreview}
                  defaultText={inboundGreetingDefault}
                  placeholders={greetingPlaceholders}
                  loading={loadingGreeting}
                  onInsertToken={insertGreetingToken}
                  previewLabel="Caller will hear"
                  placeholderHint="Hello from $clinic_name$. How can I help you today?"
                />
              </TabsContent>
              <TabsContent value="chat" className="mt-0 space-y-4 pb-4 focus-visible:outline-none">
                <GreetingTabPanel
                  draft={chatGreetingDraft}
                  setDraft={setChatGreetingDraft}
                  preview={chatGreetingPreview}
                  defaultText={chatGreetingDefault}
                  placeholders={greetingPlaceholders}
                  loading={loadingGreeting}
                  onInsertToken={insertGreetingToken}
                  previewLabel="Chat user will see"
                  placeholderHint="Welcome to $clinic_name$. How can we help you?"
                />
              </TabsContent>
            </div>
          </Tabs>
          <DialogFooter className="shrink-0 gap-2 border-t border-border/60 pt-4 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={resetActiveGreetingToDefault}
              disabled={loadingGreeting || savingGreeting}
            >
              Use default (active tab)
            </Button>
            <Button variant="outline" onClick={() => setGreetingClinic(null)}>
              Cancel
            </Button>
            <Button
              onClick={saveGreeting}
              disabled={loadingGreeting || savingGreeting}
              className="bg-gradient-primary text-primary-foreground"
            >
              {savingGreeting ? "Saving…" : "Save both greetings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete clinic?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove <strong>{confirmDelete?.name}</strong>. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GreetingTabPanel({
  draft,
  setDraft,
  preview,
  defaultText,
  placeholders,
  loading,
  onInsertToken,
  previewLabel,
  placeholderHint
}: {
  draft: string;
  setDraft: Dispatch<SetStateAction<string>>;
  preview: string;
  defaultText: string;
  placeholders: GreetingPlaceholder[];
  loading: boolean;
  onInsertToken: (token: string) => void;
  previewLabel: string;
  placeholderHint: string;
}) {
  return (
    <>
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Placeholders — click to insert</Label>
        <div className="flex flex-wrap gap-2">
          {placeholders.map((p) => (
            <Button
              key={p.token}
              type="button"
              variant="outline"
              size="sm"
              className="h-8 font-mono text-xs"
              onClick={() => onInsertToken(p.token)}
              title={p.description}
            >
              {p.token}
            </Button>
          ))}
        </div>
      </div>
      <Field label="Greeting script">
        <Textarea
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={defaultText || placeholderHint}
          disabled={loading}
          className="resize-y min-h-[120px]"
        />
      </Field>
      <div className="rounded-xl border bg-muted/40 p-4 space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {previewLabel}
        </div>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {loading ? "Loading preview…" : preview || "—"}
        </p>
        <p className="text-[11px] text-muted-foreground">
          {draft.trim()
            ? "Custom greeting for this clinic"
            : "System default (from server env or built-in fallback)"}
        </p>
      </div>
      {defaultText && (
        <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">System default: </span>
          {defaultText}
        </div>
      )}
    </>
  );
}

function ClinicAvatarThumb({
  avatar,
  name,
  size = "sm"
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
        "rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground shrink-0 border border-border/40"
      )}
      aria-hidden
    >
      <Building2 className={icon} />
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label className="text-xs text-muted-foreground mb-1.5 block">{label}</Label>
      {children}
    </div>
  );
}

function SecretInput({
  value,
  onChange,
  autoComplete = "off",
  placeholder
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <Input
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        className="pr-9"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
        onClick={() => setShow((v) => !v)}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </Button>
    </div>
  );
}
