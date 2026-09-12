import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  Loader2,
  RotateCcw,
  Send,
  Volume2,
  Mic,
  PhoneIncoming,
  PhoneOutgoing,
  MessageSquare,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  testAgentChat,
  listAgentTestOptions,
  getCampaign,
  type AgentInput,
  type AgentTestMessage,
  type AgentTestChannel,
  type AgentTestMeta,
  type CampaignContactItem,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const LANGUAGES = [
  "English",
  "Spanish",
  "Korean",
  "Chinese",
  "Vietnamese",
  "Tagalog",
  "Arabic",
  "French",
  "German",
  "Japanese",
];

const CHANNELS: {
  id: AgentTestChannel;
  label: string;
  hint: string;
  icon: typeof MessageSquare;
}[] = [
  {
    id: "webchat",
    label: "Webchat",
    hint: "Type or hold the mic to speak — same behavior as the clinic web widget.",
    icon: MessageSquare,
  },
  {
    id: "inbound",
    label: "Inbound",
    hint: "Simulate a patient calling the clinic number — greeting + phone flow.",
    icon: PhoneIncoming,
  },
  {
    id: "campaign",
    label: "Campaign",
    hint: "Simulate an outbound campaign dial with patient context.",
    icon: PhoneOutgoing,
  },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId?: string | null;
  agentTitle?: string;
  draft?: Partial<AgentInput> & { title?: string };
  /** Prefill clinic when opened from Clinics page */
  clinicId?: string | null;
};

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || "");
      const i = result.indexOf(",");
      resolve(i >= 0 ? result.slice(i + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read audio"));
    reader.readAsDataURL(blob);
  });
}

