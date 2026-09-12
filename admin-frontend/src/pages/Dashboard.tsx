import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import {
  Activity,
  Building2,
  CalendarCheck,
  MessageCircle,
  MessagesSquare,
  PhoneCall,
  RefreshCw,
  Users,
} from "lucide-react";
import DashboardInbox from "@/components/admin/DashboardInbox";
import TodayAppointments, { todayRangeIso } from "@/components/admin/TodayAppointments";
import SparkStatCard from "@/components/admin/SparkStatCard";
import { Button } from "@/components/ui/button";
import {
  getStats,
  listAppointments,
  listClinics,
  type Appointment,
  type Clinic,
  type DashboardClinicStat,
  type DashboardStats,
} from "@/lib/api";
import { getThemeColorOption } from "@/lib/themeColors";
import { useAuth } from "@/contexts/AuthContext";
import { formatNyDate, getZonedParts } from "@/lib/appTimeZone";
import { cn } from "@/lib/utils";

const pageEase = [0.22, 1, 0.36, 1] as const;

const CHANNEL_COLORS = {
  conversations: "hsl(173 62% 32%)",
  phoneCalls: "hsl(199 84% 42%)",
  webChats: "hsl(187 72% 40%)",
  appointments: "hsl(152 58% 36%)",
} as const;

type ChartRange = 7 | 30 | 60;

