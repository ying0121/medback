import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Filter,
  Loader2,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  buildVoiceFilterOptions,
  buildVoiceListQueryParams,
  countActiveVoiceFilters,
  EMPTY_VOICE_FILTERS,
  filterVoices,
  formatVoiceMeta,
  VOICE_FILTER_ALL,
  type VoiceFilterKey,
  type VoiceFilters,
} from "@/lib/elevenLabsVoices";
import {
  fetchClinicElevenLabsPreviewBlob,
  fetchClinicElevenLabsPreviewSourceBlob,
  listClinicElevenLabsVoices,
  type ElevenLabsVoice,
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

const FILTER_LABELS: Record<VoiceFilterKey, string> = {
  language: "Language",
  gender: "Gender",
  age: "Age",
  accent: "Accent",
  category: "Category",
};

function voiceInitials(name: string) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return (parts[0] || "?").slice(0, 2).toUpperCase();
}

function VoiceAvatar({ voice }: { voice: ElevenLabsVoice }) {
  return (
    <Avatar className="h-12 w-12 shrink-0 rounded-full border border-border/60 shadow-sm">
      {voice.image_url ? (
        <AvatarImage src={voice.image_url} alt="" className="object-cover" loading="lazy" />
      ) : null}
      <AvatarFallback className="bg-gradient-to-br from-violet-500/20 to-violet-600/5 text-xs font-semibold text-violet-700">
        {voiceInitials(voice.name)}
      </AvatarFallback>
    </Avatar>
  );
}

