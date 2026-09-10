import { useEffect, useRef, useState } from "react";
import { FlaskConical, Loader2, RotateCcw, Send, Volume2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  testAgentChat,
  type AgentInput,
  type AgentTestMessage,
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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId?: string | null;
  agentTitle?: string;
  draft?: Partial<AgentInput> & { title?: string };
};

export default function AgentTestLab({
  open,
  onOpenChange,
  agentId,
  agentTitle,
  draft,
}: Props) {
  const [messages, setMessages] = useState<AgentTestMessage[]>([]);
  const [input, setInput] = useState("");
  const [language, setLanguage] = useState("English");
  const [speak, setSpeak] = useState(false);
  const [sending, setSending] = useState(false);
  const [meta, setMeta] = useState<{
    flowName: string | null;
    knowledgeCount: number;
    model: string;
    voice: string;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) {
      audioRef.current?.pause();
      return;
    }
    setMessages([]);
    setInput("");
    setMeta(null);
  }, [open, agentId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

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

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    const nextMessages: AgentTestMessage[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setSending(true);
    try {
      const res = await testAgentChat({
        agentId: agentId || undefined,
        draft: agentId ? undefined : draft,
        messages: nextMessages,
        language,
        speak,
      });
      setMessages([...nextMessages, { role: "assistant", content: res.reply }]);
      setMeta({
        flowName: res.meta.flowName,
        knowledgeCount: res.meta.knowledgeCount,
        model: res.meta.model,
        voice: res.meta.voice,
      });
      if (speak && res.audioBase64) {
        playAudio(res.audioBase64, res.audioMimeType || "audio/mpeg");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Test failed");
      setMessages(nextMessages);
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    audioRef.current?.pause();
    setMessages([]);
    setMeta(null);
    setInput("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[min(88vh,820px)] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-3 border-b border-border/70">
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-primary" />
            Agent test lab
          </DialogTitle>
          <DialogDescription>
            Sandbox chat for{" "}
            <strong>{agentTitle || draft?.title || "this agent"}</strong>. Uses the
            agent&apos;s models, flow, knowledge, and voice settings.
          </DialogDescription>
        </DialogHeader>

        <div className="px-6 py-3 border-b border-border/60 flex flex-wrap items-end gap-3 bg-muted/20">
          <div className="space-y-1.5 min-w-[10rem]">
            <Label className="text-xs text-muted-foreground">Patient language</Label>
            <Select value={language} onValueChange={setLanguage}>
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
          <label className="flex items-center gap-2 text-sm pb-1.5">
            <Checkbox checked={speak} onCheckedChange={(v) => setSpeak(v === true)} />
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            Speak replies
          </label>
          <div className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset
          </Button>
        </div>

        {meta ? (
          <div className="px-6 py-2 flex flex-wrap gap-1.5 border-b border-border/50">
            <Badge variant="secondary" className="text-[10px]">
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
          </div>
        ) : null}

        <ScrollArea className="flex-1 min-h-0 px-6">
          <div className="py-4 space-y-3">
            {messages.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 px-4 py-10 text-center text-sm text-muted-foreground">
                Start a test conversation. The bot will follow this agent&apos;s flow and
                knowledge.
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
                  {m.content}
                </div>
              </div>
            ))}
            {sending ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-border/70 bg-card px-3.5 py-2.5 text-sm text-muted-foreground inline-flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
                </div>
              </div>
            ) : null}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="px-6 py-4 border-t border-border/70 flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type as the patient…"
            disabled={sending}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <Button
            type="button"
            onClick={() => void send()}
            disabled={sending || !input.trim()}
            className="bg-gradient-primary text-primary-foreground shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
