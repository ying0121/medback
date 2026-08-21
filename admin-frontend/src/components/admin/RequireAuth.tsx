import { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth, canAccess } from "@/contexts/AuthContext";
import AppLayout from "./AppLayout";

export default function RequireAuth({ page, children }: { page: string; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
          <div className="text-sm text-muted-foreground">Loading workspace…</div>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!canAccess(user.role, page)) return <Navigate to="/dashboard" replace />;

  return <AppLayout>{children}</AppLayout>;
}
