import type { ComponentType } from "react";
import { motion } from "framer-motion";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
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
      className="bg-card border border-border/80 rounded-2xl p-5 shadow-soft overflow-hidden transition-shadow duration-300 hover:shadow-lift"
      whileHover={{ y: -3 }}
      transition={{ type: "spring", stiffness: 380, damping: 28 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-3xl font-semibold tracking-tight mt-1 tabular-nums">{value}</div>
        </div>
        <motion.div
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${color}18`, color }}
          whileHover={{ rotate: -8, scale: 1.06 }}
          transition={{ type: "spring", stiffness: 400, damping: 18 }}
        >
          <Icon className="h-5 w-5" />
        </motion.div>
      </div>
      <div className="h-14 mt-3 -mx-1">
        {points.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity={0.35} />
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
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : null}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <p className="text-xs text-muted-foreground truncate">{hint}</p>
        {delta && (
          <span
            className={cn(
              "text-[11px] font-medium shrink-0 rounded-full px-2 py-0.5",
              delta.up ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
            )}
          >
            {delta.label}
          </span>
        )}
      </div>
    </motion.div>
  );
}
