import { useEffect, useState, type ReactNode } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  getClinicOpenAiConfig,
  updateClinicOpenAiConfig,
  getClinicTwilioConfig,
  updateClinicTwilioConfig,
  getClinicGoogleConfig,
  updateClinicGoogleConfig,
  listAgentModels,
  type Clinic,
  type ClinicMeetingProvider,
  type ClinicOpenAiConfig,
  type ClinicTwilioConfigInput,
  type ClinicGoogleConfigInput,
  type AgentModelCatalog,
  type AgentModelDefaults,
} from "@/lib/api";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinic: Clinic | null;
  onSaved?: () => void;
};

const EMPTY_OPENAI: ClinicOpenAiConfig = {
  openaiApiKey: "",
  openaiApiKeySet: false,
  openaiModel: "",
  openaiRealtimeModel: "",
  openaiTranscriptionModel: "",
  openaiTtsModel: "",
  openaiInboundModel: "",
  openaiVoice: "",
};

const EMPTY_TWILIO: ClinicTwilioConfigInput = {
  twilioPhoneNumber: "",
  twilioCallerId: "",
  twilioAccountSid: "",
  twilioAuthToken: "",
  twilioApiKeySid: "",
  twilioApiKeySecret: "",
  twilioTwimlAppSid: "",
};

const EMPTY_MEETING: ClinicGoogleConfigInput = {
  meetingProvider: "google",
  googleClientId: "",
  googleClientSecret: "",
  googleRefreshToken: "",
  googleCreateMeet: false,
  ecwApiEndpoint: "",
  azulApiEndpoint: "",
};

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

