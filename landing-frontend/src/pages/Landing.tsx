import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence, useInView, useScroll, useTransform } from "framer-motion";
import { ArrowDown, ArrowUp, CalendarDays, MessageSquareText, PhoneCall, ShieldCheck } from "lucide-react";
import ImageCarousel, { type CarouselSlide } from "@/components/ImageCarousel";
import botLogo from "@/assets/bot-logo.png";
import heroImage from "@/assets/landing/hero-clinic-ai.png";
import imgWebChat from "@/assets/landing/carousel-web-chat.png";
import imgVoice from "@/assets/landing/carousel-voice-ai.png";
import imgAppointments from "@/assets/landing/carousel-appointments.png";
import imgKnowledge from "@/assets/landing/carousel-knowledge.png";
import imgMultiClinic from "@/assets/landing/carousel-multi-clinic.png";
import imgIntake from "@/assets/landing/carousel-intake.png";
import imgFollowup from "@/assets/landing/carousel-followup.png";
import imgTrust from "@/assets/landing/carousel-trust.png";
import imgWorkflow from "@/assets/landing/carousel-workflow.png";

function Reveal({
  children,
  className = "",
  id
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-72px" });
  return (
    <motion.section
      id={id}
      ref={ref}
      initial={{ opacity: 0, y: 36 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

function SectionHeading({
  eyebrow,
  title,
  copy
}: {
  eyebrow: string;
  title: string;
  copy: string;
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sage">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">{title}</h2>
      <p className="mt-4 text-base leading-relaxed text-ink/65 md:text-lg">{copy}</p>
    </div>
  );
}

const introSlides: CarouselSlide[] = [
  {
    src: imgWebChat,
    alt: "Web chat assistant on phone and laptop",
    title: "A clinic-ready conversation partner",
    caption:
      "Patients ask about hours, services, directions, and preparation — and get clear answers grounded in your clinic knowledge."
  },
  {
    src: imgVoice,
    alt: "Voice AI phone assistant for clinics",
    title: "Natural voice on the clinic line",
    caption:
      "Inbound callers speak with an AI front desk that listens, responds in real time, and keeps the conversation moving."
  },
  {
    src: imgKnowledge,
    alt: "Clinic knowledge training for the assistant",
    title: "Trained on your clinic content",
    caption:
      "Upload policies, FAQs, and service details so every reply stays accurate, local, and consistent across locations."
  }
];

const workflowSlides: CarouselSlide[] = [
  {
    src: imgWorkflow,
    alt: "End-to-end chatbot workflow stages",
    title: "Greet → Understand → Resolve",
    caption:
      "From the first hello to a confirmed next step, the assistant follows a structured clinic workflow instead of free-form guessing."
  },
  {
    src: imgIntake,
    alt: "Digital patient intake on a tablet",
    title: "Collect only what booking needs",
    caption:
      "Name, contact details, preferred time, and visit reason are gathered conversationally — then confirmed before anything is booked."
  },
  {
    src: imgFollowup,
    alt: "Staff reviewing AI-assisted conversation summary",
    title: "Leave a clear trail for staff",
    caption:
      "Transcripts and appointment context stay available so your team can review what happened after the call or chat ends."
  }
];

const channelSlides: CarouselSlide[] = [
  {
    src: imgWebChat,
    alt: "Patient chatting with healthcare assistant",
    title: "Browser chat that feels human",
    caption:
      "Text turns with live updates help patients get answers without waiting on hold — ideal for after-hours and mobile visitors."
  },
  {
    src: imgVoice,
    alt: "Clinic inbound voice AI visualization",
    title: "Inbound phone assistance",
    caption:
      "Streaming speech handles greetings, FAQs, and booking intent with low-latency voice so callers are never left in silence."
  },
  {
    src: imgTrust,
    alt: "Secure healthcare AI trust shield visual",
    title: "Scoped to each clinic",
    caption:
      "Each assistant stays tied to clinic identity, knowledge, and routing — so answers never drift into another location’s content."
  }
];

const appointmentSlides: CarouselSlide[] = [
  {
    src: imgAppointments,
    alt: "Appointment booking calendar interface",
    title: "Book visits through conversation",
    caption:
      "When a patient wants to schedule, the bot collects required fields, confirms Eastern Time preferences, and completes the request."
  },
  {
    src: imgIntake,
    alt: "Patient intake details being collected",
    title: "Smart intake, fewer back-and-forths",
    caption:
      "Missing details are asked only when needed. Information already provided is remembered for the rest of the booking flow."
  },
  {
    src: imgFollowup,
    alt: "Confirmed appointment follow-up on desktop",
    title: "Confirmations patients can trust",
    caption:
      "After booking, patients can receive meeting details and schedule confirmation so the visit is clear before they arrive."
  }
];

const clinicSlides: CarouselSlide[] = [
  {
    src: imgMultiClinic,
    alt: "Multi-clinic network connected to AI assistant",
    title: "Built for multi-location groups",
    caption:
      "Operate one platform across clinics while keeping each location’s voice, content, and appointments correctly scoped."
  },
  {
    src: imgKnowledge,
    alt: "Knowledge documents feeding clinic AI",
    title: "Knowledge that stays current",
    caption:
      "Refresh training materials as services change — the assistant adapts so front-desk answers stay aligned with reality."
  },
  {
    src: imgTrust,
    alt: "Secure clinic AI trust visual",
    title: "Designed for clinical operations",
    caption:
      "From call handling to appointment coordination, the experience is tuned for healthcare front desks — not generic chatbots."
  }
];

export default function Landing() {
  const { scrollY } = useScroll();
  const heroImageY = useTransform(scrollY, [0, 480], [0, 48]);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 24);
      setShowTop(y > 420);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div className="absolute -left-24 top-16 h-[28rem] w-[28rem] animate-float rounded-full bg-navy/[0.06] blur-3xl" />
        <div className="absolute -right-20 top-40 h-[26rem] w-[26rem] animate-float-delayed rounded-full bg-sage/[0.08] blur-3xl" />
      </div>

      <header
        className={`sticky top-0 z-50 border-b transition-colors ${
          scrolled ? "border-line/80 bg-soft/95 backdrop-blur-xl" : "border-line/40 bg-soft/80 backdrop-blur-md"
        }`}
      >
        <div className="section-shell flex h-[4.25rem] items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={botLogo} alt="" className="h-10 w-10 rounded-xl object-cover" />
            <span className="font-display text-lg font-bold tracking-tight text-ink">Healthcare Chat Bot</span>
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-medium text-ink/70 md:flex">
            <a href="#introduction" className="transition-colors hover:text-ink">
              Introduction
            </a>
            <a href="#workflow" className="transition-colors hover:text-ink">
              Workflow
            </a>
            <a href="#channels" className="transition-colors hover:text-ink">
              Channels
            </a>
            <a href="#appointments" className="transition-colors hover:text-ink">
              Appointments
            </a>
            <a href="#clinics" className="transition-colors hover:text-ink">
              Clinics
            </a>
          </nav>
          <a
            href="#introduction"
            className="inline-flex items-center gap-2 rounded-xl bg-navy px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink"
          >
            Learn more
            <ArrowDown className="h-3.5 w-3.5" />
          </a>
        </div>
      </header>

      {/* 1. Hero — split composition: copy left, product visual right */}
      <section className="relative grid min-h-[calc(100vh-4.25rem)] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <div className="relative flex flex-col justify-center overflow-hidden bg-[#0f1b2d] px-6 py-16 sm:px-10 lg:px-14 xl:px-20">
          <div
            className="pointer-events-none absolute inset-0 opacity-80"
            aria-hidden
            style={{
              background:
                "radial-gradient(ellipse 80% 60% at 0% 0%, rgba(61,107,122,0.28), transparent 55%), radial-gradient(ellipse 70% 50% at 100% 100%, rgba(27,58,92,0.45), transparent 50%)"
            }}
          />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            aria-hidden
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.7) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.7) 1px, transparent 1px)",
              backgroundSize: "48px 48px"
            }}
          />

          <div className="relative max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-4"
            >
              <img
                src={botLogo}
                alt=""
                className="h-16 w-16 rounded-2xl object-cover shadow-[0_12px_40px_-16px_rgba(0,0,0,0.55)] sm:h-[4.5rem] sm:w-[4.5rem]"
              />
              <div>
                <p className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                  Healthcare Chat Bot
                </p>
                <p className="mt-1 text-sm font-medium tracking-wide text-white/55">Clinic AI assistant</p>
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 font-display text-[2rem] font-bold leading-[1.12] tracking-tight text-white sm:text-4xl lg:text-[2.65rem] xl:text-[2.85rem]"
            >
              The front desk that answers every patient — day or night.
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mt-5 max-w-md text-base leading-relaxed text-white/70 sm:text-lg"
            >
              An AI assistant for clinics that chats, takes calls, books appointments, and answers from your own
              knowledge.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.65, delay: 0.26, ease: [0.22, 1, 0.36, 1] }}
              className="mt-10 flex flex-wrap gap-3"
            >
              <a
                href="#workflow"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:bg-mist"
              >
                See the workflow
              </a>
              <a
                href="#channels"
                className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Explore capabilities
              </a>
            </motion.div>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          className="relative min-h-[42vh] overflow-hidden bg-mist lg:min-h-full"
        >
          <motion.img
            style={{ y: heroImageY }}
            src={heroImage}
            alt="Healthcare Chat Bot scheduling an appointment in chat"
            className="absolute inset-0 h-[112%] w-full object-cover object-center"
            fetchPriority="high"
          />
          <div
            className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-[#0f1b2d]/45 to-transparent lg:w-24"
            aria-hidden
          />
        </motion.div>
      </section>

      {/* 2. Introduction */}
      <Reveal id="introduction" className="section-shell py-20 md:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <SectionHeading
              eyebrow="Introduction"
              title="Meet the clinic assistant built for real patient conversations."
              copy="Healthcare Chat Bot is not a generic chatbot template. It is a clinic-scoped assistant that understands your services, speaks with patients in chat or voice, and guides them from a question to a booked visit."
            />
            <ul className="mt-8 space-y-4 text-sm leading-relaxed text-ink/70 md:text-base">
              <li className="flex gap-3">
                <MessageSquareText className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
                <span>Answers common questions using clinic-specific knowledge instead of generic web content.</span>
              </li>
              <li className="flex gap-3">
                <PhoneCall className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
                <span>Supports inbound voice so after-hours callers still reach a capable front desk experience.</span>
              </li>
              <li className="flex gap-3">
                <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
                <span>Turns scheduling intent into structured appointment intake with confirmation steps.</span>
              </li>
            </ul>
          </div>
          <ImageCarousel slides={introSlides} />
        </div>
      </Reveal>

      {/* 3. Workflow */}
      <Reveal id="workflow" className="border-y border-line/70 bg-white/55 py-20 md:py-28">
        <div className="section-shell grid items-center gap-12 lg:grid-cols-[0.95fr_1.05fr]">
          <ImageCarousel slides={workflowSlides} autoPlayMs={5600} />
          <div>
            <SectionHeading
              eyebrow="Workflow"
              title="How a patient conversation becomes completed work."
              copy="Every interaction follows a practical clinic path: greet the patient, understand the need, use clinic knowledge, collect booking details when needed, and leave staff with a clear record."
            />
            <ol className="mt-8 space-y-5">
              {[
                {
                  step: "01",
                  title: "Welcome & intent",
                  text: "The assistant greets the patient and detects whether they need information, scheduling, or follow-up help."
                },
                {
                  step: "02",
                  title: "Knowledge-aware answers",
                  text: "Responses stay grounded in the clinic’s trained content — services, policies, hours, and location details."
                },
                {
                  step: "03",
                  title: "Structured booking",
                  text: "If an appointment is needed, required fields are collected conversationally and confirmed before booking."
                },
                {
                  step: "04",
                  title: "Handoff & continuity",
                  text: "Transcripts and appointment context remain available so your team can continue care without starting over."
                }
              ].map((item) => (
                <li key={item.step} className="grid grid-cols-[auto_1fr] gap-4">
                  <span className="font-display text-sm font-bold text-sage">{item.step}</span>
                  <div>
                    <p className="font-display text-base font-semibold text-ink">{item.title}</p>
                    <p className="mt-1 text-sm leading-relaxed text-ink/65">{item.text}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </Reveal>

      {/* 4. Channels */}
      <Reveal id="channels" className="section-shell py-20 md:py-28">
        <div className="mb-12 max-w-3xl">
          <SectionHeading
            eyebrow="Channels"
            title="One assistant across chat and voice."
            copy="Patients reach you the way they prefer. Healthcare Chat Bot keeps the same clinic knowledge and booking logic whether the conversation starts in the browser or on the phone."
          />
        </div>
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <ImageCarousel slides={channelSlides} />
          <div className="space-y-8 self-center">
            <div>
              <h3 className="font-display text-xl font-semibold text-ink">Web chat</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/65 md:text-base">
                Embeddable conversations for website visitors who want quick answers, prep guidance, or help choosing a visit time without calling.
              </p>
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold text-ink">Inbound voice</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/65 md:text-base">
                A speaking front desk for clinic phone lines — listening, responding, and guiding callers through FAQs or appointment requests in real time.
              </p>
            </div>
            <div>
              <h3 className="font-display text-xl font-semibold text-ink">Shared clinic brain</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink/65 md:text-base">
                Both channels pull from the same knowledge and intake rules, so patients get consistent answers no matter how they contact you.
              </p>
            </div>
          </div>
        </div>
      </Reveal>

      {/* 5. Appointments */}
      <Reveal id="appointments" className="border-y border-line/70 bg-navy text-white py-20 md:py-28">
        <div className="section-shell grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/55">Appointments</p>
            <h2 className="mt-3 font-display text-3xl font-bold tracking-tight md:text-4xl">
              From “I’d like to book” to a confirmed visit.
            </h2>
            <p className="mt-4 text-base leading-relaxed text-white/70 md:text-lg">
              Scheduling is where most clinic chatbots fall short. Healthcare Chat Bot treats appointment intake as a first-class workflow — collecting the right details, confirming time zone context, and completing the booking path.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {[
                "Conversational intake for required patient fields",
                "Preferred date and time collection in Eastern Time",
                "Confirmation before the appointment is finalized",
                "Meeting and schedule details for the patient"
              ].map((item) => (
                <p key={item} className="rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/80">
                  {item}
                </p>
              ))}
            </div>
          </div>
          <ImageCarousel slides={appointmentSlides} autoPlayMs={5400} tone="dark" />
        </div>
      </Reveal>

      {/* 6. Clinics & knowledge */}
      <Reveal id="clinics" className="section-shell py-20 md:py-28">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_1fr]">
          <div>
            <SectionHeading
              eyebrow="Clinics & knowledge"
              title="Accurate for every location you operate."
              copy="Healthcare groups rarely run one identical front desk. This assistant is designed around clinic identity — separate knowledge, separate voice configuration, and consistent operations across your network."
            />
            <div className="mt-8 flex items-start gap-3 rounded-2xl border border-line bg-white/80 px-5 py-4">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-navy" />
              <p className="text-sm leading-relaxed text-ink/70">
                Keep answers local and trustworthy: each clinic’s assistant stays aligned to that location’s services, hours, and booking rules.
              </p>
            </div>
          </div>
          <ImageCarousel slides={clinicSlides} autoPlayMs={5800} />
        </div>
      </Reveal>

      <footer className="border-t border-line/80 bg-white/70">
        <div className="section-shell flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <img src={botLogo} alt="" className="h-9 w-9 rounded-lg object-cover" />
            <div>
              <p className="font-display text-sm font-semibold text-ink">Healthcare Chat Bot</p>
              <p className="text-xs text-ink/55">Clinic AI for chat, voice, and appointments</p>
            </div>
          </div>
          <p className="text-sm text-ink/50">© {new Date().getFullYear()} Healthcare Chat Bot. All rights reserved.</p>
        </div>
      </footer>

      <AnimatePresence>
        {showTop ? (
          <motion.button
            key="scroll-top"
            type="button"
            aria-label="Scroll to top"
            onClick={scrollToTop}
            initial={{ opacity: 0, y: 12, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.92 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="fixed bottom-6 right-6 z-50 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-navy text-white shadow-soft transition hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:ring-offset-2"
          >
            <ArrowUp className="h-4 w-4" />
          </motion.button>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
