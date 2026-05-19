import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Compass, Home } from "lucide-react";
import AnimatedBackground from "@/components/AnimatedBackground";

export default function NotFound() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <AnimatedBackground />
      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center px-6 py-20 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="glass w-full rounded-3xl p-10 shadow-2xl shadow-indigo/10 md:p-14"
        >
          <motion.div
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo to-teal text-white shadow-lg"
          >
            <Compass className="h-8 w-8" />
          </motion.div>
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-teal">Error 404</p>
          <h1 className="mt-3 font-display text-4xl font-bold text-ink">Page not found</h1>
          <p className="mt-4 text-ink/60">
            The URL you opened does not exist. It may have moved, or the link could be incomplete.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-sm font-semibold text-white transition hover:bg-indigo"
            >
              <Home className="h-4 w-4" />
              Back to home
            </Link>
            <a
              href="/admin/login"
              className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:border-teal/40"
            >
              <ArrowLeft className="h-4 w-4" />
              Admin login
            </a>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
