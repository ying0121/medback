import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { MotionConfig } from "framer-motion";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import RequireAuth from "@/components/admin/RequireAuth";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Login from "./pages/Login.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Clinics from "./pages/Clinics.tsx";
import Users from "./pages/Users.tsx";
import Doctors from "./pages/Doctors.tsx";
import Agents from "./pages/Agents.tsx";
import Training from "./pages/Training.tsx";
import Calls from "./pages/Calls.tsx";
import Appointments from "./pages/Appointments.tsx";
import Flows from "./pages/Flows.tsx";
import Campaigns from "./pages/Campaigns.tsx";
import CampaignPatients from "./pages/CampaignPatients.tsx";

const queryClient = new QueryClient();

const App = () => (
  <MotionConfig reducedMotion="user">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename="/admin">
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<RequireAuth page="dashboard"><Dashboard /></RequireAuth>} />
              <Route path="/clinics" element={<RequireAuth page="clinics"><Clinics /></RequireAuth>} />
              <Route path="/appointments" element={<RequireAuth page="appointments"><Appointments /></RequireAuth>} />
              <Route path="/users" element={<RequireAuth page="users"><Users /></RequireAuth>} />
              <Route path="/doctors" element={<RequireAuth page="doctors"><Doctors /></RequireAuth>} />
              <Route path="/agents" element={<RequireAuth page="agents"><Agents /></RequireAuth>} />
              <Route path="/training" element={<RequireAuth page="training"><Training /></RequireAuth>} />
              <Route path="/flows" element={<RequireAuth page="flows"><Flows /></RequireAuth>} />
              <Route path="/campaigns" element={<RequireAuth page="campaigns"><Campaigns /></RequireAuth>} />
              <Route path="/campaigns/:id" element={<RequireAuth page="campaigns"><CampaignPatients /></RequireAuth>} />
              <Route path="/calls" element={<RequireAuth page="calls"><Calls /></RequireAuth>} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </MotionConfig>
);

export default App;
