import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_KEYS,
  WEEKDAY_LABELS,
  defaultWeeklyHours,
  type DayHours,
  type WeeklyHours,
} from "@/lib/scheduleHours";

type Props = {
  value: WeeklyHours;
  onChange: (next: WeeklyHours) => void;
  className?: string;
};

const TIME_OPTIONS: string[] = (() => {
  const opts: string[] = [];
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 15, 30, 45]) {
      opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return opts;
})();

function formatTimeLabel(hhmm: string): string {
  const [hs, ms] = hhmm.split(":");
  const h = Number(hs);
  const m = Number(ms);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

function ensureOption(value: string): string[] {
  if (TIME_OPTIONS.includes(value)) return TIME_OPTIONS;
  return [...TIME_OPTIONS, value].sort();
}

export default function WeeklyHoursEditor({ value, onChange, className }: Props) {
  const hours = value || defaultWeeklyHours();

  const patchDay = (key: (typeof WEEKDAY_KEYS)[number], patch: Partial<DayHours>) => {
    onChange({
      ...hours,
      [key]: { ...hours[key], ...patch },
    });
  };

  return (
    <div className={cn("rounded-lg border border-border overflow-hidden", className)}>
      <div className="hidden sm:grid grid-cols-[7.5rem_4.5rem_1fr_auto_1fr] gap-3 px-3 py-2 bg-muted/40 border-b border-border text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <span>Day</span>
        <span>Open</span>
        <span>Opens</span>
        <span className="w-4" />
        <span>Closes</span>
      </div>
      <ul className="divide-y divide-border">
        {WEEKDAY_KEYS.map((key) => {
          const day = hours[key];
          const startOpts = ensureOption(day.start);
          const endOpts = ensureOption(day.end);
          return (
            <li
              key={key}
              className={cn(
                "grid grid-cols-1 sm:grid-cols-[7.5rem_4.5rem_1fr_auto_1fr] gap-2 sm:gap-3 items-center px-3 py-2.5 transition-colors",
                day.enabled ? "bg-background" : "bg-muted/20"
              )}
            >
              <div className="flex items-center justify-between sm:block">
                <span className="text-sm font-medium">{WEEKDAY_LABELS[key]}</span>
                <div className="flex items-center gap-2 sm:hidden">
                  <span className="text-xs text-muted-foreground">
                    {day.enabled ? "Open" : "Closed"}
                  </span>
                  <Switch
                    checked={Boolean(day.enabled)}
                    onCheckedChange={(checked) => patchDay(key, { enabled: checked })}
                    aria-label={`${WEEKDAY_LABELS[key]} open`}
                  />
                </div>
              </div>

              <div className="hidden sm:flex items-center">
                <Switch
                  checked={Boolean(day.enabled)}
                  onCheckedChange={(checked) => patchDay(key, { enabled: checked })}
                  aria-label={`${WEEKDAY_LABELS[key]} open`}
                />
              </div>

              <Select
                value={day.start}
                disabled={!day.enabled}
                onValueChange={(v) => patchDay(key, { start: v })}
              >
                <SelectTrigger className="h-9" aria-label={`${WEEKDAY_LABELS[key]} opens`}>
                  <SelectValue placeholder="Start" />
                </SelectTrigger>
                <SelectContent className="z-[80] max-h-64">
                  {startOpts.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatTimeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <span
                className={cn(
                  "hidden sm:inline text-xs text-center text-muted-foreground",
                  !day.enabled && "opacity-40"
                )}
              >
                to
              </span>

              <Select
                value={day.end}
                disabled={!day.enabled}
                onValueChange={(v) => patchDay(key, { end: v })}
              >
                <SelectTrigger className="h-9" aria-label={`${WEEKDAY_LABELS[key]} closes`}>
                  <SelectValue placeholder="End" />
                </SelectTrigger>
                <SelectContent className="z-[80] max-h-64">
                  {endOpts.map((t) => (
                    <SelectItem key={t} value={t}>
                      {formatTimeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