export default function Dashboard() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [chartRange, setChartRange] = useState<ChartRange>(30);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let mounted = true;
    const allowed = user?.role === "Admin" ? undefined : user?.clinicIds;
    setLoadingStats(true);
    listClinics().then((all) => {
      if (!mounted) return;
      setClinics(allowed ? all.filter((clinic) => allowed.includes(clinic.id)) : all);
    });
    getStats(allowed)
      .then((data) => {
        if (mounted) setStats(data);
      })
      .finally(() => {
        if (mounted) setLoadingStats(false);
      });
    const { from, to } = todayRangeIso();
    setLoadingToday(true);
    listAppointments({ from, to })
      .then((rows) => {
        if (!mounted) return;
        setTodayAppointments(
          allowed ? rows.filter((row) => allowed.includes(row.clinicId)) : rows
        );
      })
      .finally(() => {
        if (mounted) setLoadingToday(false);
      });
    return () => {
      mounted = false;
    };
  }, [user, refreshKey]);

  const firstName = user?.name?.split(" ")[0] || "there";
  const perDay = stats?.perDay ?? [];
  const chartData = useMemo(() => perDay.slice(-chartRange), [perDay, chartRange]);
  const clinicStats = useMemo(() => {
    const map = new Map((stats?.byClinic ?? []).map((row) => [row.clinicId, row]));
    return map;
  }, [stats]);

  const liveAppts = useMemo(() => {
    const now = Date.now();
    return todayAppointments.filter((row) => {
      const start = new Date(row.startsAt).getTime();
      const end = new Date(row.endsAt).getTime();
      const status = String(row.status || "").toLowerCase();
      if (status === "cancelled" || status === "canceled") return false;
      return start <= now && now < (Number.isNaN(end) || end <= start ? start + 30 * 60 * 1000 : end);
    }).length;
  }, [todayAppointments]);

  const weekVolume =
    (stats?.week.conversations ?? 0) +
    (stats?.week.phoneCalls ?? 0) +
    (stats?.week.webChats ?? 0);

  return (
    <div className="admin-page">
      {/* Hero */}
      <header className="relative mb-7 overflow-hidden rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-soft">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/[0.14] via-med-sky/[0.08] to-med-mint/[0.06]" />
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute left-[40%] -bottom-20 h-40 w-40 rounded-full bg-med-sky/15 blur-3xl" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        <div className="relative p-5 sm:p-6 lg:p-7">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <motion.div
                className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-40" />
                  <span className="relative h-2 w-2 rounded-full bg-primary" />
                </span>
                Operations overview
              </motion.div>
              <motion.h1
                className="font-display text-3xl sm:text-[2.1rem] font-semibold tracking-tight"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, ease: pageEase }}
              >
                {greetingForHour(getZonedParts(new Date()).hour)}, {firstName}
              </motion.h1>
              <motion.p
                className="text-muted-foreground mt-1.5 max-w-xl text-[15px] leading-relaxed"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.05, ease: pageEase }}
              >
                {formatNyDate(new Date())} ET · Channel volume, today’s schedule, and clinic
                conversations in one view.
              </motion.p>
            </div>

            <motion.div
              className="flex flex-wrap items-center gap-2"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08, ease: pageEase }}
            >
              <PulseChip
                icon={Building2}
                label={`${clinics.length} clinic${clinics.length === 1 ? "" : "s"}`}
                tone="sky"
              />
              <PulseChip
                icon={CalendarCheck}
                label={
                  loadingToday
                    ? "Loading visits…"
                    : `${todayAppointments.length} today${liveAppts ? ` · ${liveAppts} live` : ""}`
                }
                tone="mint"
              />
              <PulseChip
                icon={Activity}
                label={loadingStats ? "Syncing…" : `${weekVolume.toLocaleString()} events this week`}
                tone="primary"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setRefreshKey((k) => k + 1)}
              >
                <RefreshCw className={cn("h-3.5 w-3.5 mr-1.5", loadingStats && "animate-spin")} />
                Refresh
              </Button>
            </motion.div>
          </div>

          <motion.div
            className="mt-5 flex flex-wrap gap-2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.12, duration: 0.35 }}
          >
            {[
              { to: "/appointments", label: "Appointments" },
              { to: "/campaigns", label: "Campaigns" },
              { to: "/calls", label: "Calls" },
              { to: "/agents", label: "Agents" },
            ].map((link) => (
              <Link
                key={link.to}
                to={link.to}
                className="rounded-full border border-border/80 bg-background/70 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </motion.div>
        </div>
      </header>

      {/* KPI cards */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-5"
        initial="hidden"
        animate="show"
        variants={{
          hidden: {},
          show: { transition: { staggerChildren: 0.07 } },
        }}
      >
        {[
          <SparkStatCard
            key="conversations"
            icon={MessagesSquare}
            label="Conversations"
            value={stats?.totalConversations ?? "—"}
            hint={`${stats?.week.conversations ?? 0} started this week`}
            delta={weekDelta(stats?.week.conversations, stats?.previousWeek.conversations)}
            color={CHANNEL_COLORS.conversations}
            series={perDay.map((row) => row.conversations)}
          />,
          <SparkStatCard
            key="phone"
            icon={PhoneCall}
            label="Phone calls"
            value={stats?.totalPhoneCalls ?? "—"}
            hint={
              stats
                ? `${stats.week.phoneCalls} this week · ${formatCallDuration(stats.totalCallSeconds)} talk time`
                : "Inbound voice"
            }
            delta={weekDelta(stats?.week.phoneCalls, stats?.previousWeek.phoneCalls)}
            color={CHANNEL_COLORS.phoneCalls}
            series={perDay.map((row) => row.phoneCalls)}
          />,
          <SparkStatCard
            key="web"
            icon={MessageCircle}
            label="Web chat"
            value={stats?.totalWebChats ?? "—"}
            hint={
              stats
                ? `${stats.week.webChats} this week${stats.totalVoiceMessages ? ` · ${stats.totalVoiceMessages} voice msgs` : ""}`
                : "Chat messages"
            }
            delta={weekDelta(stats?.week.webChats, stats?.previousWeek.webChats)}
            color={CHANNEL_COLORS.webChats}
            series={perDay.map((row) => row.webChats)}
          />,
          <SparkStatCard
            key="appts"
            icon={CalendarCheck}
            label="Appointments today"
            value={loadingToday ? "—" : todayAppointments.length}
            hint={`${stats?.totalAppointments ?? 0} total · ${stats?.week.appointments ?? 0} booked this week`}
            delta={weekDelta(stats?.week.appointments, stats?.previousWeek.appointments)}
            color={CHANNEL_COLORS.appointments}
            series={perDay.map((row) => row.appointments)}
          />,
        ].map((card) => (
          <motion.div
            key={card.key}
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: {
                opacity: 1,
                y: 0,
                transition: { duration: 0.35, ease: pageEase },
              },
            }}
          >
            {card}
          </motion.div>
        ))}
      </motion.div>

      {/* Secondary metrics */}
      <motion.div
        className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.15, ease: pageEase }}
      >
        <InsightTile
          icon={Building2}
          label="Active clinics"
          value={stats?.totalClinics ?? clinics.length}
          hint="Locations in scope"
          accent="bg-sky-soft text-med-sky"
        />
        <InsightTile
          icon={Users}
          label="Users"
          value={stats?.totalUsers ?? "—"}
          hint="Admin & clinic staff"
          accent="bg-primary/10 text-primary"
        />
        <InsightTile
          icon={MessagesSquare}
          label="Messages"
          value={stats?.totalMessages ?? "—"}
          hint="Across all channels"
          accent="bg-cyan-soft text-med-cyan"
        />
        <InsightTile
          icon={PhoneCall}
          label="Avg call length"
          value={
            stats && stats.totalPhoneCalls > 0
              ? formatCallDuration(Math.round(stats.totalCallSeconds / stats.totalPhoneCalls))
              : "—"
          }
          hint="Talk time per call"
          accent="bg-mint-soft text-med-mint"
        />
      </motion.div>

      {/* Chart + appointments */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-6">
        <motion.section
          className="xl:col-span-7 surface-card p-5 sm:p-6 flex flex-col min-h-[440px] overflow-hidden relative"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1, ease: pageEase }}
        >
          <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-primary/[0.04] to-transparent" />
          <div className="relative flex flex-wrap items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-display font-semibold tracking-tight text-lg">
                Daily channel volume
              </h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Conversations, phone, web chat, and appointments over the selected window
              </p>
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-border/80 bg-muted/30 p-1">
              {([7, 30, 60] as ChartRange[]).map((days) => (
                <button
                  key={days}
                  type="button"
                  onClick={() => setChartRange(days)}
                  className={cn(
                    "rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                    chartRange === days
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {days}d
                </button>
              ))}
            </div>
          </div>

          <div className="relative flex flex-wrap items-center gap-x-4 gap-y-2 text-xs mb-3">
            <LegendDot color={CHANNEL_COLORS.conversations} label="Conversations" />
            <LegendDot color={CHANNEL_COLORS.phoneCalls} label="Phone" />
            <LegendDot color={CHANNEL_COLORS.webChats} label="Web chat" />
            <LegendDot color={CHANNEL_COLORS.appointments} label="Appointments" />
          </div>

          <div className="relative flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="chConversations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.conversations} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.conversations} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="chPhone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.phoneCalls} stopOpacity={0.24} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.phoneCalls} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="chWeb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.webChats} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.webChats} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="chAppts" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.appointments} stopOpacity={0.22} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.appointments} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="day"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                  minTickGap={chartRange <= 7 ? 12 : 28}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChannelTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                <Area
                  type="monotone"
                  dataKey="conversations"
                  name="Conversations"
                  stroke={CHANNEL_COLORS.conversations}
                  fill="url(#chConversations)"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="phoneCalls"
                  name="Phone calls"
                  stroke={CHANNEL_COLORS.phoneCalls}
                  fill="url(#chPhone)"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="webChats"
                  name="Web chat"
                  stroke={CHANNEL_COLORS.webChats}
                  fill="url(#chWeb)"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="appointments"
                  name="Appointments"
                  stroke={CHANNEL_COLORS.appointments}
                  fill="url(#chAppts)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.section>

        <motion.div
          className="xl:col-span-5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.16, ease: pageEase }}
        >
          <TodayAppointments appointments={todayAppointments} loading={loadingToday} />
        </motion.div>
      </div>

      <motion.div
        className="mb-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.18, ease: pageEase }}
      >
        <ClinicBreakdown clinics={clinics} clinicStats={clinicStats} />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.22, ease: pageEase }}
      >
        <DashboardInbox clinics={clinics} clinicStats={stats?.byClinic ?? []} />
      </motion.div>
    </div>
  );
}

