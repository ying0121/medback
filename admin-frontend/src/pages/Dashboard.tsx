import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  CalendarCheck,
  MessageCircle,
  MessagesSquare,
  PhoneCall,
} from "lucide-react";
import DashboardInbox from "@/components/admin/DashboardInbox";
import TodayAppointments, { todayRangeIso } from "@/components/admin/TodayAppointments";
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
import SparkStatCard from "@/components/admin/SparkStatCard";
import { formatNyDate, getZonedParts } from "@/lib/appTimeZone";
import { motion } from "framer-motion";

const CHANNEL_COLORS = {
  conversations: "hsl(235 65% 32%)",
  phoneCalls: "hsl(222 35% 38%)",
  webChats: "#0DA2E7",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [loadingToday, setLoadingToday] = useState(true);

  useEffect(() => {
    let mounted = true;
    const allowed = user?.role === "Admin" ? undefined : user?.clinicIds;
    listClinics().then((all) => {
      if (!mounted) return;
      setClinics(allowed ? all.filter((clinic) => allowed.includes(clinic.id)) : all);
    });
    getStats(allowed).then((data) => {
      if (mounted) setStats(data);
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
  }, [user]);

  const firstName = user?.name?.split(" ")[0] || "there";
  const perDay = stats?.perDay ?? [];
  const clinicStats = useMemo(() => {
    const map = new Map((stats?.byClinic ?? []).map((row) => [row.clinicId, row]));
    return map;
  }, [stats]);

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto">
      <header className="mb-8">
        <motion.p
          className="text-sm font-medium text-primary/80 mb-1"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          {greetingForHour(getZonedParts(new Date()).hour)}, {firstName}
        </motion.p>
        <motion.h1
          className="text-3xl font-semibold tracking-tight"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.04 }}
        >
          Dashboard
        </motion.h1>
        <motion.p
          className="text-muted-foreground mt-1.5"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.08 }}
        >
          {formatNyDate(new Date())} ET · Daily volume by channel, then clinic conversation history
        </motion.p>
      </header>

      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6"
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
                ? `${stats.week.phoneCalls} this week · ${formatCallDuration(stats.totalCallSeconds)} total`
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
                ? `${stats.week.webChats} messages this week${stats.totalVoiceMessages ? ` · ${stats.totalVoiceMessages} voice` : ""}`
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
            color="hsl(235 70% 42%)"
            series={perDay.map((row) => row.appointments)}
          />,
        ].map((card) => (
          <motion.div
            key={card.key}
            variants={{
              hidden: { opacity: 0, y: 12 },
              show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
            }}
          >
            {card}
          </motion.div>
        ))}
      </motion.div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 mb-6">
        <div className="xl:col-span-7 bg-card border border-border/80 rounded-2xl p-6 shadow-soft flex flex-col min-h-[420px]">
          <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
            <div>
              <h3 className="font-semibold tracking-tight">Daily channel volume</h3>
              <p className="text-sm text-muted-foreground mt-0.5">
                Conversations, inbound phone calls, and web chat messages created each day (last 60 days)
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <LegendDot color={CHANNEL_COLORS.conversations} label="Conversations" />
              <LegendDot color={CHANNEL_COLORS.phoneCalls} label="Phone calls" />
              <LegendDot color={CHANNEL_COLORS.webChats} label="Web chat" />
            </div>
          </div>
          <div className="flex-1 min-h-[288px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={perDay} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="chConversations" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.conversations} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.conversations} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="chPhone" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.phoneCalls} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.phoneCalls} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="chWeb" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={CHANNEL_COLORS.webChats} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={CHANNEL_COLORS.webChats} stopOpacity={0.02} />
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
                  minTickGap={28}
                />
                <YAxis
                  allowDecimals={false}
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<ChannelTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />
                <Area type="monotone" dataKey="conversations" name="Conversations" stroke={CHANNEL_COLORS.conversations} fill="url(#chConversations)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="phoneCalls" name="Phone calls" stroke={CHANNEL_COLORS.phoneCalls} fill="url(#chPhone)" strokeWidth={2} dot={false} />
                <Area type="monotone" dataKey="webChats" name="Web chat" stroke={CHANNEL_COLORS.webChats} fill="url(#chWeb)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="xl:col-span-5">
          <TodayAppointments appointments={todayAppointments} loading={loadingToday} />
        </div>
      </div>

      <div className="mb-6">
        <ClinicBreakdown clinics={clinics} clinicStats={clinicStats} />
      </div>

      <DashboardInbox clinics={clinics} clinicStats={stats?.byClinic ?? []} />
    </div>
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
      .slice(0, 5);
  }, [clinics, clinicStats]);

  const max = Math.max(1, ...rows.map((row) => row.conversations + row.phoneCalls));

  return (
    <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-soft">
      <h3 className="font-semibold tracking-tight">By clinic</h3>
      <p className="text-sm text-muted-foreground mt-0.5 mb-4">
        Top 5 locations by conversations and phone volume
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-x-6 gap-y-4">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground py-8 text-center">No clinics yet</p>
        )}
        {rows.map(({ clinic, conversations, phoneCalls, appointments }) => {
          const colors = getThemeColorOption(clinic.themeColor);
          const total = conversations + phoneCalls;
          const width = Math.max(8, Math.round((total / max) * 100));
          return (
            <div key={clinic.id}>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <ClinicMark clinic={clinic} />
                  <span className="text-sm font-medium truncate">{clinic.name}</span>
                </div>
                <span className="text-xs tabular-nums text-muted-foreground shrink-0">{total}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted overflow-hidden mb-1.5">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${width}%` }}
                  transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                  style={{
                    background: `linear-gradient(90deg, ${colors.from}, ${colors.to})`,
                  }}
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>{conversations} chats</span>
                <span>{phoneCalls} calls</span>
                <span>{appointments} appts</span>
              </div>
            </div>
          );
        })}
      </div>
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
    <div className="rounded-xl border border-border bg-popover px-3 py-2.5 text-xs shadow-md">
      <div className="font-medium mb-1.5">{label}</div>
      {payload.map((item) => (
        <div key={item.name} className="flex items-center justify-between gap-6 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-sm" style={{ background: item.color }} />
            {item.name}
          </span>
          <span className="tabular-nums font-medium">{item.value}</span>
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
        className="h-6 w-6 rounded-md object-cover border border-border/60 shrink-0"
      />
    );
  }
  const colors = getThemeColorOption(clinic.themeColor);
  return (
    <span
      className="h-6 w-6 rounded-md shrink-0 text-[10px] font-semibold text-white flex items-center justify-center"
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
  if (then <= 0) return { up: true, label: "New this week" };
  const pct = Math.round(((now - then) / then) * 100);
  return { up: pct >= 0, label: `${pct > 0 ? "+" : ""}${pct}% vs prior week` };
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
