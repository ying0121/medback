import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { login as apiLogin, listUsers, type AuthUser } from "@/lib/api";

const SESSION_KEY = "medbot.session";
const SESSION_MS = 60 * 60 * 1000; // 60 minutes

interface StoredSession {
  user: AuthUser;
  expiresAt: number;
}

interface AuthCtx {
  user: AuthUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      if (raw) {
        const s: StoredSession = JSON.parse(raw);
        if (s.expiresAt > Date.now()) {
          const remaining = s.expiresAt - Date.now();
          timer = setTimeout(() => signOut(), remaining);

          // Backfill older sessions that were saved before `photo` was included.
          if (!s.user.photo) {
            setUser(s.user);
            listUsers()
              .then((rows) => {
                const matched = rows.find((u) => u.email?.toLowerCase?.() === s.user.email?.toLowerCase?.());
                if (!matched?.photo) return;
                const upgraded = { ...s.user, photo: matched.photo };
                setUser(upgraded);
                localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, user: upgraded }));
              })
              .catch(() => {
                // keep current session if this hydration fails
              });
          } else {
            setUser(s.user);
          }
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const u = await apiLogin(email, password);
    const expiresAt = Date.now() + SESSION_MS;
    localStorage.setItem(SESSION_KEY, JSON.stringify({ user: u, expiresAt }));
    setUser(u);
    setTimeout(() => signOut(), SESSION_MS);
  };

  const signOut = () => {
    localStorage.removeItem(SESSION_KEY);
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used within AuthProvider");
  return v;
}

// Permission helper
export const PERMISSIONS = {
  Admin: ["dashboard", "clinics", "users", "training", "calls"] as const,
  "Clinic Staff": ["dashboard", "training", "calls"] as const,
};

export function canAccess(role: AuthUser["role"], page: string) {
  return (PERMISSIONS[role] as readonly string[]).includes(page);
}
