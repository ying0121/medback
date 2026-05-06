import { useEffect, useRef, useState } from "react";
import { Pencil, Plus, Trash2, Building2, RefreshCw, Mic2, AudioLines, Play, Phone, Eye, EyeOff } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  listClinics,
  createClinic,
  updateClinic,
  deleteClinic,
  syncClinicsFromExternalApi,
  getClinicTwilioConfig,
  updateClinicTwilioConfig,
  getClinicElevenLabsConfig,
  updateClinicElevenLabsApiKey,
  listClinicElevenLabsVoices,
  fetchClinicElevenLabsPreviewBlob,
  fetchClinicElevenLabsPreviewSourceBlob,
  updateClinicElevenLabsVoice,
  type Clinic,
  type ElevenLabsVoice,
  type ClinicTwilioConfigInput,
} from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

type ClinicForm = Omit<Clinic, "id">;

const EMPTY: ClinicForm = {
  clinicId: "",
  name: "", acronym: "", address1: "", address2: "", state: "", city: "", zip: "",
  tel: "", web: "", portal: "",
};

const EMPTY_TWILIO_FORM: ClinicTwilioConfigInput = {
  twilioPhoneNumber: "",
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
  const [elevenLabsClinic, setElevenLabsClinic] = useState<Clinic | null>(null);
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [savingElevenLabs, setSavingElevenLabs] = useState(false);
  const [loadingElevenLabs, setLoadingElevenLabs] = useState(false);

  const [voiceModalClinic, setVoiceModalClinic] = useState<Clinic | null>(null);
  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [voicesLoading, setVoicesLoading] = useState(false);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [savingVoice, setSavingVoice] = useState(false);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastBlobUrlRef = useRef<string | null>(null);

  const stopVoicePreview = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (lastBlobUrlRef.current) {
      URL.revokeObjectURL(lastBlobUrlRef.current);
      lastBlobUrlRef.current = null;
    }
    setPreviewingVoiceId(null);
  };

  useEffect(() => {
    if (!voiceModalClinic) {
      setVoices([]);
      setSelectedVoiceId("");
      return;
    }
    let cancelled = false;
    setVoicesLoading(true);
    setSelectedVoiceId(voiceModalClinic.elevenLabsVoiceId || "");
    listClinicElevenLabsVoices(voiceModalClinic.id)
      .then((v) => {
        if (!cancelled) setVoices(v);
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Could not load voices";
        toast.error(msg);
        if (!cancelled) setVoices([]);
      })
      .finally(() => {
        if (!cancelled) setVoicesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [voiceModalClinic]);

  const refresh = () => listClinics().then(setData);
  useEffect(() => { refresh(); }, []);

  const openCreate = () => { setEditing(null); setForm(EMPTY); setOpen(true); };
  const openEdit = (c: Clinic) => {
    setEditing(c);
    const { id, ...rest } = c;
    setForm({ ...EMPTY, ...rest });
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

  const openElevenLabs = async (c: Clinic) => {
    setElevenLabsClinic(c);
    setElevenLabsKey("");
    try {
      setLoadingElevenLabs(true);
      const data = await getClinicElevenLabsConfig(c.id);
      setElevenLabsKey(data.apiKey || "");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load ElevenLabs key";
      toast.error(msg);
    } finally {
      setLoadingElevenLabs(false);
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
        twilioPhoneNumber: normalizeUsPhoneForSave(data.twilioPhoneNumber) || data.twilioPhoneNumber
      });
      setTwilioPhoneDisplay(formatUsPhoneForDisplay(data.twilioPhoneNumber || ""));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load Twilio settings";
      toast.error(msg);
    } finally {
      setLoadingTwilio(false);
    }
  };

  const playVoicePreview = async (v: ElevenLabsVoice) => {
    if (!voiceModalClinic) return;
    stopVoicePreview();
    setPreviewingVoiceId(v.voice_id);
    const playBlob = async (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      lastBlobUrlRef.current = url;
      const a = new Audio(url);
      previewAudioRef.current = a;
      a.onended = () => {
        setPreviewingVoiceId(null);
        URL.revokeObjectURL(url);
        lastBlobUrlRef.current = null;
      };
      a.onerror = () => {
        setPreviewingVoiceId(null);
        URL.revokeObjectURL(url);
        lastBlobUrlRef.current = null;
        toast.error("Could not play preview audio.");
      };
      await a.play();
    };
    try {
      const previewUrl = v.preview_url?.trim();
      if (previewUrl) {
        try {
          const blob = await fetchClinicElevenLabsPreviewSourceBlob(voiceModalClinic.id, previewUrl);
          await playBlob(blob);
          return;
        } catch {
          /* fall through to TTS preview */
        }
      }
      const blob = await fetchClinicElevenLabsPreviewBlob(voiceModalClinic.id, v.voice_id);
      await playBlob(blob);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      toast.error(msg);
      setPreviewingVoiceId(null);
    }
  };

  const saveVoice = async () => {
    if (!voiceModalClinic) return;
    if (!selectedVoiceId) return toast.error("Select a voice");
    try {
      setSavingVoice(true);
      await updateClinicElevenLabsVoice(voiceModalClinic.id, selectedVoiceId);
      toast.success("ElevenLabs voice saved");
      stopVoicePreview();
      setVoiceModalClinic(null);
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save voice";
      toast.error(msg);
    } finally {
      setSavingVoice(false);
    }
  };

  const saveElevenLabs = async () => {
    if (!elevenLabsClinic) return;
    const trimmed = elevenLabsKey.trim();
    if (!trimmed) return toast.error("API key is required");
    try {
      setSavingElevenLabs(true);
      await updateClinicElevenLabsApiKey(elevenLabsClinic.id, trimmed);
      toast.success("ElevenLabs API key saved");
      setElevenLabsClinic(null);
      setElevenLabsKey("");
      refresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save API key";
      toast.error(msg);
    } finally {
      setSavingElevenLabs(false);
    }
  };

  const saveTwilio = async () => {
    if (!twilioClinic) return;
    const payload: ClinicTwilioConfigInput = {
      twilioPhoneNumber: twilioForm.twilioPhoneNumber.trim(),
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
      key: "name", header: "Clinic", searchable: (r) => `${r.name} ${r.acronym} ${r.clinicId}`,
      render: (r) => (
        <div className="flex items-center gap-3 min-w-[220px]">
          <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center text-primary-foreground shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="font-medium truncate">{r.name}</div>
            <div className="text-xs text-muted-foreground">{r.acronym} · {r.clinicId}</div>
          </div>
        </div>
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
    { key: "actions", header: "", className: "w-56 text-right", searchable: () => "", render: (r) => (
      <div className="flex items-center justify-end gap-1">
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
          onClick={() => openElevenLabs(r)}
          title={r.elevenLabsConfigured ? "ElevenLabs API key — configured" : "ElevenLabs API key"}
        >
          <Mic2 className={`h-4 w-4 ${r.elevenLabsConfigured ? "text-violet-600" : "text-muted-foreground"}`} />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setVoiceModalClinic(r)}
          disabled={!r.elevenLabsConfigured}
          title={
            r.elevenLabsConfigured
              ? r.elevenLabsVoiceConfigured
                ? "ElevenLabs voice — configured"
                : "Choose ElevenLabs voice"
              : "Save an API key first"
          }
        >
          <AudioLines className={`h-4 w-4 ${r.elevenLabsVoiceConfigured ? "text-violet-600" : "text-muted-foreground"}`} />
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
        <DialogContent className="max-w-2xl max-h-[90vh] min-h-0 overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit clinic" : "Add new clinic"}</DialogTitle>
            <DialogDescription>
              Set clinic information including editable clinic ID.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="flex-1 min-h-0 -mx-6 px-6">
          <div className="grid grid-cols-2 gap-4 py-2 pr-2">
            <Field label="Clinic ID">
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
            <Field label="Name *"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Acronym"><Input value={form.acronym} onChange={(e) => setForm({ ...form, acronym: e.target.value })} /></Field>
            <Field label="Address 1" className="col-span-2"><Input value={form.address1} onChange={(e) => setForm({ ...form, address1: e.target.value })} /></Field>
            <Field label="Address 2" className="col-span-2"><Input value={form.address2 ?? ""} onChange={(e) => setForm({ ...form, address2: e.target.value })} /></Field>
            <Field label="City"><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></Field>
            <Field label="State"><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
            <Field label="ZIP"><Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} /></Field>
            <Field label="Tel"><Input value={form.tel} onChange={(e) => setForm({ ...form, tel: e.target.value })} /></Field>
            <Field label="Web"><Input value={form.web ?? ""} onChange={(e) => setForm({ ...form, web: e.target.value })} /></Field>
            <Field label="Portal" className="col-span-2"><Input value={form.portal ?? ""} onChange={(e) => setForm({ ...form, portal: e.target.value })} /></Field>
          </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-gradient-primary text-primary-foreground">{editing ? "Save changes" : "Create clinic"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!voiceModalClinic}
        onOpenChange={(o) => {
          if (!o) {
            stopVoicePreview();
            setVoiceModalClinic(null);
          }
        }}
      >
        <DialogContent className="flex min-h-0 max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
          <DialogHeader className="shrink-0 space-y-1.5 px-6 pb-2 pt-6 text-center sm:text-left">
            <DialogTitle>ElevenLabs voice</DialogTitle>
            <DialogDescription>
              {voiceModalClinic ? (
                <>
                  Choose the voice for inbound phone responses for <strong>{voiceModalClinic.name}</strong>.
                  Save an API key first if voices do not load.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div
            className="mx-6 mb-1 min-h-0 max-h-[min(52vh,28rem)] flex-1 overflow-y-auto overflow-x-hidden rounded-md border border-border/60 bg-muted/15 px-2 py-2 [scrollbar-gutter:stable]"
            role="region"
            aria-label="Voice list"
          >
            {voicesLoading ? (
              <p className="text-sm text-muted-foreground px-2 py-6">Loading voices…</p>
            ) : voices.length === 0 ? (
              <p className="text-sm text-muted-foreground px-2 py-6">
                No voices returned. Check the API key or your ElevenLabs account.
              </p>
            ) : (
              <RadioGroup value={selectedVoiceId} onValueChange={setSelectedVoiceId} className="gap-0">
                {voices.map((v) => {
                  const labelBits = [
                    v.category,
                    ...Object.entries(v.labels || {}).slice(0, 4).map(([k, val]) => `${k}: ${val}`),
                  ].filter(Boolean);
                  return (
                    <div
                      key={v.voice_id}
                      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 border-b border-border/60 py-3 pl-1 pr-1 last:border-b-0"
                    >
                      <RadioGroupItem value={v.voice_id} id={`voice-${v.voice_id}`} className="mt-0.5 shrink-0 self-start" />
                      <label htmlFor={`voice-${v.voice_id}`} className="min-w-0 cursor-pointer py-0.5 text-left">
                        <div className="font-medium leading-snug break-words">{v.name}</div>
                        <div className="text-xs leading-snug text-muted-foreground break-words">
                          {labelBits.join(" · ") || "—"}
                        </div>
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="shrink-0 whitespace-nowrap justify-self-end"
                        onClick={(e) => {
                          e.preventDefault();
                          playVoicePreview(v);
                        }}
                        disabled={previewingVoiceId === v.voice_id}
                      >
                        <Play className="h-3.5 w-3.5 shrink-0 mr-1" />
                        {previewingVoiceId === v.voice_id ? "Playing…" : "Listen"}
                      </Button>
                    </div>
                  );
                })}
              </RadioGroup>
            )}
          </div>
          <DialogFooter className="shrink-0 border-t border-border/60 px-6 py-4 sm:justify-end">
            <Button
              variant="outline"
              onClick={() => {
                stopVoicePreview();
                setVoiceModalClinic(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={saveVoice}
              disabled={savingVoice || !selectedVoiceId || voices.length === 0}
              className="bg-gradient-primary text-primary-foreground"
            >
              {savingVoice ? "Saving…" : "Save voice"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              <SecretInput
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
        open={!!elevenLabsClinic}
        onOpenChange={(o) => {
          if (!o) {
            setElevenLabsClinic(null);
            setElevenLabsKey("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>ElevenLabs account</DialogTitle>
            <DialogDescription>
              {elevenLabsClinic ? (
                <>
                  Set the API key for <strong>{elevenLabsClinic.name}</strong>. The key is stored on the server.
                </>
              ) : null}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Field label="API key">
              <SecretInput
                autoComplete="off"
                placeholder="xi_…"
                value={elevenLabsKey}
                onChange={(e) => setElevenLabsKey(e.target.value)}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setElevenLabsClinic(null);
                setElevenLabsKey("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={saveElevenLabs} disabled={savingElevenLabs || loadingElevenLabs} className="bg-gradient-primary text-primary-foreground">
              {loadingElevenLabs ? "Loading..." : savingElevenLabs ? "Saving…" : "Save"}
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
