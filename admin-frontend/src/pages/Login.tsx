import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, ShieldCheck, Stethoscope, Activity } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import MedBotLogo from "@/components/admin/MedBotLogo";

export default function Login() {
  const { user, signIn } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      toast.success("Signed in. Session valid for 60 minutes.");
      nav("/dashboard");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-hero flex items-center justify-center p-6 overflow-hidden">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-16 left-[12%] h-40 w-40 rounded-full bg-primary/15 blur-3xl" />
        <div className="absolute bottom-20 right-[10%] h-52 w-52 rounded-full bg-med-sky/20 blur-3xl" />
        <div className="absolute top-1/3 right-1/4 h-28 w-28 rounded-full bg-med-mint/15 blur-2xl" />
      </div>

      <motion.div
        className="w-full max-w-[920px] relative grid lg:grid-cols-2 gap-6 items-stretch"
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="hidden lg:flex flex-col justify-between rounded-3xl border border-white/30 bg-gradient-primary text-primary-foreground p-8 shadow-elegant overflow-hidden relative">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_90%_10%,white/20,transparent_45%)]" />
          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
              <Activity className="h-3.5 w-3.5" /> Clinical console
            </div>
            <h1 className="font-display text-3xl font-semibold mt-5 leading-tight">
              Care operations,
              <br />
              clearly in view.
            </h1>
            <p className="mt-3 text-primary-foreground/85 text-sm leading-relaxed max-w-sm">
              Manage clinics, doctors, campaigns, and conversation flows from one calm medical workspace.
            </p>
          </div>
          <div className="relative grid gap-3 mt-10">
            {[
              { icon: ShieldCheck, title: "Secure sessions", text: "60-minute idle timeout" },
              { icon: Stethoscope, title: "Care-ready tools", text: "Doctors, flows, and calls" },
            ].map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-3 rounded-2xl bg-white/10 border border-white/15 px-4 py-3"
              >
                <item.icon className="h-5 w-5 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold">{item.title}</div>
                  <div className="text-xs text-primary-foreground/75">{item.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-border/70 bg-card/95 backdrop-blur-sm p-8 shadow-elegant">
          <div className="flex flex-col items-center text-center mb-7 lg:items-start lg:text-left">
            <div className="relative mb-4">
              <div className="absolute inset-0 bg-primary/25 blur-2xl opacity-70 rounded-full scale-110" />
              <motion.div
                className="relative"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
              >
                <MedBotLogo
                  size={80}
                  alt="MedBot logo"
                  className="rounded-[1.35rem] shadow-elegant animate-float-soft"
                />
              </motion.div>
            </div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Welcome back</h2>
            <p className="text-muted-foreground mt-1.5 text-sm">
              Sign in to the Medical Bot Console console.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@medbot.com"
                required
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPwd ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="pr-10 h-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPwd ? "Hide password" : "Show password"}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              disabled={submitting}
              className="w-full h-11 bg-gradient-primary hover:opacity-95 text-primary-foreground shadow-md"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
            </Button>
          </form>

          <p className="text-xs text-muted-foreground mt-6 text-center lg:text-left">
            Sessions expire after 60 minutes of inactivity.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
