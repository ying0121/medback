import { ReactNode } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { LayoutDashboard, Building2, Users, Sparkles, PhoneCall, CalendarClock, LogOut } from "lucide-react";
import { useAuth, canAccess } from "@/contexts/AuthContext";
import botLogo from "@/assets/bot-logo.png";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { to: "/clinics", label: "Clinics", icon: Building2, key: "clinics" },
  { to: "/appointments", label: "Appointments", icon: CalendarClock, key: "appointments" },
  { to: "/users", label: "Users", icon: Users, key: "users" },
  { to: "/training", label: "Training", icon: Sparkles, key: "training" },
  { to: "/calls", label: "Calls", icon: PhoneCall, key: "calls" },
];

const pageEase = [0.22, 1, 0.36, 1] as const;

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  if (!user) return null;
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const photoUrl = user.photo && user.photo.trim() ? user.photo : "";
  const items = NAV.filter((n) => canAccess(user.role, n.key));

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border z-30">
        <div className="relative overflow-hidden p-5 flex items-center gap-3 border-b border-sidebar-border">
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-transparent" />
          <motion.img
            src={botLogo}
            alt="MedBot"
            width={40}
            height={40}
            className="relative rounded-xl shadow-md ring-1 ring-white/10"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: pageEase }}
          />
          <div className="relative">
            <div className="font-semibold tracking-tight">MedBot</div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-sidebar-foreground/50">Admin console</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {items.map((n, index) => (
            <motion.div
              key={n.to}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.04 * index, duration: 0.32, ease: pageEase }}
            >
              <NavLink
                to={n.to}
                className={({ isActive }) =>
                  cn(
                    "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors duration-200",
                    isActive
                      ? "text-sidebar-accent-foreground font-medium"
                      : "text-sidebar-foreground/70 hover:text-sidebar-accent-foreground"
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive ? (
                      <motion.span
                        layoutId="nav-active"
                        className="absolute inset-0 rounded-xl bg-sidebar-accent shadow-inner"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    ) : null}
                    {isActive ? (
                      <motion.span
                        layoutId="nav-rail"
                        className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full bg-sidebar-foreground/80"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    ) : null}
                    <n.icon className="relative h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
                    <span className="relative">{n.label}</span>
                  </>
                )}
              </NavLink>
            </motion.div>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3 rounded-xl px-1 py-1">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={user.name}
                className="h-9 w-9 rounded-full object-cover ring-2 ring-white/15"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-semibold text-sidebar-accent-foreground shadow-md ring-1 ring-white/10">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-sidebar-foreground/55 truncate">{user.role}</div>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            onClick={() => { signOut(); nav("/login"); }}
          >
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="ml-64 min-w-0 min-h-screen overflow-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.32, ease: pageEase }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
