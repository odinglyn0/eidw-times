import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import NeuralNetworkBackground from "@/components/NeuralNetworkBackground";
import { CookieConsentProvider } from "@/integrations/cookie-consent/CookieConsentProvider";
import Settings from "./pages/Settings";
import { ThemeProvider } from "@/components/theme-provider";
import ReactGA from 'react-ga4';
import { useEffect } from "react";
import { getDarkMode } from '@/lib/cookies';

// Sync cookie-based dark mode preference into localStorage before React renders
const cookieDark = getDarkMode();
if (cookieDark !== null) {
  localStorage.setItem('vite-ui-theme', cookieDark ? 'dark' : 'light');
}

const GA_TRACKING_ID = "G-8Z6TY20KPY"; // Your Google Analytics 4 Measurement ID
ReactGA.initialize(GA_TRACKING_ID);

const queryClient = new QueryClient();

// Component to track page views
const PageTracker = () => {
  const location = useLocation();

  useEffect(() => {
    ReactGA.send({ hitType: "pageview", page: location.pathname + location.search });
    console.log(`GA Pageview: ${location.pathname + location.search}`);
  }, [location]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="system" storageKey="vite-ui-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NeuralNetworkBackground />
        <BrowserRouter>
          <PageTracker /> {/* Add PageTracker here */}
          <CookieConsentProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/settings" element={<Settings />} />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CookieConsentProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;