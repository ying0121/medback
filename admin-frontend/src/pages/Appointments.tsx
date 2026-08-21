import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Mail,
  MapPin,
  Phone,
  Trash2,
  UserRound,
  Video,
} from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import AppointmentCalendar, {
  eventStart,
  formatTimeRange,
} from "@/components/admin/AppointmentCalendar";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  cancelAppointment,
  listAppointments,
  listClinics,
  type Appointment,
  type Clinic,
} from "@/lib/api";
import { getThemeColorOption, themeGradient } from "@/lib/themeColors";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatNyDate, formatNyTime, nyCalendarAnchor, nyCivilRangeIso } from "@/lib/appTimeZone";

type CalendarView = "month" | "week";

const WEEK_STARTS_ON = 0 as const;

function sourceLabel(source: string) {
  if (source === "phone") return "Phone call";
  if (source === "voice") return "Voice assistant";
  return "Web chat";
}

function patientTypeLabel(type: string) {
  if (type === "existing") return "Existing patient";
  if (type === "new") return "New patient";
  return type || "Not specified";
}

function displayValue(value?: string | null) {
  const text = String(value || "").trim();
  return text || "—";
}

function rangeForView(view: CalendarView, cursor: Date) {
  if (view === "week") {
    return nyCivilRangeIso(
      startOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }),
      endOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON })
    );
  }
  return nyCivilRangeIso(
    startOfWeek(startOfMonth(cursor), { weekStartsOn: WEEK_STARTS_ON }),
    endOfWeek(endOfMonth(cursor), { weekStartsOn: WEEK_STARTS_ON })
  );
}

