import ReactGA from 'react-ga4';
import posthog from 'posthog-js';
import { getKetchAnalyticsConsent } from '@/lib/cookies';

export const trackEvent = (eventName: string, eventParams?: Record<string, any>) => {
  // Block all analytical tracking until Ketch confirms analytics consent
  if (!getKetchAnalyticsConsent()) return;

  // Google Analytics
  if (import.meta.env.VITE_GA_TRACKING_ID) {
    ReactGA.event(eventName, eventParams);
  }

  // PostHog
  if (import.meta.env.VITE_POSTHOG_KEY) {
    posthog.capture(eventName, eventParams);
  }
};
