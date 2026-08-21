import { useMemo } from "react";
import {
  addDays,
  addMinutes,
  differenceInMinutes,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { Clock, MapPin, Video } from "lucide-react";
import type { Appointment } from "@/lib/api";
import { getThemeColorOption } from "@/lib/themeColors";
import { cn } from "@/lib/utils";
import { formatNyTime, getZonedParts, isNyCalendarDay, zonedDateKey } from "@/lib/appTimeZone";

const WEEK_STARTS_ON = 0 as const;
const HOUR_START = 7;
const HOUR_END = 20;
const HOUR_HEIGHT = 72;
const MONTH_MAX_VISIBLE = 3;

type CalendarView = "month" | "week";

function clinicColors(themeColor?: string) {
  const opt = getThemeColorOption(themeColor);
  return { from: opt.from, to: opt.to, label: opt.label };
}

function eventStart(a: Appointment) {
  return new Date(a.startsAt);
}

function eventEnd(a: Appointment) {
  const end = new Date(a.endsAt);
  if (Number.isNaN(end.getTime()) || end <= eventStart(a)) {
    return addMinutes(eventStart(a), 30);
  }
  return end;
}

function formatTime(date: Date) {
  return formatNyTime(date);
}

function formatTimeRange(a: Appointment) {
  return `${formatTime(eventStart(a))} – ${formatTime(eventEnd(a))}`;
}

type LaidOutEvent = Appointment & { col: number; colCount: number };

function layoutDayEvents(events: Appointment[]): LaidOutEvent[] {
  const sorted = [...events].sort(
    (a, b) => eventStart(a).getTime() - eventStart(b).getTime()
  );
  const colEnds: number[] = [];
  const withCol = sorted.map((ev) => {
    const start = eventStart(ev).getTime();
    const end = eventEnd(ev).getTime();
    let col = colEnds.findIndex((t) => t <= start);
    if (col === -1) {
      col = colEnds.length;
      colEnds.push(end);
    } else {
      colEnds[col] = end;
    }
    return { ...ev, col, colCount: 1 };
  });

  return withCol.map((ev) => {
    const overlapping = withCol.filter((other) => {
      const aStart = eventStart(ev).getTime();
      const aEnd = eventEnd(ev).getTime();
      const bStart = eventStart(other).getTime();
      const bEnd = eventEnd(other).getTime();
      return aStart < bEnd && aEnd > bStart;
    });
    const colCount = Math.max(...overlapping.map((item) => item.col + 1), 1);
    return { ...ev, colCount };
  });
}

function AppointmentChip({
  appointment,
  compact = false,
  showClinic = false,
  className,
  onClick,
}: {
  appointment: Appointment;
  compact?: boolean;
  showClinic?: boolean;
  className?: string;
  onClick?: () => void;
}) {
  const colors = clinicColors(appointment.clinic?.themeColor);
  const start = eventStart(appointment);
  const minutes = Math.max(differenceInMinutes(eventEnd(appointment), start), 15);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative w-full overflow-hidden rounded-lg text-left shadow-sm ring-1 ring-black/5 transition",
        "hover:-translate-y-px hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
      style={{
        background: `linear-gradient(135deg, ${colors.from}22, ${colors.to}14)`,
      }}
      title={`${appointment.patientName} · ${formatTimeRange(appointment)}`}
    >
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ background: `linear-gradient(180deg, ${colors.from}, ${colors.to})` }}
      />
      <span className="block pl-2.5 pr-2 py-1 min-w-0">
        <span className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-foreground/70">
          <Clock className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{compact ? formatNyTime(start) : formatTimeRange(appointment)}</span>
          {appointment.meetLink ? <Video className="h-2.5 w-2.5 ml-auto shrink-0 opacity-70" /> : null}
        </span>
        <span className={cn("block font-semibold text-foreground truncate", compact ? "text-[11px]" : "text-xs")}>
          {appointment.patientName}
        </span>
        {!compact && minutes >= 25 ? (
          <span className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground truncate">
            {showClinic && appointment.clinic?.name ? (
              <>
                <MapPin className="h-2.5 w-2.5 shrink-0" />
                <span className="truncate">{appointment.clinic.name}</span>
              </>
            ) : (
              <span className="truncate capitalize">
                {appointment.patientType === "existing" ? "Existing patient" : "New patient"}
              </span>
            )}
          </span>
        ) : null}
      </span>
    </button>
  );
}

