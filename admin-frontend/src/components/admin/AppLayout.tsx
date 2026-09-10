import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  Building2,
  Users,
  Sparkles,
  PhoneCall,
  CalendarClock,
  LogOut,
  GitBranch,
  Megaphone,
  Stethoscope,
  PanelLeftClose,
  PanelLeftOpen,
  Bot,
  ShieldCheck,
} from "lucide-react";
import { useAuth, canAccess } from "@/contexts/AuthContext";
import botLogo from "@/assets/bot-logo.png";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
    key: "dashboard",
    tint: "bg-med-sky/20 text-med-sky",
    rail: "bg-med-sky",
  },
  {
    to: "/clinics",
    label: "Clinics",
    icon: Building2,
    key: "clinics",
    tint: "bg-primary/15 text-primary",
    rail: "bg-primary",
  },
  {
    to: "/appointments",
    label: "Appointments",
    icon: CalendarClock,
    key: "appointments",
    tint: "bg-med-amber/20 text-med-amber",
    rail: "bg-med-amber",
  },
  {
    to: "/users",
    label: "Users",
    icon: Users,
    key: "users",
    tint: "bg-med-indigo/20 text-med-indigo",
    rail: "bg-med-indigo",
  },
  {
    to: "/doctors",
    label: "Doctors",
    icon: Stethoscope,
    key: "doctors",
    tint: "bg-med-mint/20 text-med-mint",
    rail: "bg-med-mint",
  },
  {
    to: "/agents",
    label: "Agents",
    icon: Bot,
    key: "agents",
    tint: "bg-primary/15 text-primary",
    rail: "bg-primary",
  },
  {
    to: "/training",
    label: "Knowledge",
    icon: Sparkles,
    key: "training",
    tint: "bg-med-cyan/20 text-med-cyan",
    rail: "bg-med-cyan",
  },
  {
    to: "/flows",
    label: "Flows",
    icon: GitBranch,
    key: "flows",
    tint: "bg-med-coral/20 text-med-coral",
    rail: "bg-med-coral",
  },
  {
    to: "/campaigns",
    label: "Campaigns",
    icon: Megaphone,
    key: "campaigns",
    tint: "bg-med-rose/20 text-med-rose",
    rail: "bg-med-rose",
  },
  {
    to: "/calls",
    label: "Calls",
    icon: PhoneCall,
    key: "calls",
    tint: "bg-info/20 text-info",
    rail: "bg-info",
  },
  {
    to: "/audit-logs",
    label: "Audit logs",
    icon: ShieldCheck,
    key: "audit-logs",
    tint: "bg-med-indigo/20 text-med-indigo",
    rail: "bg-med-indigo",
  },
] as const;

const pageEase = [0.22, 1, 0.36, 1] as const;
const SIDEBAR_COLLAPSED_KEY = "medbot-admin-sidebar-collapsed";

