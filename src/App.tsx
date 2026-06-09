import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "./contexts/AuthContext";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { ErrorBoundary } from "./components/ErrorBoundary";
import DashboardShell from "./layouts/DashboardShell";

const Overview = lazy(() => import("./pages/dashboard/Overview"));
const ReviewsPage = lazy(() => import("./pages/dashboard/Reviews"));
const WhatsAppPage = lazy(() => import("./pages/dashboard/WhatsApp"));
const EmailPage = lazy(() => import("./pages/dashboard/Email"));
const CompetitorsPage = lazy(() => import("./pages/dashboard/Competitors"));
const InfoEmailPage = lazy(() => import("./pages/dashboard/InfoEmail"));
const SocialPage = lazy(() => import("./pages/dashboard/Social"));
const WelcomePage = lazy(() => import("./pages/dashboard/Welcome"));
const WhatsAppLanding = lazy(() => import("./pages/WhatsAppLanding"));
const AuthPage = lazy(() => import("./pages/Auth"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
    },
  },
});

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <ErrorBoundary>
                <Suspense fallback={<RouteFallback />}>
                  <Routes>
                    <Route path="/auth" element={<AuthPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />

                    <Route
                      element={
                        <ProtectedRoute>
                          <DashboardShell />
                        </ProtectedRoute>
                      }
                    >
                      <Route index element={<Overview />} />
                      <Route path="/dashboard" element={<Overview />} />
                      <Route path="/dashboard/reviews" element={<ReviewsPage />} />
                      <Route path="/dashboard/whatsapp" element={<WhatsAppPage />} />
                      <Route path="/dashboard/email" element={<EmailPage />} />
                      <Route path="/dashboard/competitors" element={<CompetitorsPage />} />
                      <Route path="/dashboard/info-email" element={<InfoEmailPage />} />
                      <Route path="/dashboard/social" element={<SocialPage />} />
                      <Route path="/dashboard/welcome" element={<WelcomePage />} />
                    </Route>

                    <Route
                      path="/whatsapp-inbox"
                      element={
                        <ProtectedRoute>
                          <WhatsAppLanding />
                        </ProtectedRoute>
                      }
                    />
                    <Route
                      path="/whatsapp"
                      element={
                        <ProtectedRoute>
                          <WhatsAppLanding />
                        </ProtectedRoute>
                      }
                    />

                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Suspense>
              </ErrorBoundary>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
