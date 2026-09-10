import { useEffect, useState } from "react";
import { CloudDownload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  syncCampaignContactsFromExternal,
  type CampaignContactItem,
  type CampaignItem,
  type PatientApiFieldMapping,
  type PatientApiHttpMethod,
} from "@/lib/api";
import { toast } from "sonner";

const DEFAULT_MAPPING: PatientApiFieldMapping = {
  firstName: "firstName",
  lastName: "lastName",
  dob: "dob",
  phone: "phone",
  language: "language",
  memberNumber: "memberNumber",
};

const MAPPING_FIELDS: Array<{ key: keyof PatientApiFieldMapping; label: string; placeholder: string }> = [
  { key: "firstName", label: "First name", placeholder: "e.g. firstName or first_name" },
  { key: "lastName", label: "Last name", placeholder: "e.g. lastName or last_name" },
  { key: "dob", label: "Date of birth", placeholder: "e.g. dob or dateOfBirth" },
  { key: "phone", label: "Phone", placeholder: "e.g. phone or phoneNumber" },
  { key: "language", label: "Language", placeholder: "e.g. language or lang" },
  { key: "memberNumber", label: "Member number", placeholder: "e.g. memberNumber or mrn" },
];

type Props = {
  open: boolean;
  campaignId: string;
  campaignName?: string;
  hasExistingContacts?: boolean;
  onClose: () => void;
  onSynced: (payload: {
    item: CampaignItem;
    contacts: CampaignContactItem[];
    imported: number;
  }) => void;
};

export default function PatientApiSyncDialog({
  open,
  campaignId,
  campaignName,
  hasExistingContacts = false,
  onClose,
  onSynced,
}: Props) {
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState<PatientApiHttpMethod>("GET");
  const [token, setToken] = useState("");
  const [requestBody, setRequestBody] = useState("{\n  \n}");
  const [listPath, setListPath] = useState("patients");
  const [mapping, setMapping] = useState<PatientApiFieldMapping>({ ...DEFAULT_MAPPING });
  const [replace, setReplace] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUrl("");
    setMethod("GET");
    setToken("");
    setRequestBody("{\n  \n}");
    setListPath("patients");
    setMapping({ ...DEFAULT_MAPPING });
    setReplace(false);
  }, [open, campaignId]);

  const setMapField = (key: keyof PatientApiFieldMapping, value: string) => {
    setMapping((prev) => ({ ...prev, [key]: value }));
  };

  const onSync = async () => {
    if (!url.trim()) return toast.error("API URL is required");
    for (const field of MAPPING_FIELDS) {
      if (!String(mapping[field.key] || "").trim()) {
        return toast.error(`Enter the API param name for ${field.label}`);
      }
    }

    let body: unknown = undefined;
    if (method === "POST") {
      const raw = requestBody.trim();
      if (raw && raw !== "{}") {
        try {
          body = JSON.parse(raw);
        } catch {
          return toast.error("Request body must be valid JSON");
        }
      } else {
        body = {};
      }
    }

    setSyncing(true);
    try {
      const result = await syncCampaignContactsFromExternal(campaignId, {
        url: url.trim(),
        method,
        token: token.trim() || undefined,
        body,
        listPath: listPath.trim() || undefined,
        mapping: {
          firstName: mapping.firstName.trim(),
          lastName: mapping.lastName.trim(),
          dob: mapping.dob.trim(),
          phone: mapping.phone.trim(),
          language: mapping.language.trim(),
          memberNumber: mapping.memberNumber.trim(),
        },
        replace: hasExistingContacts ? replace : false,
      });
      onSynced({
        item: result.item,
        contacts: result.contacts,
        imported: result.imported,
      });
      toast.success(`Synced ${result.imported} patient${result.imported === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "External sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl flex max-h-[90vh] flex-col gap-0 overflow-hidden p-6">
        <div className="h-1.5 w-16 rounded-full bg-gradient-primary mb-2 shrink-0" />
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <CloudDownload className="h-5 w-5 text-primary" />
            Sync patients from API
          </DialogTitle>
          <DialogDescription>
            {campaignName ? (
              <>
                Campaign: <span className="font-medium text-foreground">{campaignName}</span>.{" "}
              </>
            ) : null}
            Choose GET or POST, then enter the response field names that map to each patient field.
            Nested keys are supported with dots (e.g. <code className="text-xs">patient.phone</code>).
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto -mx-6 px-6 py-4 space-y-5 [scrollbar-gutter:stable]">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_120px] gap-3">
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                API URL
              </Label>
              <Input
                className="mt-1.5"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…/patients"
              />
            </div>
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Method
              </Label>
              <Select value={method} onValueChange={(v) => setMethod(v as PatientApiHttpMethod)}>
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="GET">GET</SelectItem>
                  <SelectItem value="POST">POST</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Bearer token (optional)
            </Label>
            <Input
              className="mt-1.5"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Optional"
            />
          </div>

          <div>
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Patients list path (optional)
            </Label>
            <Input
              className="mt-1.5"
              value={listPath}
              onChange={(e) => setListPath(e.target.value)}
              placeholder="patients · data · leave blank if root is an array"
            />
            <p className="text-xs text-muted-foreground mt-1.5">
              Where the patient array lives in the JSON response.
            </p>
          </div>

          {method === "POST" ? (
            <div>
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Request body (JSON)
              </Label>
              <Textarea
                className="mt-1.5 font-mono text-xs min-h-[88px]"
                value={requestBody}
                onChange={(e) => setRequestBody(e.target.value)}
                placeholder='{ "clinicId": "..." }'
              />
            </div>
          ) : null}

          <div className="space-y-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Field mapping
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Enter the API response param name for each patient field.
              </p>
            </div>
            {MAPPING_FIELDS.map((field) => (
              <div
                key={field.key}
                className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-2 items-center"
              >
                <Label className="text-sm">
                  {field.label}
                  <span className="text-destructive"> *</span>
                </Label>
                <Input
                  value={mapping[field.key]}
                  onChange={(e) => setMapField(field.key, e.target.value)}
                  placeholder={field.placeholder}
                  className="font-mono text-sm"
                />
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
                  If unchecked, synced patients are added alongside the current list.
                </span>
              </span>
            </label>
          ) : null}
        </div>

        <DialogFooter className="shrink-0 border-t border-border pt-4">
          <Button variant="outline" onClick={onClose} disabled={syncing}>
            Cancel
          </Button>
          <Button
            className="bg-gradient-primary text-primary-foreground"
            onClick={onSync}
            disabled={syncing}
          >
            {syncing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Sync patients
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
