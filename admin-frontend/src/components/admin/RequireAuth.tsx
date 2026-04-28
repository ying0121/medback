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
        <div className="text-muted-foreground">Loading…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!canAccess(user.role, page)) return <Navigate to="/dashboard" replace />;

  return <AppLayout>{children}</AppLayout>;
}
