import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { ChatThemeProvider } from "@/contexts/ChatThemeContext";
import Index from "./pages/Index.tsx";
import IndexForInject from "./pages/IndexForInject.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ChatThemeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<IndexForInject />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ChatThemeProvider>
  </QueryClientProvider>
);

export default App;
