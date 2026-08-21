import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { isAfter, isBefore } from "date-fns";
import { motion } from "framer-motion";
import {
  CalendarCheck,
  Clock,
  Phone,
  UserRound,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Appointment } from "@/lib/api";
import { getThemeColorOption } from "@/lib/themeColors";
import { cn } from "@/lib/utils";
import { formatNyDate, formatNyTime, startEndOfNyDayIso } from "@/lib/appTimeZone";

export default function TodayAppointments({
  appointments,
  loading = false,
}: {
  appointments: Appointment[];
  loading?: boolean;
}) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  const items = useMemo(
    () =>
      [...appointments]
        .filter((row) => !isCancelled(row.status))
        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()),
    [appointments]
  );

  const nextId = items.find((row) => isAfter(new Date(row.startsAt), now))?.id ?? null;

  return (
    <section className="bg-card border border-border/80 rounded-2xl shadow-soft overflow-hidden flex flex-col h-full min-h-[420px]">
      <div className="px-5 py-4 border-b border-border flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold tracking-tight">Today’s appointments</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            {formatNyDate(now, { year: undefined })} · {items.length}{" "}
            {items.length === 1 ? "visit" : "visits"}
          </p>
        </div>
        <Button variant="outline" size="sm" className="shrink-0" asChild>
          <Link to="/appointments">Calendar</Link>
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="p-4 space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-[72px] rounded-xl bg-muted animate-pulse" />
            ))}
          </div>
        )}

        {!loading && items.length === 0 && (
          <div className="h-full min-h-[280px] flex flex-col items-center justify-center text-center px-6">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mb-3">
              <CalendarCheck className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium">No appointments today</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
              Bookings that start today will appear here as they come in from chat and phone.
            </p>
          </div>
        )}

        {!loading && items.length > 0 && (
          <ol className="p-2">
            {items.map((row, index) => {
              const start = new Date(row.startsAt);
              const end = appointmentEnd(row);
              const live = !isAfter(start, now) && isBefore(now, end);
              const past = !live && isBefore(end, now);
              const next = row.id === nextId;
              const colors = getThemeColorOption(row.clinic?.themeColor);
              return (
                <motion.li
                  key={row.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Link
                    to="/appointments"
                    className={cn(
                      "flex gap-3 rounded-xl px-3 py-3 transition-colors",
                      live && "bg-primary/[0.04]",
                      next && !live && "bg-secondary/70",
                      !live && !next && "hover:bg-muted/60",
                      past && "opacity-60"
                    )}
                  >
                    <div className="w-[72px] shrink-0 pt-0.5">
                      <div className="text-sm font-semibold tabular-nums leading-none">
                        {formatNyTime(start)}
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-1">
                        {formatNyTime(end)}
                      </div>
                    </div>
                    <div
                      className="w-1 rounded-full shrink-0 self-stretch"
                      style={{ background: `linear-gradient(180deg, ${colors.from}, ${colors.to})` }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm truncate">{row.patientName || "Patient"}</div>
                        {live && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-primary/10 text-primary px-2 py-0.5 shrink-0">
                            Now
                          </span>
                        )}
                        {next && !live && (
                          <span className="text-[10px] font-semibold uppercase tracking-wide rounded-full bg-primary/10 text-primary px-2 py-0.5 shrink-0">
                            Next
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground truncate mt-0.5">
                        {row.clinic?.name || "Clinic"}
                        {row.patientType ? ` · ${patientTypeLabel(row.patientType)}` : ""}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1.5 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          {row.source === "phone" ? (
                            <Phone className="h-3 w-3" />
                          ) : (
                            <UserRound className="h-3 w-3" />
                          )}
                          {sourceLabel(row.source)}
                        </span>
                        {row.patientPhone && (
                          <span className="truncate">{row.patientPhone}</span>
                        )}
                        {row.meetLink && (
                          <span className="inline-flex items-center gap-1 text-primary">
                            <Video className="h-3 w-3" />
                            Meet
                          </span>
                        )}
                      </div>
                    </div>
                  </Link>
                </motion.li>
              );
            })}
          </ol>
        )}
      </div>

      {!loading && items.length > 0 && (
        <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          {nextSummary(items, now, nextId)}
        </div>
      )}
    </section>
  );
}

export function todayRangeIso(date = new Date()) {
  return startEndOfNyDayIso(date);
}

function appointmentEnd(row: Appointment) {
  const end = new Date(row.endsAt);
  if (Number.isNaN(end.getTime()) || end <= new Date(row.startsAt)) {
    const start = new Date(row.startsAt);
    start.setMinutes(start.getMinutes() + 30);
    return start;
  }
  return end;
}

function isCancelled(status: string) {
  const value = String(status || "").toLowerCase();
  return value === "cancelled" || value === "canceled";
}

function sourceLabel(source: string) {
  if (source === "phone") return "Phone";
  if (source === "voice") return "Voice";
  return "Web chat";
}

function patientTypeLabel(type: string) {
  if (type === "new") return "New patient";
  if (type === "existing") return "Existing";
  return type;
}

function nextSummary(items: Appointment[], now: Date, nextId: string | null) {
  const live = items.find((row) => {
    const start = new Date(row.startsAt);
    const end = appointmentEnd(row);
    return !isAfter(start, now) && isBefore(now, end);
  });
  if (live) return `In session · ${live.patientName}`;
  const next = items.find((row) => row.id === nextId);
  if (next) return `Next up · ${formatNyTime(next.startsAt)} · ${next.patientName}`;
  return "All of today’s visits are complete";
}
