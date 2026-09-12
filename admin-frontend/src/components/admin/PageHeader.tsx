import { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

const ACCENTS = [
  "from-primary/20 via-med-cyan/10 to-transparent",
  "from-med-sky/20 via-primary/10 to-transparent",
  "from-med-mint/20 via-med-sky/10 to-transparent",
  "from-med-coral/15 via-med-amber/10 to-transparent",
  "from-med-rose/15 via-med-coral/10 to-transparent",
] as const;

export default function PageHeader({
  title,
  description,
  actions,
  accent = 0,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Cycles medical accent washes for visual variety across pages */
  accent?: number;
}) {
  const wash = ACCENTS[Math.abs(accent) % ACCENTS.length];

  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm shadow-soft">
      <div className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br", wash)} />
      <div className="pointer-events-none absolute -right-8 -top-10 h-36 w-36 rounded-full bg-primary/10 blur-2xl" />
      <div className="pointer-events-none absolute -left-6 bottom-0 h-24 w-24 rounded-full bg-med-sky/10 blur-2xl" />

      <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between p-5 sm:p-6">
        <div className="min-w-0">
          <motion.div
            className="mb-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Medical Bot Console
          </motion.div>
          <motion.h1
            className="font-display text-3xl font-semibold tracking-tight text-foreground"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            {title}
          </motion.h1>
          {description ? (
            <motion.p
              className="text-muted-foreground mt-1.5 max-w-2xl text-[15px] leading-relaxed"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            >
              {description}
            </motion.p>
          ) : null}
        </div>
        {actions ? (
          <motion.div
            className="flex flex-wrap items-center gap-2 shrink-0"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          >
            {actions}
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