function pageMeta(pathname: string) {
  const hit = NAV.find((n) => pathname === n.to || pathname.startsWith(`${n.to}/`));
  return hit || NAV[0];
}

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  if (!user) return null;
  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const photoUrl = user.photo && user.photo.trim() ? user.photo : "";
  const items = NAV.filter((n) => canAccess(user.role, n.key));
  const current = pageMeta(location.pathname);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="min-h-screen bg-background">
        <aside
          className={cn(
            "fixed left-0 top-0 bottom-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border z-30 transition-[width] duration-300 ease-out-soft",
            collapsed ? "w-[4.5rem]" : "w-[17rem]"
          )}
        >
          <div
            className={cn(
              "relative overflow-hidden border-b border-sidebar-border",
              collapsed ? "px-2 py-3" : "px-3 py-4"
            )}
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,hsl(173_55%_48%/0.28),transparent_55%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,hsl(199_80%_45%/0.12),transparent_50%)]" />

            <div
              className={cn(
                "relative flex items-center",
                collapsed ? "flex-col gap-2" : "gap-2"
              )}
            >
              <motion.img
                src={botLogo}
                alt="MedBot"
                width={40}
                height={40}
                className="rounded-xl shadow-md ring-2 ring-primary/30 shrink-0"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.4, ease: pageEase }}
              />
              {!collapsed ? (
                <div className="relative min-w-0 flex-1">
                  <div className="font-display font-semibold tracking-tight text-[1.05rem]">
                    MedBot
                  </div>
                  <div className="text-[10px] uppercase tracking-[0.16em] text-sidebar-foreground/55">
                    Clinical admin
                  </div>
                </div>
              ) : null}
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className={cn(
                      "relative shrink-0 h-8 w-8 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      collapsed && "mt-0.5"
                    )}
                    onClick={() => setCollapsed((v) => !v)}
                    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                  >
                    {collapsed ? (
                      <PanelLeftOpen className="h-4 w-4" />
                    ) : (
                      <PanelLeftClose className="h-4 w-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="z-[80]">
                  {collapsed ? "Expand sidebar" : "Collapse sidebar"}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          <nav
            className={cn(
              "flex-1 overflow-y-auto space-y-1",
              collapsed ? "p-2" : "p-3"
            )}
          >
            {!collapsed ? (
              <div className="px-3 pt-1 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">
                Workspace
              </div>
            ) : (
              <div className="h-2" />
            )}
            {items.map((n, index) => {
              const link = (
                <NavLink
                  to={n.to}
                  className={({ isActive }) =>
                    cn(
                      "group relative flex items-center rounded-xl text-sm transition-colors duration-200",
                      collapsed ? "justify-center px-1.5 py-2" : "gap-3 px-2.5 py-2",
                      isActive
                        ? "text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground/72 hover:text-sidebar-accent-foreground"
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive ? (
                        <motion.span
                          layoutId="nav-active"
                          className="absolute inset-0 rounded-xl bg-sidebar-accent"
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      ) : (
                        <span className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 bg-white/5 transition-opacity" />
                      )}
                      {isActive && !collapsed ? (
                        <motion.span
                          layoutId="nav-rail"
                          className={cn(
                            "absolute left-0 top-2 bottom-2 w-[3px] rounded-full",
                            n.rail
                          )}
                          transition={{ type: "spring", stiffness: 380, damping: 32 }}
                        />
                      ) : null}
                      <span
                        className={cn(
                          "relative h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-105",
                          n.tint,
                          isActive && collapsed && "ring-2 ring-white/20"
                        )}
                      >
                        <n.icon className="h-4 w-4" />
                      </span>
                      {!collapsed ? <span className="relative truncate">{n.label}</span> : null}
                    </>
                  )}
                </NavLink>
              );

              return (
                <motion.div
                  key={n.to}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.03 * index, duration: 0.3, ease: pageEase }}
                >
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right" className="z-[80]">
                        {n.label}
                      </TooltipContent>
                    </Tooltip>
                  ) : (
                    link
                  )}
                </motion.div>
              );
            })}
          </nav>

          <div
            className={cn(
              "border-t border-sidebar-border bg-black/10",
              collapsed ? "p-2" : "p-4"
            )}
          >
            <div
              className={cn(
                "flex items-center rounded-xl",
                collapsed ? "justify-center py-1 mb-2" : "gap-3 mb-3 px-1 py-1"
              )}
            >
              {collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="shrink-0">
                      {photoUrl ? (
                        <img
                          src={photoUrl}
                          alt={user.name}
                          className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/40"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-semibold text-primary-foreground shadow-md">
                          {initials}
                        </div>
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="z-[80]">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-xs opacity-80">{user.role}</div>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <>
                  {photoUrl ? (
                    <img
                      src={photoUrl}
                      alt={user.name}
                      className="h-9 w-9 rounded-full object-cover ring-2 ring-primary/40"
                    />
                  ) : (
                    <div className="h-9 w-9 rounded-full bg-gradient-primary flex items-center justify-center text-sm font-semibold text-primary-foreground shadow-md">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{user.name}</div>
                    <div className="text-[11px] text-sidebar-foreground/55 truncate">
                      {user.role}
                    </div>
                  </div>
                </>
              )}
            </div>
            {collapsed ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-full h-9 text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    onClick={() => {
                      signOut();
                      nav("/login");
                    }}
                    aria-label="Sign out"
                  >
                    <LogOut className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" className="z-[80]">
                  Sign out
                </TooltipContent>
              </Tooltip>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                onClick={() => {
                  signOut();
                  nav("/login");
                }}
              >
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </Button>
            )}
          </div>
        </aside>

        <div
          className={cn(
            "min-w-0 min-h-screen flex flex-col transition-[margin] duration-300 ease-out-soft",
            collapsed ? "ml-[4.5rem]" : "ml-[17rem]"
          )}
        >
          <header className="sticky top-0 z-20 border-b border-border/70 bg-card/80 backdrop-blur-md">
            <div className="flex items-center justify-between gap-4 px-6 lg:px-8 h-14">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    current.tint
                  )}
                >
                  <current.icon className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold font-display truncate">
                    {current.label}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">
                    Healthcare operations console
                  </div>
                </div>
              </div>
              <div className="hidden sm:flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-mint-soft text-med-mint px-2.5 py-1 text-[11px] font-medium">
                  <span className="h-1.5 w-1.5 rounded-full bg-med-mint animate-pulse" />
                  Live
                </span>
                <span className="inline-flex items-center rounded-full bg-sky-soft text-med-sky px-2.5 py-1 text-[11px] font-medium">
                  Teal clinical theme
                </span>
              </div>
            </div>
            <div className={cn("h-0.5 w-full", current.rail)} />
          </header>

          <main className="flex-1 min-w-0 overflow-auto">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.28, ease: pageEase }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
