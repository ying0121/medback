import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight,
  Bot,
  Headphones,
  MessageSquare,
  Phone,
  Shield,
  Sparkles,
  Zap
} from "lucide-react";
import AnimatedBackground from "@/components/AnimatedBackground";
import VoiceWaveDemo from "@/components/VoiceWaveDemo";

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.65, ease: [0.22, 1, 0.36, 1] }
  })
};

const features = [
  {
    icon: Phone,
    title: "Inbound voice AI",
    desc: "Answer clinic lines with streaming speech — Deepgram, OpenAI, and ElevenLabs in one low-latency pipeline."
  },
  {
    icon: MessageSquare,
    title: "Web chat & voice",
    desc: "Patients chat in the browser with text or voice turns, knowledge-aware replies, and live Socket.IO updates."
  },
  {
    icon: Bot,
    title: "Clinic knowledge base",
    desc: "Train per-clinic content so every assistant stays on-brand, accurate, and scoped to your organization."
  },
  {
    icon: Shield,
    title: "Admin control",
    desc: "Manage clinics, staff, call history, and integrations from a unified dashboard."
  }
];

function RevealSection({
  children,
  className = "",
  id
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      id={id}
      ref={ref}
      initial={{ opacity: 0, y: 40 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

export default function Landing() {
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 400], [0, 80]);
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0.3]);
  const [typed, setTyped] = useState("");

  const phrase = "that never misses a patient.";
  useEffect(() => {
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setTyped(phrase.slice(0, i));
      if (i >= phrase.length) window.clearInterval(id);
    }, 42);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <AnimatedBackground />

      <header className="sticky top-0 z-50 border-b border-white/50 bg-white/60 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-2 font-display text-lg font-bold tracking-tight text-ink">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo to-teal text-white shadow-lg shadow-teal/25">
              <Sparkles className="h-4 w-4" />
            </span>
            Healthcare Chat Bot 
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-ink/70 md:flex">
            <a href="#features" className="transition-colors hover:text-ink">Features</a>
            <a href="#how" className="transition-colors hover:text-ink">How it works</a>
          </nav>
          <Link
            to="/admin/login"
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo/20 transition hover:bg-indigo hover:shadow-teal/30"
          >
            Admin login
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <motion.main style={{ y: heroY, opacity: heroOpacity }} className="mx-auto max-w-6xl px-6 pb-24 pt-16 md:pt-24">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <div>
            <motion.div
              custom={0}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="mb-6 inline-flex items-center gap-2 rounded-full border border-teal/30 bg-teal/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-teal"
            >
              <Zap className="h-3.5 w-3.5" />
              Clinic AI platform
            </motion.div>

            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="font-display text-4xl font-bold leading-[1.08] tracking-tight text-ink md:text-5xl lg:text-6xl"
            >
              Intelligent front desk{" "}
              <span className="text-gradient">{typed}</span>
              <span className="inline-block w-[2px] animate-pulse bg-teal align-middle" style={{ height: "0.9em" }} />
            </motion.h1>

            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="mt-6 max-w-lg text-lg leading-relaxed text-ink/65"
            >
              Healthcare Chat Bot  powers real-time chat, inbound phone assistants, and staff tools — built for multi-clinic healthcare teams.
            </motion.p>

            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="mt-10 flex flex-wrap gap-4"
            >
              <a
                href="#features"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo to-teal px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-teal/25 transition hover:scale-[1.02] hover:shadow-2xl"
              >
                Explore features
                <ArrowRight className="h-4 w-4" />
              </a>
              <Link
                to="/admin/login"
                className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-7 py-3.5 text-sm font-semibold text-ink transition hover:border-teal/40 hover:bg-teal/5"
              >
                Open admin console
              </Link>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.92, rotateY: -8 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-teal/30 to-indigo/20 blur-2xl" />
            <div className="glass relative overflow-hidden rounded-[2rem] p-6 shadow-2xl shadow-indigo/10">
              <div className="absolute -right-8 -top-8 h-32 w-32 animate-pulse-ring rounded-full border-2 border-teal/40" />
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Headphones className="h-4 w-4 text-teal" />
                  Live call preview
                </div>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                  Active
                </span>
              </div>
              <VoiceWaveDemo />
              <div className="mt-5 space-y-3">
                {[
                  { role: "Patient", text: "Hi, I'd like to schedule a follow-up visit." },
                  { role: "Healthcare Chat Bot ", text: "Of course — I can help with that. Which clinic location works best for you?" }
                ].map((line, i) => (
                  <motion.div
                    key={line.role}
                    initial={{ opacity: 0, x: i === 0 ? -16 : 16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 + i * 0.35 }}
                    className={`rounded-2xl px-4 py-3 text-sm ${
                      i === 0 ? "mr-8 bg-slate-100 text-ink/80" : "ml-8 bg-gradient-to-r from-indigo/10 to-teal/10 text-ink"
                    }`}
                  >
                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-ink/45">{line.role}</div>
                    {line.text}
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </motion.main>

      <RevealSection id="features" className="mx-auto max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <h2 className="font-display text-3xl font-bold text-ink md:text-4xl">Everything your clinic needs</h2>
          <p className="mx-auto mt-3 max-w-xl text-ink/60">One backend. Chat, voice, alerts, and administration — orchestrated for healthcare workflows.</p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2">
          {features.map((f, i) => (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.5 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="glass group rounded-2xl p-6 shadow-lg shadow-indigo/5 transition-shadow hover:shadow-xl"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo/15 to-teal/15 text-indigo transition group-hover:scale-110">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="font-display text-lg font-semibold text-ink">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/60">{f.desc}</p>
            </motion.article>
          ))}
        </div>
      </RevealSection>

      <RevealSection id="how" className="mx-auto max-w-6xl px-6 py-20">
        <div className="glass overflow-hidden rounded-3xl p-8 md:p-12">
          <div className="grid gap-10 md:grid-cols-3">
            {[
              { step: "01", title: "Connect", desc: "Link Twilio numbers, ElevenLabs voices, and clinic knowledge per location." },
              { step: "02", title: "Assist", desc: "Patients call or chat — AI handles intake with real-time speech and context." },
              { step: "03", title: "Review", desc: "Staff monitor transcripts, audio waveforms, and analytics in the admin console." }
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                <div className="font-display text-4xl font-bold text-teal/30">{item.step}</div>
                <h3 className="mt-2 font-display text-xl font-semibold text-ink">{item.title}</h3>
                <p className="mt-2 text-sm text-ink/60">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </RevealSection>

      <RevealSection className="mx-auto max-w-6xl px-6 pb-24">
        <motion.div
          whileInView={{ scale: [0.98, 1] }}
          viewport={{ once: true }}
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo via-indigo to-teal px-8 py-14 text-center text-white shadow-2xl shadow-indigo/30 md:px-16"
        >
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.15),transparent_50%)]" />
          <h2 className="relative font-display text-3xl font-bold md:text-4xl">Ready to modernize your clinic line?</h2>
          <p className="relative mx-auto mt-4 max-w-lg text-white/80">
            Sign in to configure clinics, train assistants, and review every conversation.
          </p>
          <Link
            to="/admin/login"
            className="relative mt-8 inline-flex items-center gap-2 rounded-full bg-white px-8 py-3.5 text-sm font-bold text-indigo shadow-xl transition hover:scale-[1.03]"
          >
            Go to admin console
            <ArrowRight className="h-4 w-4" />
          </Link>
        </motion.div>
      </RevealSection>

      <footer className="border-t border-ink/10 py-8 text-center text-sm text-ink/50">
        © {new Date().getFullYear()} Healthcare Chat Bot  · Clinic AI Platform
      </footer>
    </div>
  );
}
