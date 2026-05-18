import { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { LayoutDashboard, Building2, Users, Sparkles, PhoneCall, LogOut } from "lucide-react";
import { useAuth, canAccess } from "@/contexts/AuthContext";
import botLogo from "@/assets/bot-logo.png";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, key: "dashboard" },
  { to: "/clinics", label: "Clinics", icon: Building2, key: "clinics" },
  { to: "/users", label: "Users", icon: Users, key: "users" },
  { to: "/training", label: "Training", icon: Sparkles, key: "training" },
  { to: "/calls", label: "Calls", icon: PhoneCall, key: "calls" },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const nav = useNavigate();

  if (!user) return null;
  const initials = user.name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
  const photoUrl = user.photo && user.photo.trim() ? user.photo : "";

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border z-30">
        <div className="p-6 flex items-center gap-3 border-b border-sidebar-border">
          <img src={botLogo} alt="MedBot" width={40} height={40} className="rounded-lg" />
          <div>
            <div className="font-semibold tracking-tight">MedBot</div>
            <div className="text-xs text-sidebar-foreground/60">Admin Console</div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV.filter((n) => canAccess(user.role, n.key)).map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                }`
              }
            >
              <n.icon className="h-4 w-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3 mb-3">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={user.name}
                className="h-9 w-9 rounded-full object-cover border border-sidebar-border"
              />
            ) : (
              <div className="h-9 w-9 rounded-full bg-gradient-accent flex items-center justify-center text-sm font-semibold text-accent-foreground">
                {initials}
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-xs text-sidebar-foreground/60 truncate">{user.role}</div>
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

      <main className="ml-64 min-w-0 min-h-screen overflow-auto">{children}</main>
    </div>
  );
}