export default function Appointments() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicFilter, setClinicFilter] = useState("all");
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => nyCalendarAnchor());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Appointment | null>(null);
  const [dayList, setDayList] = useState<{ day: Date; items: Appointment[] } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Appointment | null>(null);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const allowed = user?.role === "Admin" ? undefined : user?.clinicIds;
    listClinics().then((all) => {
      setClinics(allowed ? all.filter((c) => allowed.includes(c.id)) : all);
    });
  }, [user]);

  const loadAppointments = useCallback(async () => {
    const { from, to } = rangeForView(view, cursor);
    setLoading(true);
    try {
      const rows = await listAppointments({
        clinicId: clinicFilter === "all" ? undefined : clinicFilter,
        from,
        to,
      });
      const allowed = user?.role === "Admin" ? null : user?.clinicIds;
      setAppointments(allowed ? rows.filter((row) => allowed.includes(row.clinicId)) : rows);
    } finally {
      setLoading(false);
    }
  }, [clinicFilter, view, cursor, user]);

  useEffect(() => {
    loadAppointments();
  }, [loadAppointments]);

  const handleCancelAppointment = async () => {
    if (!cancelTarget) return;
    try {
      setCancelling(true);
      const result = await cancelAppointment(cancelTarget.id);
      setAppointments((rows) => rows.filter((row) => row.id !== cancelTarget.id));
      setDayList((current) =>
        current
          ? { ...current, items: current.items.filter((item) => item.id !== cancelTarget.id) }
          : null
      );
      if (selected?.id === cancelTarget.id) {
        setSelected(null);
      }
      toast({
        title: "Appointment cancelled",
        description: result.calendarCancelled
          ? `${cancelTarget.patientName}'s appointment was cancelled and the Google Calendar event was removed.`
          : `${cancelTarget.patientName}'s appointment was cancelled.`,
      });
      setCancelTarget(null);
    } catch (err) {
      toast({
        title: "Could not cancel appointment",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setCancelling(false);
    }
  };

  const title = view === "month"
    ? format(cursor, "MMMM yyyy")
    : `${format(startOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }), "MMM d")} – ${format(
        endOfWeek(cursor, { weekStartsOn: WEEK_STARTS_ON }),
        "MMM d, yyyy"
      )}`;

  const selectedColors = selected
    ? getThemeColorOption(selected.clinic?.themeColor)
    : null;

  const clinicLegend = useMemo(() => {
    if (clinicFilter !== "all") return [];
    const seen = new Set<string>();
    return appointments
      .map((item) => item.clinic)
      .filter((clinic): clinic is NonNullable<Appointment["clinic"]> => {
        if (!clinic || seen.has(clinic.id)) return false;
        seen.add(clinic.id);
        return true;
      });
  }, [appointments, clinicFilter]);

  return (
    <div className="p-8 max-w-[1600px] mx-auto">
      <PageHeader
        title="Appointments"
        description="Clinic schedule in Eastern Time (America/New_York)."
        actions={(
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select value={clinicFilter} onValueChange={setClinicFilter}>
              <SelectTrigger className="w-[240px] bg-card">
                <SelectValue placeholder="All Clinics" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Clinics</SelectItem>
                {clinics.map((clinic) => (
                  <SelectItem key={clinic.id} value={clinic.id}>
                    {clinic.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="inline-flex rounded-lg border border-border bg-card p-1">
              <Button
                type="button"
                size="sm"
                variant={view === "month" ? "default" : "ghost"}
                className={cn(view === "month" && "bg-gradient-primary text-primary-foreground")}
                onClick={() => setView("month")}
              >
                <CalendarDays className="h-4 w-4 mr-1.5" />
                Month
              </Button>
              <Button
                type="button"
                size="sm"
                variant={view === "week" ? "default" : "ghost"}
                className={cn(view === "week" && "bg-gradient-primary text-primary-foreground")}
                onClick={() => setView("week")}
              >
                <CalendarRange className="h-4 w-4 mr-1.5" />
                Week
              </Button>
            </div>
          </div>
        )}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor((d) => (view === "month" ? addMonths(d, -1) : addWeeks(d, -1)))}
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setCursor((d) => (view === "month" ? addMonths(d, 1) : addWeeks(d, 1)))}
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => setCursor(nyCalendarAnchor())}>
            Today
          </Button>
          <h2 className="ml-2 text-xl font-semibold tracking-tight">{title}</h2>
        </div>
        <div className="text-sm text-muted-foreground">
          {loading ? "Loading…" : `${appointments.length} appointment${appointments.length === 1 ? "" : "s"}`}
        </div>
      </div>

      {clinicLegend.length > 1 ? (
        <div className="mb-4 flex flex-wrap gap-2">
          {clinicLegend.map((clinic) => {
            const colors = getThemeColorOption(clinic.themeColor);
            return (
              <span
                key={clinic.id}
                className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-card px-2.5 py-1 text-xs font-medium"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: themeGradient(colors.from, colors.to) }}
                />
                {clinic.name}
              </span>
            );
          })}
        </div>
      ) : null}

      <AppointmentCalendar
        view={view}
        cursor={cursor}
        appointments={appointments}
        showClinicName={clinicFilter === "all"}
        onSelectAppointment={setSelected}
        onSelectDay={(day, items) => setDayList({ day, items })}
      />

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-lg">
          {selected ? (
            <>
              <DialogHeader>
                <div
                  className="mb-3 h-1.5 w-16 rounded-full"
                  style={
                    selectedColors
                      ? { background: themeGradient(selectedColors.from, selectedColors.to) }
                      : undefined
                  }
                />
                <DialogTitle>Appointment details</DialogTitle>
                <DialogDescription>
                  {formatNyDate(eventStart(selected))} · {formatTimeRange(selected)} ET
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-5 text-sm">
                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Patient information
                  </h3>
                  <div className="space-y-2">
                    <DetailRow icon={UserRound} label="Full name" value={displayValue(selected.patientName)} />
                    <DetailRow label="Date of birth" value={displayValue(selected.patientDob)} />
                    <DetailRow icon={Phone} label="Phone" value={displayValue(selected.patientPhone)} />
                    <DetailRow icon={Mail} label="Email" value={displayValue(selected.patientEmail)} />
                    <DetailRow
                      label="Patient status"
                      value={patientTypeLabel(selected.patientType)}
                    />
                  </div>
                </section>

                <section>
                  <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Appointment
                  </h3>
                  <div className="space-y-2">
                    <DetailRow icon={MapPin} label="Clinic" value={displayValue(selected.clinic?.name)} />
                    <DetailRow label="Channel" value={sourceLabel(selected.source)} />
                    {selected.meetLink ? (
                      <a
                        href={selected.meetLink}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm font-medium text-primary hover:bg-muted"
                      >
                        <Video className="h-4 w-4" />
                        Join Google Meet
                      </a>
                    ) : null}
                  </div>
                </section>

                <div className="flex justify-end border-t border-border pt-4">
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setCancelTarget(selected)}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Cancel appointment
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && !cancelling && setCancelTarget(null)}>
        <AlertDialogContent>
          {cancelTarget ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Cancel this appointment?</AlertDialogTitle>
                <AlertDialogDescription asChild>
                  <div className="space-y-3 text-sm text-muted-foreground">
                    <p>
                      This will remove the appointment for{" "}
                      <strong className="text-foreground">{cancelTarget.patientName}</strong> on{" "}
                      <strong className="text-foreground">
                        {formatNyDate(eventStart(cancelTarget), { weekday: undefined, year: undefined })} at{" "}
                        {formatNyTime(eventStart(cancelTarget))} ET
                      </strong>
                      .
                    </p>
                    <div className="rounded-xl border border-border bg-muted/30 px-3 py-2.5 text-left">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Patient information
                      </div>
                      <div className="mt-2 space-y-1 text-foreground">
                        <div><span className="text-muted-foreground">Name:</span> {displayValue(cancelTarget.patientName)}</div>
                        <div><span className="text-muted-foreground">DOB:</span> {displayValue(cancelTarget.patientDob)}</div>
                        <div><span className="text-muted-foreground">Phone:</span> {displayValue(cancelTarget.patientPhone)}</div>
                        <div><span className="text-muted-foreground">Email:</span> {displayValue(cancelTarget.patientEmail)}</div>
                        <div><span className="text-muted-foreground">Status:</span> {patientTypeLabel(cancelTarget.patientType)}</div>
                      </div>
                    </div>
                    {cancelTarget.googleEventId ? (
                      <p>
                        The linked Google Calendar event will also be cancelled and attendees will be notified.
                      </p>
                    ) : null}
                  </div>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={cancelling}>Keep appointment</AlertDialogCancel>
                <AlertDialogAction
                  disabled={cancelling}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  onClick={(event) => {
                    event.preventDefault();
                    void handleCancelAppointment();
                  }}
                >
                  {cancelling ? "Cancelling…" : "Cancel appointment"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          ) : null}
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!dayList} onOpenChange={(open) => !open && setDayList(null)}>
        <DialogContent className="max-w-md">
          {dayList ? (
            <>
              <DialogHeader>
                <DialogTitle>{format(dayList.day, "EEEE, MMMM d")}</DialogTitle>
                <DialogDescription>
                  {dayList.items.length} appointment{dayList.items.length === 1 ? "" : "s"}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                {dayList.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="w-full rounded-xl border border-border bg-card px-3 py-2.5 text-left hover:bg-muted/40"
                    onClick={() => {
                      setDayList(null);
                      setSelected(item);
                    }}
                  >
                    <div className="text-xs font-semibold text-muted-foreground">
                      {formatTimeRange(item)}
                    </div>
                    <div className="font-medium">{item.patientName}</div>
                    <div className="text-xs text-muted-foreground">{item.clinic?.name}</div>
                  </button>
                ))}
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon?: typeof Phone;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-border/70 bg-muted/30 px-3 py-2.5">
      {Icon ? <Icon className="mt-0.5 h-4 w-4 text-muted-foreground" /> : <span className="w-4" />}
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="font-medium break-all">{value}</div>
      </div>
    </div>
  );
}