export default function VoicePickerDialog({
  open,
  onOpenChange,
  clinic,
  initialSelectedVoiceId,
  saving,
  onSave,
}: Props) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [filters, setFilters] = useState<VoiceFilters>(EMPTY_VOICE_FILTERS);
  const [selectedVoiceId, setSelectedVoiceId] = useState("");
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);

  const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const scrollRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const lastBlobUrlRef = useRef<string | null>(null);
  const fetchGenRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setSearch("");
      setDebouncedSearch("");
      setFilters(EMPTY_VOICE_FILTERS);
      setSelectedVoiceId("");
      setVoices([]);
      setPage(1);
      setHasMore(false);
      stopPreview();
      return;
    }
    setSelectedVoiceId(initialSelectedVoiceId || "");
  }, [open, initialSelectedVoiceId]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search, open]);

  const filterOptions = useMemo(() => buildVoiceFilterOptions(voices), [voices]);

  const filteredVoices = useMemo(
    () => filterVoices(voices, debouncedSearch, filters),
    [voices, debouncedSearch, filters]
  );

  const activeFilterCount = countActiveVoiceFilters(filters);

  const selectedVoice = useMemo(
    () => voices.find((v) => v.voice_id === selectedVoiceId) ?? null,
    [voices, selectedVoiceId]
  );

  const stopPreview = () => {
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

  const mergeVoices = (prev: ElevenLabsVoice[], incoming: ElevenLabsVoice[]) => {
    const seen = new Set(prev.map((v) => v.voice_id));
    const next = [...prev];
    for (const v of incoming) {
      if (seen.has(v.voice_id)) continue;
      seen.add(v.voice_id);
      next.push(v);
    }
    return next;
  };

  const fetchVoices = useCallback(
    async (pageNum: number, append: boolean) => {
      if (!clinic) return;
      const gen = ++fetchGenRef.current;
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const result = await listClinicElevenLabsVoices(
          clinic.id,
          buildVoiceListQueryParams(pageNum, filters, debouncedSearch)
        );
        if (gen !== fetchGenRef.current) return;

        setVoices((prev) =>
          append ? mergeVoices(prev, result.voices) : result.voices
        );
        setPage(result.page);
        setHasMore(result.has_more);
      } catch (err: unknown) {
        if (gen !== fetchGenRef.current) return;
        const msg = err instanceof Error ? err.message : "Could not load voices";
        toast.error(msg);
        if (!append) setVoices([]);
        setHasMore(false);
      } finally {
        if (gen === fetchGenRef.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [clinic, filters, debouncedSearch]
  );

  useEffect(() => {
    if (!open || !clinic) return;
    setPage(1);
    setHasMore(false);
    void fetchVoices(1, false);
  }, [open, clinic?.id, filters, debouncedSearch, fetchVoices]);

  const loadMore = useCallback(() => {
    if (!hasMore || loading || loadingMore || !clinic) return;
    void fetchVoices(page + 1, true);
  }, [hasMore, loading, loadingMore, clinic, page, fetchVoices]);

  useEffect(() => {
    const root = scrollRef.current;
    const target = loadMoreRef.current;
    if (!root || !target || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMore();
      },
      { root, rootMargin: "120px", threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [hasMore, loadMore, filteredVoices.length]);

  const setFilter = (key: VoiceFilterKey, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setFilters(EMPTY_VOICE_FILTERS);
  };

  const playVoicePreview = async (v: ElevenLabsVoice) => {
    if (!clinic) return;
    stopPreview();
    setPreviewingVoiceId(v.voice_id);

    const playBlob = async (blob: Blob) => {
      const url = URL.createObjectURL(blob);
      lastBlobUrlRef.current = url;
      const audio = new Audio(url);
      previewAudioRef.current = audio;
      audio.onended = () => {
        setPreviewingVoiceId(null);
        URL.revokeObjectURL(url);
        lastBlobUrlRef.current = null;
      };
      audio.onerror = () => {
        setPreviewingVoiceId(null);
        URL.revokeObjectURL(url);
        lastBlobUrlRef.current = null;
        toast.error("Could not play preview audio.");
      };
      await audio.play();
    };

    try {
      const previewUrl = v.preview_url?.trim();
      if (previewUrl) {
        try {
          const blob = await fetchClinicElevenLabsPreviewSourceBlob(clinic.id, previewUrl);
          await playBlob(blob);
          return;
        } catch {
          /* fall through to TTS preview */
        }
      }
      const blob = await fetchClinicElevenLabsPreviewBlob(clinic.id, v.voice_id);
      await playBlob(blob);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Preview failed";
      toast.error(msg);
      setPreviewingVoiceId(null);
    }
  };

  const handleSave = async () => {
    if (!selectedVoiceId) {
      toast.error("Select a voice");
      return;
    }
    stopPreview();
    await onSave(selectedVoiceId);
  };

  const handleClose = (next: boolean) => {
    if (!next) stopPreview();
    onOpenChange(next);
  };

  const renderFilterSelect = (
    key: VoiceFilterKey,
    options: { value: string; label: string }[]
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{FILTER_LABELS[key]}</Label>
      <Select value={filters[key]} onValueChange={(v) => setFilter(key, v)}>
        <SelectTrigger className="h-9 bg-background">
          <SelectValue placeholder={`All ${FILTER_LABELS[key].toLowerCase()}`} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={VOICE_FILTER_ALL}>All</SelectItem>
          {options.map((opt) => (
            <SelectItem key={`${key}-${opt.value}`} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="shrink-0 space-y-2 border-b border-border/60 bg-gradient-to-br from-violet-500/10 via-background to-background px-6 pb-4 pt-6">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600">
              <AudioLines className="h-5 w-5" />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-left">Choose inbound voice</DialogTitle>
              <DialogDescription className="text-left">
                {clinic ? (
                  <>
                    Select an ElevenLabs voice for <strong>{clinic.name}</strong>. Scroll for more
                    voices from the library; filter by language, gender, age, and accent.
                  </>
                ) : null}
              </DialogDescription>
            </div>
          </div>

          <div className="relative pt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, language, accent, description…"
              className="h-10 bg-background pl-9"
              disabled={loading && voices.length === 0}
            />
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {renderFilterSelect("language", filterOptions.languages)}
            {renderFilterSelect("gender", filterOptions.genders)}
            {renderFilterSelect("age", filterOptions.ages)}
            {renderFilterSelect("accent", filterOptions.accents)}
            {renderFilterSelect("category", filterOptions.categories)}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>
                {loading && voices.length === 0
                  ? "Loading voices…"
                  : `${filteredVoices.length} shown · ${voices.length} loaded`}
                {hasMore ? " · scroll for more" : ""}
              </span>
              {activeFilterCount > 0 ? (
                <Badge variant="secondary" className="font-normal">
                  {activeFilterCount} filter{activeFilterCount === 1 ? "" : "s"} active
                </Badge>
              ) : null}
            </div>
            {(activeFilterCount > 0 || search.trim()) && !loading ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs"
                onClick={clearFilters}
              >
                <RotateCcw className="h-3 w-3" />
                Clear all
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3 [scrollbar-gutter:stable]"
          role="region"
          aria-label="Filtered voice list"
        >
          {loading && voices.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Sparkles className="h-6 w-6 animate-pulse text-violet-500" />
              Loading voices from ElevenLabs…
            </div>
          ) : voices.length === 0 ? (
            <p className="px-2 py-12 text-center text-sm text-muted-foreground">
              No voices returned. Save a valid ElevenLabs API key for this clinic first.
            </p>
          ) : filteredVoices.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <p className="text-sm text-muted-foreground">No voices match your search or filters.</p>
              <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
                Reset search & filters
              </Button>
            </div>
          ) : (
            <>
              <RadioGroup
                value={selectedVoiceId}
                onValueChange={setSelectedVoiceId}
                className="grid gap-2 sm:grid-cols-2"
              >
                {filteredVoices.map((v) => {
                  const meta = formatVoiceMeta(v);
                  const isSelected = selectedVoiceId === v.voice_id;
                  const isPlaying = previewingVoiceId === v.voice_id;

                  return (
                    <div
                      key={v.voice_id}
                      className={cn(
                        "relative rounded-lg border bg-card p-3 transition-colors",
                        isSelected
                          ? "border-violet-500/60 ring-2 ring-violet-500/25"
                          : "border-border/70 hover:border-violet-500/30"
                      )}
                    >
                      <div className="flex gap-3">
                        <RadioGroupItem
                          value={v.voice_id}
                          id={`voice-${v.voice_id}`}
                          className="sr-only"
                        />
                        <label
                          htmlFor={`voice-${v.voice_id}`}
                          className="flex min-w-0 flex-1 cursor-pointer gap-3"
                        >
                          <VoiceAvatar voice={v} />
                          <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="flex items-start gap-2">
                              <div className="min-w-0 flex-1 font-medium leading-snug">{v.name}</div>
                              {v.source === "workspace" ? (
                                <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">
                                  Yours
                                </Badge>
                              ) : null}
                            </div>
                            {v.description ? (
                              <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                                {v.description}
                              </p>
                            ) : null}
                            {meta.length > 0 ? (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {meta.map((bit) => (
                                  <Badge
                                    key={`${v.voice_id}-${bit}`}
                                    variant="outline"
                                    className="px-1.5 py-0 text-[10px] font-normal"
                                  >
                                    {bit}
                                  </Badge>
                                ))}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">No metadata</span>
                            )}
                          </div>
                        </label>
                        <Button
                          type="button"
                          variant={isPlaying ? "secondary" : "outline"}
                          size="sm"
                          className="h-8 shrink-0 self-start px-2.5"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            void playVoicePreview(v);
                          }}
                          disabled={isPlaying}
                        >
                          <Play className="mr-1 h-3.5 w-3.5" />
                          {isPlaying ? "Playing" : "Listen"}
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </RadioGroup>

              <div ref={loadMoreRef} className="flex justify-center py-6">
                {loadingMore ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading more voices…
                  </div>
                ) : hasMore ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => loadMore()}>
                    Load more voices
                  </Button>
                ) : voices.length > 0 ? (
                  <p className="text-xs text-muted-foreground">End of voice library</p>
                ) : null}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 flex-col gap-3 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3 text-left sm:max-w-[55%]">
            {selectedVoice ? (
              <>
                <VoiceAvatar voice={selectedVoice} />
                <div className="min-w-0 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{selectedVoice.name}</span>
                  {formatVoiceMeta(selectedVoice).length > 0 ? (
                    <span className="block truncate">
                      {formatVoiceMeta(selectedVoice).join(" · ")}
                    </span>
                  ) : null}
                </div>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                Select a voice to use for inbound phone responses.
              </span>
            )}
          </div>
          <div className="flex w-full shrink-0 justify-end gap-2 sm:w-auto">
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              <X className="mr-1 h-4 w-4" />
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !selectedVoiceId || voices.length === 0}
              className="bg-gradient-primary text-primary-foreground"
            >
              {saving ? "Saving…" : "Save voice"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