export default function AgentTestLab({
  open,
  onOpenChange,
  agentId,
  agentTitle,
  draft,
  clinicId: prefClinicId,
}: Props) {
  const [channel, setChannel] = useState<AgentTestChannel>("webchat");
  const [messages, setMessages] = useState<AgentTestMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("English");
  const [speak, setSpeak] = useState(false);
  const [sending, setSending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [sessionLive, setSessionLive] = useState(false);
  const [meta, setMeta] = useState<AgentTestMeta | null>(null);
  const [clinics, setClinics] = useState<{ id: string; name: string }[]>([]);
  const [campaigns, setCampaigns] = useState<{ id: string; name: string }[]>([]);
  const [clinicId, setClinicId] = useState<string>("");
  const [campaignId, setCampaignId] = useState<string>("");
  const [contacts, setContacts] = useState<CampaignContactItem[]>([]);
  const [contactId, setContactId] = useState<string>("");
  const [patientFirst, setPatientFirst] = useState("Alex");
  const [patientLast, setPatientLast] = useState("Patient");
  const [recording, setRecording] = useState(false);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const channelMeta = CHANNELS.find((c) => c.id === channel)!;
  const phoneMode = channel === "inbound" || channel === "campaign";
  const effectiveSpeak = phoneMode ? true : speak;

  const stopMicTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const resetSession = useCallback(() => {
    audioRef.current?.pause();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop();
      } catch {
        /* ignore */
      }
    }
    stopMicTracks();
    setRecording(false);
    setMessages([]);
    setMeta(null);
    setInput("");
    setSessionLive(false);
  }, []);

  useEffect(() => {
    if (!open) {
      audioRef.current?.pause();
      stopMicTracks();
      return;
    }
    resetSession();
    setChannel("webchat");
    setSpeak(false);
    setLanguage("English");
    setClinicId(prefClinicId || "");
    setCampaignId("");
    setContactId("");
    setContacts([]);
    void (async () => {
      try {
        const opts = await listAgentTestOptions(agentId || undefined);
        setClinics(opts.clinics);
        setCampaigns(opts.campaigns);
        if (prefClinicId) setClinicId(prefClinicId);
        else if (opts.clinics[0]) setClinicId(opts.clinics[0].id);
        if (opts.campaigns[0]) setCampaignId(opts.campaigns[0].id);
      } catch {
        setClinics([]);
        setCampaigns([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when dialog opens
  }, [open, agentId, prefClinicId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, starting]);

  useEffect(() => {
    if (!open || !campaignId || channel !== "campaign") {
      setContacts([]);
      setContactId("");
      return;
    }
    void (async () => {
      try {
        const res = await getCampaign(campaignId);
        setContacts(res.contacts || []);
        setContactId("");
      } catch {
        setContacts([]);
      }
    })();
  }, [open, campaignId, channel]);

  const playAudio = (base64: string, mime: string) => {
    try {
      audioRef.current?.pause();
      const url = `data:${mime || "audio/mpeg"};base64,${base64}`;
      const audio = new Audio(url);
      audioRef.current = audio;
      void audio.play();
    } catch {
      toast.error("Could not play reply audio");
    }
  };

  const applyMeta = (m: AgentTestMeta) => setMeta(m);

  const startSession = async () => {
    if (starting || sending) return;
    if (channel === "campaign" && !campaignId) {
      toast.error("Select a campaign to dial");
      return;
    }
    setStarting(true);
    resetSession();
    try {
      const selectedContact = contacts.find((c) => c.id === contactId);
      const res = await testAgentChat({
        agentId: agentId || undefined,
        draft: agentId ? undefined : draft,
        action: "start",
        channel,
        language,
        speak: effectiveSpeak,
        clinicId: channel === "inbound" ? clinicId || null : null,
        campaignId: channel === "campaign" ? campaignId || null : null,
        contactId: channel === "campaign" ? contactId || null : null,
        patient:
          channel === "campaign"
            ? selectedContact
              ? {
                  patientFirstName: selectedContact.patientFirstName,
                  patientLastName: selectedContact.patientLastName,
                  patientPhone: selectedContact.patientPhone,
                  patientLanguage: selectedContact.patientLanguage || language,
                }
              : {
                  patientFirstName: patientFirst,
                  patientLastName: patientLast,
                  patientLanguage: language,
                }
            : null,
        messages: [],
      });
      applyMeta(res.meta);
      if (res.reply) {
        setMessages([{ role: "assistant", content: res.reply }]);
        if (effectiveSpeak && res.audioBase64) {
          playAudio(res.audioBase64, res.audioMimeType || "audio/mpeg");
        }
      }
      setSessionLive(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start test session");
    } finally {
      setStarting(false);
    }
  };

  const sendText = async (textRaw?: string) => {
    const text = (textRaw ?? input).trim();
    if (!text || sending) return;
    if (!sessionLive && (channel === "inbound" || channel === "campaign")) {
      toast.error("Start the call first");
      return;
    }
    const nextMessages: AgentTestMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      const selectedContact = contacts.find((c) => c.id === contactId);
      const res = await testAgentChat({
        agentId: agentId || undefined,
        draft: agentId ? undefined : draft,
        action: "message",
        channel,
        messages: nextMessages,
        language,
        speak: effectiveSpeak,
        clinicId: channel === "inbound" ? clinicId || null : null,
        campaignId: channel === "campaign" ? campaignId || null : null,
        contactId: channel === "campaign" ? contactId || null : null,
        patient:
          channel === "campaign"
            ? selectedContact
              ? {
                  patientFirstName: selectedContact.patientFirstName,
                  patientLastName: selectedContact.patientLastName,
                  patientPhone: selectedContact.patientPhone,
                  patientLanguage: selectedContact.patientLanguage || language,
                }
              : {
                  patientFirstName: patientFirst,
                  patientLastName: patientLast,
                  patientLanguage: language,
                }
            : null,
      });
      setMessages([...nextMessages, { role: "assistant", content: res.reply || "" }]);
      applyMeta(res.meta);
      setSessionLive(true);
      if (effectiveSpeak && res.audioBase64) {
        playAudio(res.audioBase64, res.audioMimeType || "audio/mpeg");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
      setMessages(nextMessages);
    } finally {
      setSending(false);
    }
  };

  const sendAudioBlob = async (blob: Blob) => {
    if (sending) return;
    if (!sessionLive && (channel === "inbound" || channel === "campaign")) {
      toast.error("Start the call first");
      return;
    }
    setSending(true);
    try {
      const audioBase64 = await blobToBase64(blob);
      const selectedContact = contacts.find((c) => c.id === contactId);
      const res = await testAgentChat({
        agentId: agentId || undefined,
        draft: agentId ? undefined : draft,
        action: "message",
        channel,
        messages,
        language,
        speak: true,
        clinicId: channel === "inbound" ? clinicId || null : null,
        campaignId: channel === "campaign" ? campaignId || null : null,
        contactId: channel === "campaign" ? contactId || null : null,
        patient:
          channel === "campaign"
            ? selectedContact
              ? {
                  patientFirstName: selectedContact.patientFirstName,
                  patientLastName: selectedContact.patientLastName,
                  patientPhone: selectedContact.patientPhone,
                  patientLanguage: selectedContact.patientLanguage || language,
                }
              : {
                  patientFirstName: patientFirst,
                  patientLastName: patientLast,
                  patientLanguage: language,
                }
            : null,
        audioBase64,
        audioMimeType: blob.type || "audio/webm",
      });
      const userLine = res.userTranscript || "(voice)";
      const next: AgentTestMessage[] = [
        ...messages,
        { role: "user", content: userLine },
        { role: "assistant", content: res.reply || "" },
      ];
      setMessages(next);
      applyMeta(res.meta);
      setSessionLive(true);
      if (res.audioBase64) {
        playAudio(res.audioBase64, res.audioMimeType || "audio/mpeg");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Voice turn failed");
    } finally {
      setSending(false);
    }
  };

  const startRecording = async () => {
    if (recording || sending || starting) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        stopMicTracks();
        setRecording(false);
        if (blob.size > 0) void sendAudioBlob(blob);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast.error("Microphone permission denied");
    }
  };

  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    } else {
      setRecording(false);
      stopMicTracks();
    }
  };

  const onChannelChange = (next: string) => {
    const c = next as AgentTestChannel;
    setChannel(c);
    resetSession();
    if (c === "inbound" || c === "campaign") setSpeak(true);
  };

  const needsStart = channel === "inbound" || channel === "campaign";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[min(92vh,900px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/70">
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Agent test lab
          </DialogTitle>
          <DialogDescription>
            Multi-channel sandbox for{" "}
            <strong>{agentTitle || draft?.title || "this agent"}</strong> — webchat
            (type or speak), inbound phone, and campaign outbound.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 pt-3 pb-2 border-b border-border/60 bg-muted/15">
          <Tabs value={channel} onValueChange={onChannelChange}>
            <TabsList className="grid w-full grid-cols-3 h-auto p-1">
              {CHANNELS.map((c) => {
                const Icon = c.icon;
                return (
                  <TabsTrigger
                    key={c.id}
                    value={c.id}
                    className="flex flex-col sm:flex-row gap-1 sm:gap-1.5 py-2 text-xs sm:text-sm data-[state=active]:shadow-sm"
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {c.label}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
          <p className="mt-2 text-xs text-muted-foreground">{channelMeta.hint}</p>
        </div>

        <div className="px-6 py-3 border-b border-border/60 flex flex-wrap items-end gap-3 bg-muted/10">
          <div className="space-y-1.5 min-w-[9rem]">
            <Label className="text-xs text-muted-foreground">Language</Label>
            <Select value={language} onValueChange={setLanguage} disabled={sessionLive}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="z-[80]">
                {LANGUAGES.map((l) => (
                  <SelectItem key={l} value={l}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {channel === "inbound" ? (
            <div className="space-y-1.5 min-w-[12rem] flex-1">
              <Label className="text-xs text-muted-foreground">Clinic (caller dialed)</Label>
              <Select
                value={clinicId || "__none__"}
                onValueChange={(v) => setClinicId(v === "__none__" ? "" : v)}
                disabled={sessionLive}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select clinic" />
                </SelectTrigger>
                <SelectContent className="z-[80]">
                  <SelectItem value="__none__">Agent only (no clinic)</SelectItem>
                  {clinics.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {channel === "campaign" ? (
            <>
              <div className="space-y-1.5 min-w-[12rem] flex-1">
                <Label className="text-xs text-muted-foreground">Campaign</Label>
                <Select
                  value={campaignId || "__none__"}
                  onValueChange={(v) => setCampaignId(v === "__none__" ? "" : v)}
                  disabled={sessionLive}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select campaign" />
                  </SelectTrigger>
                  <SelectContent className="z-[80]">
                    {campaigns.length === 0 ? (
                      <SelectItem value="__none__" disabled>
                        No campaigns for this agent
                      </SelectItem>
                    ) : (
                      campaigns.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 min-w-[12rem] flex-1">
                <Label className="text-xs text-muted-foreground">Patient contact</Label>
                <Select
                  value={contactId || "__mock__"}
                  onValueChange={(v) => setContactId(v === "__mock__" ? "" : v)}
                  disabled={sessionLive || !campaignId}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Mock patient" />
                  </SelectTrigger>
                  <SelectContent className="z-[80]">
                    <SelectItem value="__mock__">Mock patient (below)</SelectItem>
                    {contacts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.patientName || `${c.patientFirstName || ""} ${c.patientLastName || ""}`.trim()}{" "}
                        {c.patientPhone ? `· ${c.patientPhone}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {!contactId ? (
                <div className="flex gap-2 w-full sm:w-auto">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">First name</Label>
                    <Input
                      className="h-9 w-[7rem]"
                      value={patientFirst}
                      disabled={sessionLive}
                      onChange={(e) => setPatientFirst(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Last name</Label>
                    <Input
                      className="h-9 w-[7rem]"
                      value={patientLast}
                      disabled={sessionLive}
                      onChange={(e) => setPatientLast(e.target.value)}
                    />
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          {channel === "webchat" ? (
            <label className="flex items-center gap-2 text-sm pb-1.5">
              <Checkbox checked={speak} onCheckedChange={(v) => setSpeak(v === true)} />
              <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
              Speak replies
            </label>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground pb-1.5">
              <Volume2 className="h-3.5 w-3.5" />
              Voice replies on
            </div>
          )}

          <div className="flex-1" />
          {needsStart && !sessionLive ? (
            <Button
              type="button"
              size="sm"
              className="bg-gradient-primary text-primary-foreground"
              onClick={() => void startSession()}
              disabled={starting}
            >
              {starting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : channel === "inbound" ? (
                <PhoneIncoming className="h-3.5 w-3.5 mr-1" />
              ) : (
                <PhoneOutgoing className="h-3.5 w-3.5 mr-1" />
              )}
              {channel === "inbound" ? "Answer call" : "Place dial"}
            </Button>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={resetSession}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        </div>

        {meta ? (
          <div className="px-6 py-2 flex flex-wrap gap-1.5 border-b border-border/50">
            <Badge variant="secondary" className="text-[10px] capitalize">
              {meta.channel || channel}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Model: {meta.model}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Voice: {meta.voice}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Flow: {meta.flowName || "none"}
            </Badge>
            <Badge variant="outline" className="text-[10px]">
              Knowledge: {meta.knowledgeCount}
            </Badge>
            {meta.clinicName ? (
              <Badge variant="outline" className="text-[10px]">
                Clinic: {meta.clinicName}
              </Badge>
            ) : null}
            {meta.campaignName ? (
              <Badge variant="outline" className="text-[10px]">
                Campaign: {meta.campaignName}
              </Badge>
            ) : null}
            {meta.patientName ? (
              <Badge variant="outline" className="text-[10px]">
                Patient: {meta.patientName}
              </Badge>
            ) : null}
          </div>
        ) : null}

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="py-4 space-y-3">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground space-y-2">
                {needsStart && !sessionLive ? (
                  <p>
                    {channel === "inbound"
                      ? "Click Answer call to play the clinic inbound greeting, then speak or type as the caller."
                      : "Select a campaign (and optional contact), then Place dial to hear the outbound opening."}
                  </p>
                ) : (
                  <p>
                    Type or hold the mic to speak. The bot follows this agent&apos;s flow and
                    knowledge.
                  </p>
                )}
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}`}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap",
                    m.role === "user"
                      ? "bg-gradient-primary text-primary-foreground"
                      : "bg-card border border-border/70 shadow-soft"
                  )}
                >
                  {m.role === "assistant" && (phoneMode || speak) ? (
                    <span className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      <Volume2 className="h-3 w-3" /> Bot
                    </span>
                  ) : null}
                  {m.content}
                </div>
              </div>
            ))}
            {sending || starting ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-border/70 bg-card px-3.5 py-2.5 text-sm text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  {starting
                    ? channel === "campaign"
                      ? "Dialing…"
                      : "Connecting…"
                    : recording
                      ? "Listening…"
                      : "Thinking…"}
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="px-6 py-4 border-t border-border/70 flex gap-2 items-center">
          <Button
            type="button"
            variant={recording ? "destructive" : "outline"}
            className={cn(
              "shrink-0 h-10 w-10 rounded-full p-0",
              recording && "animate-pulse"
            )}
            disabled={sending || starting || (needsStart && !sessionLive)}
            onMouseDown={() => void startRecording()}
            onMouseUp={stopRecording}
            onMouseLeave={() => {
              if (recording) stopRecording();
            }}
            onTouchStart={(e) => {
              e.preventDefault();
              void startRecording();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              stopRecording();
            }}
            title="Hold to speak"
          >
            <Mic className="h-4 w-4" />
          </Button>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              phoneMode
                ? "Or type what the caller / patient says…"
                : "Type as the patient, or hold the mic…"
            }
            disabled={sending || starting || (needsStart && !sessionLive)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void sendText();
              }
            }}
          />
          <Button
            type="button"
            onClick={() => void sendText()}
            disabled={
              sending ||
              starting ||
              !input.trim() ||
              (needsStart && !sessionLive)
            }
            className="bg-gradient-primary text-primary-foreground shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
