import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MessagesSquare, PhoneCall } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import ConversationInbox from "@/components/admin/ConversationInbox";
import { Button } from "@/components/ui/button";
import {
  getStats,
  listClinics,
  type Clinic,
  type DashboardClinicStat,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function ConversationHistory() {
  const { user } = useAuth();
  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [clinicStats, setClinicStats] = useState<DashboardClinicStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const allowed = user?.role === "Admin" ? undefined : user?.clinicIds;
    setLoading(true);
    Promise.all([listClinics(), getStats(allowed).catch(() => null)])
      .then(([allClinics, stats]) => {
        if (!mounted) return;
        const scoped = allowed
          ? allClinics.filter((c) => allowed.includes(c.id))
          : allClinics;
        setClinics(scoped);
        setClinicStats(stats?.byClinic ?? []);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [user]);

  return (
    <div className="admin-page">
      <PageHeader
        accent={2}
        title="Conversation History"
        description="Review patient webchat threads by clinic — transcripts, voice notes, and appointment requests."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/calls">
              <PhoneCall className="h-3.5 w-3.5 mr-1.5" /> Call History
            </Link>
          </Button>
        }
      />

      {loading ? (
        <div className="rounded-2xl border border-border/70 bg-card h-[min(820px,calc(100vh-11rem))] min-h-[560px] flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <MessagesSquare className="h-4 w-4 animate-pulse" />
          Loading conversation workspace…
        </div>
      ) : clinics.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-6 py-20 text-center">
          <MessagesSquare className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm font-medium">No clinics in scope</p>
          <p className="text-xs text-muted-foreground mt-1">
            Assign clinics to your account or create a clinic first.
          </p>
        </div>
      ) : (
        <ConversationInbox clinics={clinics} clinicStats={clinicStats} />
      )}
    </div>
  );
}