export default function AppointmentCalendar({
  view,
  cursor,
  appointments,
  showClinicName,
  onSelectAppointment,
  onSelectDay,
}: {
  view: CalendarView;
  cursor: Date;
  appointments: Appointment[];
  showClinicName: boolean;
  onSelectAppointment: (appointment: Appointment) => void;
  onSelectDay?: (day: Date, items: Appointment[]) => void;
}) {
  const monthDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: WEEK_STARTS_ON });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: WEEK_STARTS_ON });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON });
    return Array.from({ length: 7 }, (_, i) => addDays(start, i));
  }, [cursor]);

  const hours = useMemo(
    () => Array.from({ length: HOUR_END - HOUR_START }, (_, i) => HOUR_START + i),
    []
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const item of appointments) {
      const key = zonedDateKey(eventStart(item));
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime());
    }
    return map;
  }, [appointments]);

  const now = new Date();
  const nowNy = getZonedParts(now);
  const weekGridHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;
  const nowTop =
    ((nowNy.hour * 60 + nowNy.minute - HOUR_START * 60) / 60) * HOUR_HEIGHT;

  if (view === "month") {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="grid grid-cols-7 border-b border-border bg-muted/40">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((label) => (
            <div
              key={label}
              className="px-3 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {monthDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const items = eventsByDay.get(key) || [];
            const extra = Math.max(items.length - MONTH_MAX_VISIBLE, 0);
            const inMonth = isSameMonth(day, cursor);
            const today = isNyCalendarDay(day);
            return (
              <div
                key={key}
                className={cn(
                  "min-h-[132px] border-b border-r border-border/80 p-1.5 last:border-r-0",
                  !inMonth && "bg-muted/20"
                )}
              >
                <div className="mb-1.5 flex items-center justify-between px-0.5">
                  <span
                    className={cn(
                      "inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium",
                      today
                        ? "bg-gradient-primary text-primary-foreground shadow-sm"
                        : inMonth
                          ? "text-foreground"
                          : "text-muted-foreground/60"
                    )}
                  >
                    {format(day, "d")}
                  </span>
                  {items.length > 0 ? (
                    <span className="text-[10px] font-medium text-muted-foreground">
                      {items.length}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-1">
                  {items.slice(0, MONTH_MAX_VISIBLE).map((item) => (
                    <AppointmentChip
                      key={item.id}
                      appointment={item}
                      compact
                      showClinic={showClinicName}
                      onClick={() => onSelectAppointment(item)}
                    />
                  ))}
                  {extra > 0 ? (
                    <button
                      type="button"
                      className="w-full rounded-md px-1.5 py-0.5 text-left text-[11px] font-semibold text-primary hover:bg-primary/5"
                      onClick={() => onSelectDay?.(day, items)}
                    >
                      +{extra} more
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))] border-b border-border bg-muted/40">
        <div />
        {weekDays.map((day) => {
          const today = isNyCalendarDay(day);
          return (
            <div key={day.toISOString()} className="px-3 py-3 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {format(day, "EEE")}
              </div>
              <div
                className={cn(
                  "mx-auto mt-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-base font-semibold",
                  today ? "bg-gradient-primary text-primary-foreground shadow-sm" : "text-foreground"
                )}
              >
                {format(day, "d")}
              </div>
            </div>
          );
        })}
      </div>
      <div className="max-h-[min(72vh,820px)] overflow-auto">
        <div
          className="grid grid-cols-[72px_repeat(7,minmax(0,1fr))]"
          style={{ minHeight: weekGridHeight }}
        >
          <div className="relative border-r border-border/80">
            {hours.map((hour) => (
              <div
                key={hour}
                className="relative"
                style={{ height: HOUR_HEIGHT }}
              >
                <span className="absolute -top-2 right-2 text-[11px] font-medium text-muted-foreground">
                  {format(setHourDate(hour), "h a")} ET
                </span>
              </div>
            ))}
          </div>
          {weekDays.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const items = layoutDayEvents(eventsByDay.get(key) || []);
            const today = isNyCalendarDay(day);
            return (
              <div
                key={key}
                className={cn("relative border-r border-border/70 last:border-r-0", today && "bg-primary/[0.03]")}
                style={{ height: weekGridHeight }}
              >
                {hours.map((hour) => (
                  <div
                    key={hour}
                    className="border-b border-border/60"
                    style={{ height: HOUR_HEIGHT }}
                  />
                ))}
                {today && nowTop >= 0 && nowTop <= weekGridHeight ? (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-20"
                    style={{ top: nowTop }}
                  >
                    <div className="flex items-center">
                      <span className="h-2.5 w-2.5 -ml-1 rounded-full bg-primary shadow-[0_0_0_3px_hsl(var(--primary)/0.18)]" />
                      <span className="h-px flex-1 bg-primary/70" />
                    </div>
                  </div>
                ) : null}
                {items.map((item) => {
                  const start = eventStart(item);
                  const end = eventEnd(item);
                  const startNy = getZonedParts(start);
                  const startMin = startNy.hour * 60 + startNy.minute;
                  const duration = Math.max(differenceInMinutes(end, start), 20);
                  const top = ((startMin - HOUR_START * 60) / 60) * HOUR_HEIGHT;
                  const height = (duration / 60) * HOUR_HEIGHT;
                  const width = `calc(${100 / item.colCount}% - 6px)`;
                  const left = `calc(${(item.col / item.colCount) * 100}% + 3px)`;
                  return (
                    <div
                      key={item.id}
                      className="absolute z-10"
                      style={{ top: Math.max(top, 2), height: Math.max(height, 28), width, left }}
                    >
                      <AppointmentChip
                        appointment={item}
                        showClinic={showClinicName}
                        className="h-full"
                        onClick={() => onSelectAppointment(item)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function setHourDate(hour: number) {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return date;
}

export { formatTimeRange, eventStart, eventEnd };
