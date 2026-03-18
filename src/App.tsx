import { Toaster } from "@/components/ui/Toa";
import { Toaster as Sonner } from "@/components/ui/Sonn";
import { TooltipProvider } from "@/components/ui/TlTp";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { lazy, Suspense, useEffect, useRef } from "react";
import { Analytics } from "@vercel/analytics/react";
import { FingerprintProvider } from "@fingerprint/react";
function lazyWithRetry(factory: () => Promise<{ default: React.ComponentType<unknown> }>) {
  return lazy(() =>
    factory().catch((err) => {
      const hasRefreshed = sessionStorage.getItem("chunk_retry");
      if (!hasRefreshed) {
        sessionStorage.setItem("chunk_retry", "1");
        window.location.reload();
        return new Promise(() => {});
      }
      sessionStorage.removeItem("chunk_retry");
      throw err;
    })
  );
}

const Index = lazyWithRetry(() => import("./pages/Index"));
import { CookieConsentProvider, useCookieConsent } from "@/integrations/cookie-consent/CookieConsentProvider";
import { ThemeProvider } from "@/components/TP";
import { getDarkMode } from '@/lib/cookies';
import BounceTokenGate from "@/components/BounceTokenGate";

const NeuralNetworkBackground = lazyWithRetry(() => import("@/components/BackG"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));

const ErrorPage = lazyWithRetry(() => import("./pages/ErrorPage"));
let _ReactGA: typeof import('react-ga4').default | null = null;
let _posthog: typeof import('posthog-js').default | null = null;

const loadAnalytics = async () => {
  const [ga, ph] = await Promise.all([
    import('react-ga4'),
    import('posthog-js'),
  ]);
  _ReactGA = ga.default;
  _posthog = ph.default;
  return { ReactGA: _ReactGA, posthog: _posthog };
};

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

    loadAnalytics().then(({ ReactGA, posthog }) => {
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
    });

    const cfScript = document.createElement('script');
    cfScript.defer = true;
    cfScript.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    cfScript.dataset.cfBeacon = '{"token": "399530eea2ca4eacbaaccf1182a0533c"}';
    document.head.appendChild(cfScript);
  }, [hasAnalyticsConsent]);

  return hasAnalyticsConsent ? <Analytics /> : null;
};

const PageTracker = () => {
  const location = useLocation();
  const { hasAnalyticsConsent } = useCookieConsent();

  useEffect(() => {
    if (!hasAnalyticsConsent) return;

    const path = location.pathname + location.search;
    if (GA_TRACKING_ID && _ReactGA) {
      _ReactGA.send({ hitType: "pageview", page: path });
    }
    if (POSTHOG_KEY && _posthog) {
      _posthog.capture('$pageview', { $current_url: window.location.href });
    }
  }, [location, hasAnalyticsConsent]);

  return null;
};

const App = () => (
  <FingerprintProvider
    apiKey={import.meta.env.VITE_FINGERPRINT_API_KEY || ""}
    region="eu"
    endpoints={["https://fp.eidwtimes.xyz"]}
  >
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Suspense fallback={null}>
            <NeuralNetworkBackground />
          </Suspense>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <CookieConsentProvider>
              <AnalyticsGate />
              <PageTracker />
              <Routes>
                <Route path="/error/:code" element={
                  <Suspense fallback={null}><ErrorPage /></Suspense>
                } />
                <Route path="*" element={
                  <BounceTokenGate>
                    <Suspense fallback={null}>
                      <Routes>
                        <Route path="/" element={<Index />} />
                        <Route path="/settings" element={<Settings />} />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </BounceTokenGate>
                } />
              </Routes>
            </CookieConsentProvider>
          </BrowserRouter>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </FingerprintProvider>
);

export default App;
