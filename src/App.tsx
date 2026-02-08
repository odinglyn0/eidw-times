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
import posthog from 'posthog-js';
import { useEffect } from "react";
import { getDarkMode } from '@/lib/cookies';

// Sync cookie-based dark mode preference into localStorage before React renders
const cookieDark = getDarkMode();
if (cookieDark !== null) {
  localStorage.setItem('vite-ui-theme', cookieDark ? 'dark' : 'light');
} else {
  const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  localStorage.setItem('vite-ui-theme', systemPrefersLight ? 'light' : 'dark');
}

// Initialize Google Analytics from env
const GA_TRACKING_ID = import.meta.env.VITE_GA_TRACKING_ID;
if (GA_TRACKING_ID) {
  ReactGA.initialize(GA_TRACKING_ID);
}

// Initialize PostHog from env
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';
if (POSTHOG_KEY) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    person_profiles: 'identified_only',
    capture_pageview: false, // We handle pageviews manually below
    capture_pageleave: true,
    autocapture: true,
  });
}

const queryClient = new QueryClient();

// Track page views for both GA and PostHog
const PageTracker = () => {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;
    if (GA_TRACKING_ID) {
      ReactGA.send({ hitType: "pageview", page: path });
    }
    if (POSTHOG_KEY) {
      posthog.capture('$pageview', { $current_url: window.location.href });
    }
  }, [location]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NeuralNetworkBackground />
        <BrowserRouter>
          <PageTracker />
          <CookieConsentProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CookieConsentProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
