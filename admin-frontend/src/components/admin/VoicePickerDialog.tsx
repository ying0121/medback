import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Loader2, Play, Sparkles } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  fetchClinicBotVoicePreviewBlob,
  listClinicBotVoices,
  type BotVoice,
} from "@/lib/api";
import { toast } from "sonner";

type ClinicRef = { id: string; name: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clinic: ClinicRef | null;
  initialSelectedVoiceId: string;
  saving: boolean;
  onSave: (voiceId: string) => Promise<void>;
};

export default function VoicePickerDialog({
  open,
  onOpenChange,
  clinic,
  initialSelectedVoiceId,
  saving,
  onSave,
}: Props) {
  const [voices, setVoices] = useState<BotVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(initialSelectedVoiceId);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPreviewing(null);
  }, []);

  useEffect(() => {
    if (!open) {
      cleanupAudio();
      return;
    }
    setSelected(initialSelectedVoiceId);
    if (!clinic) return;

    setLoading(true);
    listClinicBotVoices(clinic.id)
      .then((data) => setVoices(data.voices || []))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load voices";
        toast.error(msg);
      })
      .finally(() => setLoading(false));

    return cleanupAudio;
  }, [open, clinic, initialSelectedVoiceId, cleanupAudio]);

  const playPreview = async (voiceId: string) => {
    if (!clinic) return;
    cleanupAudio();
    try {
      setPreviewing(voiceId);
      const blob = await fetchClinicBotVoicePreviewBlob(clinic.id, voiceId);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => setPreviewing(null);
      audio.onerror = () => {
        toast.error("Could not play preview");
        setPreviewing(null);
      };
      await audio.play();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      toast.error(msg);
      setPreviewing(null);
    }
  };

  const handleSave = async () => {
    if (!selected) return toast.error("Select a voice");
    await onSave(selected);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AudioLines className="h-5 w-5 text-violet-600" />
            Bot voice
          </DialogTitle>
          <DialogDescription>
            {clinic ? (
              <>
                Choose the OpenAI Realtime voice for <strong>{clinic.name}</strong>. Used for
                inbound phone calls and web chat voice replies.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading voices…
            </div>
          ) : (
            <RadioGroup value={selected} onValueChange={setSelected} className="space-y-2">
              {voices.map((voice) => {
                const isSelected = selected === voice.id;
                const isPlaying = previewing === voice.id;
                return (
                  <div
                    key={voice.id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 transition",
                      isSelected ? "border-violet-500 bg-violet-500/5" : "border-border hover:bg-muted/40"
                    )}
                  >
                    <RadioGroupItem value={voice.id} id={`voice-${voice.id}`} />
                    <Label htmlFor={`voice-${voice.id}`} className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-1.5 font-medium">
                        {voice.name}
                        {(voice.id === "marin" || voice.id === "cedar") && (
                          <Sparkles className="h-3.5 w-3.5 text-violet-600" aria-hidden />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground font-normal mt-0.5">
                        {voice.description}
                      </div>
                    </Label>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={isPlaying}
                      onClick={() => playPreview(voice.id)}
                      title="Preview voice"
                    >
                      {isPlaying ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </RadioGroup>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading || !selected}
            className="bg-gradient-primary text-primary-foreground"
          >
            {saving ? "Saving…" : "Save voice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
