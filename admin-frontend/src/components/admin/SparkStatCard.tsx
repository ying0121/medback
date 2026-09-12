import type { ComponentType } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export default function SparkStatCard({
  icon: Icon,
  label,
  value,
  hint,
  delta,
  color,
  series,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  hint: string;
  delta: { up: boolean; label: string } | null;
  color: string;
  series: number[];
}) {
  const gradientId = `spark-${label.replace(/\s+/g, "-").toLowerCase()}`;
  const points = series.map((v, i) => ({ i, v }));

  return (
    <motion.div
      className="group relative bg-card border border-border/80 rounded-2xl p-5 shadow-soft overflow-hidden transition-[box-shadow,border-color] duration-300 hover:shadow-lift hover:border-primary/25"
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
    >
      <div
        className="absolute inset-x-0 top-0 h-[3px] opacity-90"
        style={{ background: `linear-gradient(90deg, ${color}, transparent 92%)` }}
      />
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-[0.12] blur-2xl transition-opacity duration-300 group-hover:opacity-[0.2]"
        style={{ background: color }}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </div>
          <div className="font-display text-[1.85rem] font-semibold tracking-tight mt-1.5 tabular-nums leading-none">
            {value}
          </div>
        </div>
        <motion.div
          className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ring-1 ring-black/[0.04]"
          style={{ background: `${color}18`, color }}
          whileHover={{ rotate: -8, scale: 1.06 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
        >
          <Icon className="h-5 w-5" />
        </motion.div>
      </div>

      <div className="relative h-14 mt-4 -mx-1">
        {points.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.38} />
                  <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <Area
                type="monotone"
                dataKey="v"
                stroke={color}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                isAnimationActive
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : null}
      </div>

      <div className="relative flex items-center justify-between gap-2 mt-2">
        <p className="text-xs text-muted-foreground truncate">{hint}</p>
        {delta ? (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[11px] font-medium shrink-0 rounded-full px-2 py-0.5",
              delta.up
                ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/60"
                : "bg-rose-50 text-rose-700 ring-1 ring-rose-200/60"
            )}
          >
            {delta.up ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta.label}
          </span>
        ) : null}
      </div>
    </motion.div>
  );
}