export default function ClinicSettingsDialog({ open, onOpenChange, clinic, onSaved }: Props) {
  const [tab, setTab] = useState("openai");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [openai, setOpenai] = useState<ClinicOpenAiConfig>(EMPTY_OPENAI);
  const [twilio, setTwilio] = useState<ClinicTwilioConfigInput>(EMPTY_TWILIO);
  const [meeting, setMeeting] = useState<ClinicGoogleConfigInput>(EMPTY_MEETING);
  const [models, setModels] = useState<AgentModelCatalog | null>(null);
  const [modelDefaults, setModelDefaults] = useState<AgentModelDefaults | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);

  const loadModels = async (apiKey?: string) => {
    setLoadingModels(true);
    try {
      const data = await listAgentModels({ apiKey: apiKey || undefined });
      setModels(data.models);
      setModelDefaults(data.defaults);
      setOpenai((prev) => ({
        ...prev,
        openaiModel: prev.openaiModel || data.defaults.openaiModel || "",
        openaiRealtimeModel: prev.openaiRealtimeModel || data.defaults.openaiRealtimeModel || "",
        openaiTranscriptionModel:
          prev.openaiTranscriptionModel || data.defaults.openaiTranscriptionModel || "",
        openaiTtsModel: prev.openaiTtsModel || data.defaults.openaiTtsModel || "",
        openaiInboundModel: prev.openaiInboundModel || data.defaults.openaiInboundModel || "",
      }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load models");
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    if (!open || !clinic) return;
    setTab("openai");
    setLoading(true);
    Promise.all([
      getClinicOpenAiConfig(clinic.id),
      getClinicTwilioConfig(clinic.id),
      getClinicGoogleConfig(clinic.id),
      listAgentModels(),
    ])
      .then(([oa, tw, mt, modelData]) => {
        setTwilio({ ...EMPTY_TWILIO, ...tw });
        setMeeting({
          ...EMPTY_MEETING,
          ...mt,
          meetingProvider: (mt.meetingProvider || "google") as ClinicMeetingProvider,
        });
        setModels(modelData.models);
        setModelDefaults(modelData.defaults);
        setOpenai({
          ...EMPTY_OPENAI,
          ...oa,
          openaiApiKey: "",
          openaiModel: oa.openaiModel || modelData.defaults.openaiModel || "",
          openaiRealtimeModel:
            oa.openaiRealtimeModel || modelData.defaults.openaiRealtimeModel || "",
          openaiTranscriptionModel:
            oa.openaiTranscriptionModel || modelData.defaults.openaiTranscriptionModel || "",
          openaiTtsModel: oa.openaiTtsModel || modelData.defaults.openaiTtsModel || "",
          openaiInboundModel:
            oa.openaiInboundModel || modelData.defaults.openaiInboundModel || "",
        });
      })
      .catch((err: unknown) => {
        toast.error(err instanceof Error ? err.message : "Failed to load clinic settings");
      })
      .finally(() => setLoading(false));
  }, [open, clinic]);

  const save = async () => {
    if (!clinic) return;
    if (meeting.meetingProvider === "google") {
      if (
        !meeting.googleClientId.trim() ||
        !meeting.googleClientSecret.trim() ||
        !meeting.googleRefreshToken.trim()
      ) {
        toast.error("Google Calendar requires client ID, secret, and refresh token");
        setTab("meeting");
        return;
      }
    }
    if (meeting.meetingProvider === "ecw" && !meeting.ecwApiEndpoint.trim()) {
      toast.error("ECW API endpoint is required");
      setTab("meeting");
      return;
    }
    if (meeting.meetingProvider === "azul" && !meeting.azulApiEndpoint.trim()) {
      toast.error("Azul API endpoint is required");
      setTab("meeting");
      return;
    }

    const twilioFields = Object.values(twilio);
    const twilioAny = twilioFields.some((v) => String(v || "").trim());
    const twilioAll = twilioFields.every((v) => String(v || "").trim());
    if (twilioAny && !twilioAll) {
      toast.error("Complete all Twilio fields, or leave them all blank");
      setTab("twilio");
      return;
    }

    setSaving(true);
    try {
      await updateClinicOpenAiConfig(clinic.id, {
        openaiApiKey: openai.openaiApiKey,
        openaiModel: openai.openaiModel,
        openaiRealtimeModel: openai.openaiRealtimeModel,
        openaiTranscriptionModel: openai.openaiTranscriptionModel,
        openaiTtsModel: openai.openaiTtsModel,
        openaiInboundModel: openai.openaiInboundModel,
      });
      if (twilioAll) {
        await updateClinicTwilioConfig(clinic.id, twilio);
      }
      await updateClinicGoogleConfig(clinic.id, meeting);
      toast.success("Clinic settings saved");
      onOpenChange(false);
      onSaved?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const modelOptions = (key: keyof AgentModelCatalog) => models?.[key] || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] min-h-0 max-w-2xl flex-col gap-0 overflow-hidden p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle>Clinic settings</DialogTitle>
          <DialogDescription>
            {clinic
              ? `${clinic.name} — OpenAI models, Twilio, and meeting / calendar. Voice is set on the agent.`
              : "Clinic settings"}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : (
          <Tabs
            value={tab}
            onValueChange={setTab}
            className="flex flex-1 min-h-0 flex-col gap-0"
          >
            <TabsList className="grid w-full grid-cols-3 shrink-0 mb-3">
              <TabsTrigger value="openai">OpenAI</TabsTrigger>
              <TabsTrigger value="twilio">Twilio</TabsTrigger>
              <TabsTrigger value="meeting">Meeting</TabsTrigger>
            </TabsList>
            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain -mx-6 px-6 [scrollbar-gutter:stable]">
              <TabsContent value="openai" className="mt-0 focus-visible:ring-0 space-y-4 py-2 pb-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-muted-foreground">
                    API key and models for this clinic. Voice is configured on the assigned agent.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={loadingModels}
                    onClick={() => loadModels(openai.openaiApiKey || undefined)}
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
                      openai.openaiApiKeySet
                        ? "Leave blank to keep the saved key."
                        : "Uses server .env key for model listing if empty."
                    }
                  >
                    <Input
                      type="password"
                      autoComplete="off"
                      value={openai.openaiApiKey}
                      onChange={(e) => setOpenai({ ...openai, openaiApiKey: e.target.value })}
                      placeholder={openai.openaiApiKeySet ? "•••• saved ••••" : "sk-…"}
                    />
                  </Field>
                  {(
                    [
                      ["openaiModel", "Chat model", "chat"],
                      ["openaiRealtimeModel", "Realtime model", "realtime"],
                      ["openaiTranscriptionModel", "Transcription model", "transcription"],
                      ["openaiTtsModel", "TTS model", "tts"],
                      ["openaiInboundModel", "Inbound chat model", "chat"],
                    ] as const
                  ).map(([key, label, catalog]) => (
                    <Field key={key} label={label} className="col-span-12 md:col-span-6">
                      <Select
                        value={openai[key] || modelDefaults?.[key] || ""}
                        onValueChange={(v) => setOpenai({ ...openai, [key]: v })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select model" />
                        </SelectTrigger>
                        <SelectContent className="z-[80] max-h-72">
                          {(openai[key]
                            ? Array.from(new Set([openai[key], ...modelOptions(catalog)]))
                            : modelOptions(catalog)
                          ).map((m) => (
                            <SelectItem key={m} value={m}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="twilio" className="mt-0 focus-visible:ring-0 space-y-4 py-2 pb-4">
                <p className="text-sm text-muted-foreground">
                  Inbound phone number and Twilio credentials for this clinic.
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
                        value={twilio[key]}
                        onChange={(e) => setTwilio({ ...twilio, [key]: e.target.value })}
                      />
                    </Field>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="meeting" className="mt-0 focus-visible:ring-0 space-y-4 py-2 pb-4">
                <div className="grid grid-cols-12 gap-4">
                  <Field label="Meeting / calendar mode" className="col-span-12">
                    <div className="flex flex-wrap gap-2">
                      {(
                        [
                          ["google", "Google Calendar"],
                          ["ecw", "ECW Calendar"],
                          ["azul", "Azul Calendar"],
                          ["bot", "Bot Calendar"],
                        ] as const
                      ).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() =>
                            setMeeting({
                              ...meeting,
                              meetingProvider: value,
                            })
                          }
                          className={cn(
                            "rounded-full px-3 py-1.5 text-sm border transition-colors",
                            meeting.meetingProvider === value
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border hover:bg-muted/40"
                          )}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                      One mode per clinic. Scheduling agents (`book_appointment`) use this provider
                      when booking visits.
                      {meeting.meetingProvider === "bot"
                        ? " Bot Calendar saves visits on the Appointments page using clinic/doctor weekly hours."
                        : meeting.meetingProvider === "google"
                          ? " Google creates Calendar events (not duplicated on Bot Appointments)."
                          : meeting.meetingProvider === "ecw"
                            ? " ECW endpoint is stored for EHR sync (booking API wiring comes next)."
                            : " Azul endpoint is stored for EHR sync (booking API wiring comes next)."}
                    </p>
                  </Field>

                  {meeting.meetingProvider === "google" ? (
                    <>
                      <Field label="Google client ID" className="col-span-12">
                        <Input
                          value={meeting.googleClientId}
                          onChange={(e) =>
                            setMeeting({ ...meeting, googleClientId: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Google client secret" className="col-span-12 md:col-span-6">
                        <Input
                          type="password"
                          autoComplete="off"
                          value={meeting.googleClientSecret}
                          onChange={(e) =>
                            setMeeting({ ...meeting, googleClientSecret: e.target.value })
                          }
                        />
                      </Field>
                      <Field label="Google refresh token" className="col-span-12 md:col-span-6">
                        <Input
                          type="password"
                          autoComplete="off"
                          value={meeting.googleRefreshToken}
                          onChange={(e) =>
                            setMeeting({ ...meeting, googleRefreshToken: e.target.value })
                          }
                        />
                      </Field>
                      <div className="col-span-12 rounded-xl border border-border/70 bg-muted/25 px-4 py-3 space-y-2">
                        <label className="flex items-start gap-2.5 text-sm cursor-pointer">
                          <Checkbox
                            className="mt-0.5"
                            checked={meeting.googleCreateMeet}
                            onCheckedChange={(v) =>
                              setMeeting({ ...meeting, googleCreateMeet: v === true })
                            }
                          />
                          <span>
                            <span className="font-medium">Create Google Meet link</span>
                            <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">
                              When on, booking adds a Meet conference to the Calendar event and
                              emails the join link to the patient/staff. Required for telehealth-style
                              scheduling templates.
                            </span>
                          </span>
                        </label>
                      </div>
                    </>
                  ) : null}

                  {meeting.meetingProvider === "ecw" ? (
                    <Field label="ECW API endpoint" className="col-span-12">
                      <Input
                        value={meeting.ecwApiEndpoint}
                        onChange={(e) =>
                          setMeeting({ ...meeting, ecwApiEndpoint: e.target.value })
                        }
                        placeholder="https://…"
                      />
                    </Field>
                  ) : null}

                  {meeting.meetingProvider === "azul" ? (
                    <Field label="Azul API endpoint" className="col-span-12">
                      <Input
                        value={meeting.azulApiEndpoint}
                        onChange={(e) =>
                          setMeeting({ ...meeting, azulApiEndpoint: e.target.value })
                        }
                        placeholder="https://…"
                      />
                    </Field>
                  ) : null}

                  {meeting.meetingProvider === "bot" ? (
                    <div className="col-span-12 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground leading-relaxed">
                      Appointments use this clinic’s Bot Calendar schedule (weekly hours, slot
                      length, and daily limits on the clinic/doctor forms). No Google/ECW/Azul
                      credentials are required. Visits appear on the Appointments calendar.
                    </div>
                  ) : null}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}

        <DialogFooter className="shrink-0 border-t border-border/60 pt-4 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={saving || loading || !clinic}
            className="bg-gradient-primary text-primary-foreground"
          >
            {saving ? "Saving…" : "Save settings"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
