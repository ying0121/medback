import { useEffect, useMemo, useState } from "react";
import {
  FileSpreadsheet,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Copy,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  previewCampaignImport,
  confirmCampaignImport,
  type PatientFieldKey,
  type PatientImportAnalyzeResult,
  type PatientImportAnalysis,
  type CampaignItem,
  type CampaignContactItem,
} from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  campaignId: string;
  fileName: string;
  analyze: PatientImportAnalyzeResult | null;
  hasExistingContacts: boolean;
  onClose: () => void;
  onImported: (payload: {
    item: CampaignItem;
    contacts: CampaignContactItem[];
    imported: number;
    analysis: PatientImportAnalysis;
  }) => void;
};

const FIELD_ORDER: PatientFieldKey[] = [
  "firstName",
  "lastName",
  "dob",
  "phone",
  "language",
  "memberNumber",
];

export default function PatientImportDialog({
  open,
  campaignId,
  fileName,
  analyze,
  hasExistingContacts,
  onClose,
  onImported,
}: Props) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [analysis, setAnalysis] = useState<PatientImportAnalysis | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [replace, setReplace] = useState(false);

  useEffect(() => {
    if (!analyze) return;
    setMapping({ ...analyze.suggestedMapping });
    setAnalysis(analyze.analysis);
    setReplace(false);
  }, [analyze]);

  const fields = analyze?.fields?.length
    ? analyze.fields
    : FIELD_ORDER.map((key) => ({
        key,
        label:
          key === "firstName"
            ? "First name"
            : key === "lastName"
              ? "Last name"
              : key === "dob"
                ? "Date of birth"
                : key === "phone"
                  ? "Phone number"
                  : key === "language"
                    ? "Language"
                    : "Member number",
        required: true,
      }));

  const columns = analyze?.columns || [];
  const mappingComplete = useMemo(
    () => FIELD_ORDER.every((key) => Boolean(mapping[key])),
    [mapping]
  );

  const runPreview = async (nextMapping = mapping) => {
    if (!analyze?.rows?.length) return;
    if (!FIELD_ORDER.every((key) => Boolean(nextMapping[key]))) {
      setAnalysis(null);
      return;
    }
    setPreviewing(true);
    try {
      const result = await previewCampaignImport(campaignId, {
        mapping: nextMapping,
        rows: analyze.rows,
      });
      setAnalysis(result.analysis);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Preview failed");
    } finally {
      setPreviewing(false);
    }
  };

  const onMappingChange = (field: string, column: string) => {
    const next = { ...mapping, [field]: column === "__none__" ? "" : column };
    setMapping(next);
    void runPreview(next);
  };

  const onConfirm = async () => {
    if (!analyze?.rows?.length) return;
    if (!mappingComplete) return toast.error("Map all required fields");
    setImporting(true);
    try {
      const result = await confirmCampaignImport(campaignId, {
        mapping,
        rows: analyze.rows,
        replace: hasExistingContacts ? replace : false,
        skipFileDuplicates: true,
        skipExistingDuplicates: !replace,
      });
      onImported({
        item: result.item,
        contacts: result.contacts,
        imported: result.imported,
        analysis: result.analysis,
      });
      toast.success(
        `Imported ${result.imported} patient${result.imported === 1 ? "" : "s"}` +
          (result.skippedFileDuplicates || result.skippedExistingDuplicates
            ? ` · skipped ${result.skippedFileDuplicates + result.skippedExistingDuplicates} duplicate${
                result.skippedFileDuplicates + result.skippedExistingDuplicates === 1 ? "" : "s"
              }`
            : "")
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl flex max-h-[90vh] flex-col gap-0 overflow-hidden p-6">
        <div className="h-1.5 w-16 rounded-full bg-gradient-primary mb-3" />
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" /> Map Excel columns
          </DialogTitle>
          <DialogDescription>
            Match your file columns to patient fields. We detected{" "}
            <span className="font-medium text-foreground">{analyze?.totalRows ?? 0}</span> rows
            {fileName ? (
              <>
                {" "}
                in <span className="font-medium text-foreground">{fileName}</span>
              </>
            ) : null}
            .
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 py-4 space-y-5 [scrollbar-gutter:stable]">
          <div className="space-y-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Field mapping
            </div>
            {fields.map((field) => (
              <div key={field.key} className="grid grid-cols-1 sm:grid-cols-[160px_1fr] gap-2 items-center">
                <Label className="text-sm">
                  {field.label}
                  {field.required ? <span className="text-destructive"> *</span> : null}
                </Label>
                <Select
                  value={mapping[field.key] || "__none__"}
                  onValueChange={(v) => onMappingChange(field.key, v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select Excel column" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Not mapped —</SelectItem>
                    {columns.map((col) => (
                      <SelectItem key={col} value={col}>
                        {col}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {hasExistingContacts ? (
            <label className="flex items-start gap-2 rounded-xl border border-border bg-muted/20 p-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                className="mt-1 accent-primary"
                checked={replace}
                onChange={(e) => setReplace(e.target.checked)}
              />
              <span>
                <span className="font-medium">Replace existing patients</span>
                <span className="block text-xs text-muted-foreground mt-0.5">
                  Clear the current list before importing. Leave unchecked to append unique phones only.
                </span>
              </span>
            </label>
          ) : null}

          <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Drag / import result
              </div>
              {previewing ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Updating…
                </span>
              ) : null}
            </div>

            {!mappingComplete ? (
              <p className="text-sm text-muted-foreground">
                Map all required fields to see duplicate checks and import preview.
              </p>
            ) : analysis ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <Stat
                    icon={CheckCircle2}
                    label="Will import"
                    value={analysis.willImport}
                    tone="success"
                  />
                  <Stat
                    icon={AlertTriangle}
                    label="Invalid rows"
                    value={analysis.invalid}
                    tone="warning"
                  />
                  <Stat
                    icon={Copy}
                    label="Dupes in file"
                    value={analysis.duplicatesInFile}
                    tone="muted"
                  />
                  <Stat
                    icon={Users}
                    label="Already in campaign"
                    value={analysis.duplicatesExisting}
                    tone="muted"
                  />
                </div>

                {analysis.uniqueSample?.length ? (
                  <div>
                    <div className="text-xs font-medium mb-1.5">Sample patients to import</div>
                    <div className="rounded-xl border border-border overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50 text-muted-foreground">
                          <tr>
                            <th className="text-left px-3 py-2 font-medium">Name</th>
                            <th className="text-left px-3 py-2 font-medium">Phone</th>
                            <th className="text-left px-3 py-2 font-medium">DOB</th>
                            <th className="text-left px-3 py-2 font-medium">Language</th>
                            <th className="text-left px-3 py-2 font-medium">Member #</th>
                          </tr>
                        </thead>
                        <tbody>
                          {analysis.uniqueSample.map((row, i) => (
                            <tr key={i} className="border-t border-border">
                              <td className="px-3 py-2">
                                {String(row.patientName || `${row.patientFirstName || ""} ${row.patientLastName || ""}`)}
                              </td>
                              <td className="px-3 py-2">{String(row.patientPhone || "")}</td>
                              <td className="px-3 py-2 tabular-nums">{formatDobCell(row.patientDob)}</td>
                              <td className="px-3 py-2">{String(row.patientLanguage || "")}</td>
                              <td className="px-3 py-2">{String(row.patientMemberNumber || "")}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {analysis.duplicatesInFile > 0 || analysis.duplicatesExisting > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900/90">
                    Duplicate phone numbers will be skipped
                    {analysis.duplicatesInFile
                      ? ` (${analysis.duplicatesInFile} repeated in this file)`
                      : ""}
                    {analysis.duplicatesExisting
                      ? `${analysis.duplicatesInFile ? " and" : ""} ${analysis.duplicatesExisting} already on this campaign`
                      : ""}
                    .
                  </div>
                ) : null}

                {analysis.errors?.length ? (
                  <div className="rounded-xl border border-border bg-muted/20 p-3">
                    <div className="text-xs font-medium mb-1">Row issues (first {analysis.errors.length})</div>
                    <ul className="text-xs text-muted-foreground space-y-1 max-h-28 overflow-y-auto">
                      {analysis.errors.map((e, i) => (
                        <li key={`${e.row}-${i}`}>
                          Row {e.row}: {e.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        </div>

        <DialogFooter className="shrink-0 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            className="bg-gradient-primary text-primary-foreground"
            onClick={onConfirm}
            disabled={importing || !mappingComplete || !analysis?.willImport}
          >
            {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Import {analysis?.willImport ?? 0} patient{(analysis?.willImport ?? 0) === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Preview table only: show DOB as MM/DD/YYYY (Excel may use many formats). */
function formatDobCell(value: unknown) {
  if (value == null || value === "") return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${m}/${d}/${value.getFullYear()}`;
  }

  const text = String(value).trim();
  if (!text) return "";

  // Already MM/DD/YYYY from backend
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return text;

  const pad = (n: number) => String(n).padStart(2, "0");
  const asDob = (month: number, day: number, year: number) => {
    let y = year;
    if (y < 100) y += y >= 30 ? 1900 : 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31 || y < 1900 || y > 2100) return "";
    const dt = new Date(y, month - 1, day);
    if (dt.getFullYear() !== y || dt.getMonth() !== month - 1 || dt.getDate() !== day) return "";
    return `${pad(month)}/${pad(day)}/${y}`;
  };

  let m = text.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
  if (m) {
    const out = asDob(Number(m[2]), Number(m[3]), Number(m[1]));
    if (out) return out;
  }

  m = text.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = Number(m[3]);
    if (a > 12 && b <= 12) {
      const out = asDob(b, a, y);
      if (out) return out;
    } else {
      const us = asDob(a, b, y);
      if (us) return us;
      const eu = asDob(b, a, y);
      if (eu) return eu;
    }
  }

  // Excel serial
  if (/^\d{4,5}(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    const utc = Math.round((serial - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (!Number.isNaN(d.getTime())) {
      return asDob(d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCFullYear());
    }
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const out = asDob(parsed.getMonth() + 1, parsed.getDate(), parsed.getFullYear());
    if (out) return out;
  }

  return text;
}

function Stat({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof CheckCircle2;
  label: string;
  value: number;
  tone: "success" | "warning" | "muted";
}) {
  return (
    <div className="rounded-xl border border-border/80 bg-background p-3">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon
          className={cn(
            "h-3.5 w-3.5",
            tone === "success" && "text-success",
            tone === "warning" && "text-amber-600"
          )}
        />
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}