function InsightTile({
  icon: Icon,
  label,
  value,
  hint,
  accent,
}: {
  icon: typeof Building2;
  label: string;
  value: number | string;
  hint: string;
  accent: string;
}) {
  return (
    <div className="surface-card px-4 py-3.5 flex items-center gap-3">
      <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0", accent)}>
        <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground font-semibold">
          {label}
        </div>
        <div className="font-display text-xl font-semibold tabular-nums leading-tight mt-0.5">
          {typeof value === "number" ? value.toLocaleString() : value}
        </div>
        <div className="text-[11px] text-muted-foreground truncate">{hint}</div>
      </div>
    </div>
  );
}

function PulseChip({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Activity;
  label: string;
  tone: "primary" | "sky" | "mint";
}) {
  const tones = {
    primary: "bg-primary/10 text-primary border-primary/20",
    sky: "bg-sky-soft text-med-sky border-med-sky/20",
    mint: "bg-mint-soft text-med-mint border-med-mint/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        tones[tone]
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function ClinicBreakdown({
  clinics,
  clinicStats,
}: {
  clinics: Clinic[];
  clinicStats: Map<string, DashboardClinicStat>;
}) {
  const rows = useMemo(() => {
    return clinics
      .map((clinic) => {
        const stat = clinicStats.get(clinic.id);
        return {
          clinic,
          conversations: stat?.conversations ?? 0,
          phoneCalls: stat?.phoneCalls ?? 0,
          appointments: stat?.appointments ?? 0,
        };
      })
      .sort((a, b) => b.conversations + b.phoneCalls - (a.conversations + a.phoneCalls))
      .slice(0, 6);
  }, [clinics, clinicStats]);

  const max = Math.max(1, ...rows.map((row) => row.conversations + row.phoneCalls));

  return (
    <section className="surface-card p-5 sm:p-6 overflow-hidden relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-med-sky/[0.05] to-transparent" />
      <div className="relative flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h3 className="font-display font-semibold tracking-tight text-lg">Clinic performance</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Top locations by conversation and phone volume
          </p>
        </div>
        <Link
          to="/clinics"
          className="text-xs font-medium text-primary hover:underline underline-offset-4"
        >
          Manage clinics
        </Link>
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">No clinics yet</p>
      ) : (
        <div className="relative grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {rows.map(({ clinic, conversations, phoneCalls, appointments }, index) => {
            const colors = getThemeColorOption(clinic.themeColor);
            const total = conversations + phoneCalls;
            const width = Math.max(6, Math.round((total / max) * 100));
            return (
              <motion.div
                key={clinic.id}
                className="rounded-xl border border-border/70 bg-background/60 p-4 hover:border-primary/25 transition-colors"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * index, duration: 0.35, ease: pageEase }}
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <ClinicMark clinic={clinic} />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{clinic.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {[clinic.city, clinic.state].filter(Boolean).join(", ") || "Clinic"}
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums shrink-0">{total}</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
                  <motion.div
                    className="h-full rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${width}%` }}
                    transition={{ duration: 0.75, ease: pageEase }}
                    style={{
                      background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
                    }}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MetricMini label="Chats" value={conversations} />
                  <MetricMini label="Calls" value={phoneCalls} />
                  <MetricMini label="Appts" value={appointments} />
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function MetricMini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-muted/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function ChannelTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-popover/95 backdrop-blur-sm px-3 py-2.5 text-xs shadow-lg">
      <div className="font-semibold mb-1.5">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-8 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
            {item.name}
          </span>
          <span className="tabular-nums font-semibold">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

function ClinicMark({ clinic }: { clinic: Clinic }) {
  if (clinic.avatar) {
    return (
      <img
        src={clinic.avatar}
        alt=""
        className="h-9 w-9 rounded-lg object-cover border border-border/60 shrink-0"
      />
    );
  }
  const colors = getThemeColorOption(clinic.themeColor);
  return (
    <span
      className="h-9 w-9 rounded-lg shrink-0 text-[11px] font-semibold text-white flex items-center justify-center shadow-sm"
      style={{ background: `linear-gradient(135deg, ${colors.from}, ${colors.to})` }}
    >
      {(clinic.acronym || clinic.name).slice(0, 2).toUpperCase()}
    </span>
  );
}

function greetingForHour(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

function weekDelta(current?: number, previous?: number) {
  const now = Number(current || 0);
  const then = Number(previous || 0);
  if (then <= 0 && now <= 0) return null;
  if (then <= 0) return { up: true, label: "New" };
  const pct = Math.round(((now - then) / then) * 100);
  return { up: pct >= 0, label: `${pct > 0 ? "+" : ""}${pct}%` };
}

function formatCallDuration(seconds: number) {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}
