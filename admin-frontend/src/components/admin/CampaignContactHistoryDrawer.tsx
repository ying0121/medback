import { useEffect, useState } from "react";
import {
  History,
  Loader2,
  PhoneCall,
  RefreshCw,
  Languages,
  GitBranch,
  Clock,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  getCampaignContactHistory,
  reanalyzeCampaignCallHistory,
  type CampaignCallHistoryItem,
  type CampaignCallResultType,
  type CampaignContactItem,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const RESULT_LABEL: Record<CampaignCallResultType, string> = {
  pending: "Pending",
  calling: "Calling",
  success: "Success",
  reject: "Reject",
  interesting: "Interesting",
  not_interesting: "Not interesting",
};

const RESULT_STYLE: Record<CampaignCallResultType, string> = {
  pending: "text-muted-foreground border-border bg-muted/40",
  calling: "text-sky-700 border-sky-300/50 bg-sky-50",
  success: "text-emerald-700 border-emerald-300/50 bg-emerald-50",
  reject: "text-rose-700 border-rose-300/50 bg-rose-50",
  interesting: "text-violet-700 border-violet-300/50 bg-violet-50",
  not_interesting: "text-amber-800 border-amber-300/50 bg-amber-50",
};

function formatWhen(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

type Props = {
  open: boolean;
  campaignId: string;
  contact: CampaignContactItem | null;
  onClose: () => void;
  onContactUpdated?: (contact: CampaignContactItem) => void;
};

export default function CampaignContactHistoryDrawer({
  open,
  campaignId,
  contact,
  onClose,
  onContactUpdated,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<CampaignCallHistoryItem[]>([]);
  const [selected, setSelected] = useState<CampaignCallHistoryItem | null>(null);
  const [botContext, setBotContext] = useState<{
    language: string;
    flowId: string;
    flowName: string;
    instructionsPreview: string;
  } | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);

  useEffect(() => {
    if (!open || !contact) return;
    setLoading(true);
    setSelected(null);
    getCampaignContactHistory(campaignId, contact.id)
      .then((data) => {
        setHistory(data.history);
        setBotContext(data.botContext || null);
        setSelected(data.history[0] || null);
        if (data.contact) onContactUpdated?.(data.contact);
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : "Failed to load history"))
      .finally(() => setLoading(false));
  }, [open, campaignId, contact?.id]);

  const onReanalyze = async () => {
    if (!contact || !selected) return;
    setReanalyzing(true);
    try {
      const result = await reanalyzeCampaignCallHistory(campaignId, contact.id, selected.id);
      setSelected(result.item);
      setHistory((prev) => prev.map((h) => (h.id === result.item.id ? result.item : h)));
      if (result.contact) onContactUpdated?.(result.contact);
      toast.success("AI analysis updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-analyze failed");
    } finally {
      setReanalyzing(false);
    }
  };

  const name = contact
    ? [contact.patientFirstName, contact.patientLastName].filter(Boolean).join(" ").trim() ||
      contact.patientName
    : "";

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-xl p-0 flex flex-col gap-0 overflow-hidden"
      >
        <div className="p-6 border-b border-border/80 shrink-0">
          <SheetHeader className="text-left space-y-1 pr-6">
            <SheetTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Call history
            </SheetTitle>
            <SheetDescription>
              {name ? (
                <>
                  <span className="font-medium text-foreground">{name}</span>
                  {contact?.patientPhone ? ` · ${contact.patientPhone}` : ""}
                </>
              ) : (
                "Patient call attempts and AI analysis"
              )}
            </SheetDescription>
          </SheetHeader>

          {contact ? (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge
                variant="outline"
                className={RESULT_STYLE[(contact.status as CampaignCallResultType) || "pending"]}
              >
                {RESULT_LABEL[(contact.status as CampaignCallResultType) || "pending"] ||
                  contact.status}
              </Badge>
              {contact.patientLanguage ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Languages className="h-3.5 w-3.5" />
                  {contact.patientLanguage}
                </span>
              ) : null}
              {botContext?.flowName ? (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <GitBranch className="h-3.5 w-3.5" />
                  {botContext.flowName}
                </span>
              ) : null}
              <span className="text-xs text-muted-foreground">
                {contact.attemptCount || 0} attempt{(contact.attemptCount || 0) === 1 ? "" : "s"}
              </span>
            </div>
          ) : null}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-5">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" /> Loading history…
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-16 px-4">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-3">
                <PhoneCall className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">No calls yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[280px] mx-auto">
                When the campaign dialer calls this patient, each attempt and AI result will appear
                here.
              </p>
              {botContext ? (
                <div className="mt-6 text-left rounded-xl border border-border/80 bg-muted/20 p-3 text-xs space-y-2">
                  <div className="font-medium text-foreground">Bot will use</div>
                  <p>
                    Language: <span className="font-medium">{botContext.language}</span>
                  </p>
                  <p>
                    Flow: <span className="font-medium">{botContext.flowName}</span>
                  </p>
                </div>
              ) : null}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Attempts
                </div>
                {history.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => setSelected(h)}
                    className={cn(
                      "w-full text-left rounded-xl border px-3 py-2.5 transition-colors",
                      selected?.id === h.id
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/80 hover:bg-muted/30"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium">Attempt #{h.attemptNumber}</span>
                      <Badge variant="outline" className={RESULT_STYLE[h.resultType]}>
                        {RESULT_LABEL[h.resultType]}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
                      <Clock className="h-3 w-3" />
                      {formatWhen(h.endedAt || h.startedAt)}
                      {h.durationSeconds != null ? ` · ${h.durationSeconds}s` : ""}
                      {h.language ? ` · ${h.language}` : ""}
                    </div>
                  </button>
                ))}
              </div>

              {selected ? (
                <div className="space-y-4 rounded-2xl border border-border/80 p-4 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">AI analysis</div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Result type and summary from the call transcript
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={reanalyzing || !selected.transcript?.length}
                      onClick={onReanalyze}
                    >
                      {reanalyzing ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      Re-analyze
                    </Button>
                  </div>

                  <Badge variant="outline" className={RESULT_STYLE[selected.resultType]}>
                    {RESULT_LABEL[selected.resultType]}
                  </Badge>

                  {selected.summary ? (
                    <p className="text-sm leading-relaxed">{selected.summary}</p>
                  ) : null}

                  {selected.analysisNotes ? (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/80">Notes: </span>
                      {selected.analysisNotes}
                    </div>
                  ) : null}

                  {selected.rawAnalysis?.keyPoints?.length ? (
                    <ul className="text-xs space-y-1 list-disc pl-4 text-muted-foreground">
                      {selected.rawAnalysis.keyPoints.map((p, i) => (
                        <li key={`${p}-${i}`}>{p}</li>
                      ))}
                    </ul>
                  ) : null}

                  {selected.errorMessage ? (
                    <div className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                      {selected.errorMessage}
                    </div>
                  ) : null}

                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                      Transcript
                    </div>
                    {selected.transcript?.length ? (
                      <div className="space-y-2 max-h-56 overflow-y-auto rounded-xl border border-border/70 bg-muted/15 p-3">
                        {selected.transcript.map((t, i) => (
                          <div key={i} className="text-xs">
                            <span className="font-semibold text-foreground/80">{t.role}: </span>
                            <span className="text-muted-foreground">{t.text}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">No transcript saved for this attempt.</p>
                    )}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
