import { useMemo, useState } from "react";
import { format, isValid, parse, setHours, setMinutes, startOfDay } from "date-fns";
import { CalendarClock, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const LOCAL_FORMAT = "yyyy-MM-dd'T'HH:mm";

function parseLocalValue(value?: string): Date | null {
  if (!value?.trim()) return null;
  const parsed = parse(value, LOCAL_FORMAT, new Date());
  return isValid(parsed) ? parsed : null;
}

function toLocalValue(date: Date): string {
  return format(date, LOCAL_FORMAT);
}

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

type Props = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
};

export default function DateTimePicker({
  value,
  onChange,
  placeholder = "Select date and time",
  className,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parseLocalValue(value), [value]);

  const hour = selected ? format(selected, "HH") : "09";
  const rawMinute = selected ? selected.getMinutes() : 0;
  const minuteValue = MINUTES.reduce((best, m) =>
    Math.abs(Number(m) - rawMinute) < Math.abs(Number(best) - rawMinute) ? m : best
  );

  const apply = (day: Date, h: string, m: string) => {
    const next = setMinutes(setHours(startOfDay(day), Number(h)), Number(m));
    onChange(toLocalValue(next));
  };

  const onSelectDay = (day?: Date) => {
    if (!day) return;
    apply(day, hour, minuteValue);
  };

  const onHour = (h: string) => {
    const day = selected || new Date();
    apply(day, h, minuteValue);
  };

  const onMinute = (m: string) => {
    const day = selected || new Date();
    apply(day, hour, m);
  };

  const presets = [
    {
      label: "Tomorrow 9:00 AM",
      build: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return setMinutes(setHours(startOfDay(d), 9), 0);
      },
    },
    {
      label: "Tomorrow 2:00 PM",
      build: () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        return setMinutes(setHours(startOfDay(d), 14), 0);
      },
    },
    {
      label: "In 1 hour",
      build: () => {
        const d = new Date();
        d.setHours(d.getHours() + 1, 0, 0, 0);
        const snapped = Math.round(d.getMinutes() / 5) * 5;
        return setMinutes(d, snapped >= 60 ? 55 : snapped);
      },
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "mt-1.5 w-full justify-start text-left font-normal h-10 px-3",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarClock className="mr-2 h-4 w-4 shrink-0 text-primary/80" />
          {selected ? (
            <span className="truncate">
              <span className="font-medium text-foreground">{format(selected, "EEE, MMM d, yyyy")}</span>
              <span className="text-muted-foreground mx-1.5">·</span>
              <span className="tabular-nums">{format(selected, "h:mm a")}</span>
            </span>
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-0 overflow-hidden border-border/80 shadow-soft"
        sideOffset={6}
      >
        <div className="flex flex-col sm:flex-row">
          <div className="border-b sm:border-b-0 sm:border-r border-border/70">
            <Calendar
              mode="single"
              selected={selected || undefined}
              onSelect={onSelectDay}
              initialFocus
            />
          </div>
          <div className="w-full sm:w-[200px] p-4 flex flex-col gap-4 bg-muted/20">
            <div>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                <Clock className="h-3.5 w-3.5" />
                Time
              </div>
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Label className="sr-only">Hour</Label>
                  <Select value={hour} onValueChange={onHour}>
                    <SelectTrigger className="h-9 tabular-nums">
                      <SelectValue placeholder="HH" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {HOURS.map((h) => (
                        <SelectItem key={h} value={h} className="tabular-nums">
                          {format(setHours(startOfDay(new Date()), Number(h)), "h a")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <span className="text-muted-foreground font-medium">:</span>
                <div className="w-[72px]">
                  <Label className="sr-only">Minute</Label>
                  <Select value={minuteValue} onValueChange={onMinute}>
                    <SelectTrigger className="h-9 tabular-nums">
                      <SelectValue placeholder="MM" />
                    </SelectTrigger>
                    <SelectContent className="max-h-56">
                      {MINUTES.map((m) => (
                        <SelectItem key={m} value={m} className="tabular-nums">
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Quick pick
              </div>
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className="w-full text-left text-xs rounded-lg px-2.5 py-2 border border-transparent hover:border-border hover:bg-background transition-colors text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    onChange(toLocalValue(p.build()));
                    setOpen(false);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <Button
              type="button"
              size="sm"
              className="mt-auto bg-gradient-primary text-primary-foreground"
              disabled={!selected}
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
