import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import DashboardShell from "./layouts/DashboardShell";
import Overview from "./pages/dashboard/Overview";
import ReviewsPage from "./pages/dashboard/Reviews";
import WhatsAppPage from "./pages/dashboard/WhatsApp";
import EmailPage from "./pages/dashboard/Email";
import CompetitorsPage from "./pages/dashboard/Competitors";
import InfoEmailPage from "./pages/dashboard/InfoEmail";
import SocialPage from "./pages/dashboard/Social";
import WelcomePage from "./pages/dashboard/Welcome";
import WhatsAppLanding from "./pages/WhatsAppLanding";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<DashboardShell />}>
              <Route path="/" element={<Overview />} />
              <Route path="/dashboard/reviews" element={<ReviewsPage />} />
              <Route path="/dashboard/whatsapp" element={<WhatsAppPage />} />
              <Route path="/dashboard/email" element={<EmailPage />} />
              <Route path="/dashboard/competitors" element={<CompetitorsPage />} />
              <Route path="/dashboard/info-email" element={<InfoEmailPage />} />
              <Route path="/dashboard/social" element={<SocialPage />} />
              <Route path="/dashboard/welcome" element={<WelcomePage />} />
            </Route>
            {/* Standalone WhatsApp Web clone (preserved) */}
            <Route path="/whatsapp-inbox" element={<WhatsAppLanding />} />
            <Route path="/whatsapp" element={<WhatsAppLanding />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
