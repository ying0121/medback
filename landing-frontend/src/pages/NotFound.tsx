import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Home } from "lucide-react";
import botLogo from "@/assets/bot-logo.png";

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen items-center justify-center px-6 py-20">
      <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden>
        <div className="absolute -left-20 top-20 h-72 w-72 rounded-full bg-navy/[0.06] blur-3xl" />
        <div className="absolute -right-16 bottom-16 h-80 w-80 rounded-full bg-sage/[0.08] blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="w-full max-w-lg rounded-2xl border border-line bg-surface/95 px-8 py-12 text-center shadow-soft"
      >
        <img src={botLogo} alt="" className="mx-auto h-12 w-12 rounded-xl object-cover" />
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.22em] text-sage">Error 404</p>
        <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink">Page not found</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink/65">
          The page you opened does not exist or may have moved.
        </p>
        <Link
          to="/"
          className="mt-8 inline-flex items-center gap-2 rounded-xl bg-navy px-6 py-3 text-sm font-semibold text-white transition hover:bg-ink"
        >
          <Home className="h-4 w-4" />
          Back to home
        </Link>
      </motion.div>
    </div>
  );
}
