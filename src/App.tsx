import { Toaster } from "@/components/ui/Toa";
import { Toaster as Sonner } from "@/components/ui/Sonn";
import { TooltipProvider } from "@/components/ui/TlTp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import NeuralNetworkBackground from "@/components/BackG";
import { CookieConsentProvider, useCookieConsent } from "@/integrations/cookie-consent/CookieConsentProvider";
import Settings from "./pages/Settings";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import CookiePolicy from "./pages/CookiePolicy";
import Legal from "./pages/Legal";
import { ThemeProvider } from "@/components/TP";
import ReactGA from 'react-ga4';
import posthog from 'posthog-js';
import { useEffect, useRef } from "react";
import { getDarkMode } from '@/lib/cookies';

const cookieDark = getDarkMode();
if (cookieDark !== null) {
  localStorage.setItem('vite-ui-theme', cookieDark ? 'dark' : 'light');
} else {
  const systemPrefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  localStorage.setItem('vite-ui-theme', systemPrefersLight ? 'light' : 'dark');
}

const GA_TRACKING_ID = import.meta.env.VITE_GA_TRACKING_ID;
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY;
const POSTHOG_HOST = import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com';

const queryClient = new QueryClient();

const AnalyticsGate = () => {
  const { hasAnalyticsConsent } = useCookieConsent();
  const initialized = useRef(false);

  useEffect(() => {
    if (!hasAnalyticsConsent || initialized.current) return;
    initialized.current = true;

    if (GA_TRACKING_ID) {
      ReactGA.initialize(GA_TRACKING_ID);
    }

    if (POSTHOG_KEY) {
      posthog.init(POSTHOG_KEY, {
        api_host: POSTHOG_HOST,
        person_profiles: 'identified_only',
        capture_pageview: false,
        capture_pageleave: true,
        autocapture: true,
        session_recording: {
          maskAllInputs: true,
          recordCrossOriginIframes: false,
        },
      });
    }

    const cfScript = document.createElement('script');
    cfScript.defer = true;
    cfScript.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    cfScript.dataset.cfBeacon = '{"token": "399530eea2ca4eacbaaccf1182a0533c"}';
    document.head.appendChild(cfScript);
  }, [hasAnalyticsConsent]);

  return null;
};

const PageTracker = () => {
  const location = useLocation();
  const { hasAnalyticsConsent } = useCookieConsent();

  useEffect(() => {
    if (!hasAnalyticsConsent) return;

    const path = location.pathname + location.search;
    if (GA_TRACKING_ID) {
      ReactGA.send({ hitType: "pageview", page: path });
    }
    if (POSTHOG_KEY) {
      posthog.capture('$pageview', { $current_url: window.location.href });
    }
  }, [location, hasAnalyticsConsent]);

  return null;
};

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <NeuralNetworkBackground />
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <CookieConsentProvider>
            <AnalyticsGate />
            <PageTracker />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/cookies" element={<CookiePolicy />} />
              <Route path="/legal" element={<Legal />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </CookieConsentProvider>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
