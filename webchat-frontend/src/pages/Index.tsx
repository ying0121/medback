import HealthChatbot from "@/components/chatbot/HealthChatbot";
import HealthcareScene from "@/components/landing/HealthcareScene";
import { Activity, Bot, HeartPulse, ShieldCheck, Sparkles, Stethoscope } from "lucide-react";

const Index = () => {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-0 h-[520px] w-[520px] rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-28 left-[-8%] h-[460px] w-[460px] rounded-full bg-accent/10 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(12,16,32,0.2),rgba(2,6,23,0.75))]" />
      </div>

      <main className="relative z-10 mx-auto grid min-h-screen w-full max-w-7xl items-center gap-12 px-6 py-20 lg:grid-cols-[1.1fr_1fr] lg:px-10">
        <section className="text-left">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/35 bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <Sparkles className="h-4 w-4" />
            Clinical AI Assistant Platform
          </div>

          <h1 className="font-display text-4xl font-bold leading-tight text-foreground sm:text-5xl lg:text-6xl">
            Healthcare chatbot that feels
            <span className="block bg-gradient-to-r from-sky-400 via-cyan-300 to-emerald-300 bg-clip-text text-transparent">
              intelligent, trusted, and alive.
            </span>
          </h1>

          <p className="mt-6 max-w-xl text-base text-muted-foreground sm:text-lg">
            Deliver instant triage guidance, medication reminders, and symptom support with a secure, embeddable
            assistant made for modern care experiences.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-full border border-border bg-muted/70 px-3 py-1 text-muted-foreground">Text Mode</span>
            <span className="rounded-full border border-border bg-muted/70 px-3 py-1 text-muted-foreground">Voice Mode</span>
            <span className="rounded-full border border-border bg-muted/70 px-3 py-1 text-muted-foreground">Embeddable</span>
            <span className="rounded-full border border-border bg-muted/70 px-3 py-1 text-muted-foreground">HIPAA-ready Flow</span>
          </div>

          <div className="mt-10 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-sm font-semibold text-foreground">Secure by design</span>
              </div>
              <p className="text-sm text-muted-foreground">Clinical-safe responses, role-based handoff, and full conversation traceability.</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <Stethoscope className="h-4 w-4" />
                <span className="text-sm font-semibold text-foreground">Care-context aware</span>
              </div>
              <p className="text-sm text-muted-foreground">Tailors guidance by symptoms, urgency, and care pathway with smooth nurse handoff.</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <HeartPulse className="h-4 w-4" />
                <span className="text-sm font-semibold text-foreground">Live health signals</span>
              </div>
              <p className="text-sm text-muted-foreground">Built for proactive engagement around vitals, adherence, and appointment readiness.</p>
            </div>

            <div className="rounded-2xl border border-border/70 bg-card/80 p-4 backdrop-blur">
              <div className="mb-2 flex items-center gap-2 text-primary">
                <Bot className="h-4 w-4" />
                <span className="text-sm font-semibold text-foreground">Fast integration</span>
              </div>
              <p className="text-sm text-muted-foreground">Drop-in widget, custom branding, and configurable prompts for every specialty.</p>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <HealthcareScene />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/60 bg-card/70 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Avg response</p>
              <p className="mt-1 flex items-center gap-2 text-lg font-semibold text-foreground">
                <Activity className="h-4 w-4 text-primary" />
                1.4s
              </p>
            </div>
            <div className="rounded-xl border border-border/60 bg-card/70 p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Clinical topics</p>
              <p className="mt-1 text-lg font-semibold text-foreground">+120</p>
            </div>
          </div>
        </section>
      </main>

      <div className="pointer-events-none absolute bottom-8 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border/70 bg-card/70 px-4 py-2 text-xs text-muted-foreground backdrop-blur">
        Click the chatbot bubble at bottom-right to start a healthcare conversation
      </div>

      <div className="absolute left-6 top-6 z-10 hidden items-center gap-2 rounded-full border border-border/70 bg-card/65 px-3 py-1 text-xs text-muted-foreground backdrop-blur sm:flex">
        <HeartPulse className="h-3.5 w-3.5 text-primary" />
        Built for digital health teams
      </div>

      <div className="absolute right-6 top-6 z-10 hidden items-center gap-2 rounded-full border border-border/70 bg-card/65 px-3 py-1 text-xs text-muted-foreground backdrop-blur sm:flex">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" />
        Enterprise security controls
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-[42%] z-0 hidden h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent lg:block" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-36 bg-gradient-to-t from-background to-transparent" />

      <HealthChatbot />
    </div>
  );
};

export default Index;
