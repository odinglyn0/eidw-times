import ReactGA from 'react-ga4';
import posthog from 'posthog-js';
import { getKetchAnalyticsConsent } from '@/lib/cookies';

export const trackEvent = (eventName: string, eventParams?: Record<string, any>) => {
  if (!getKetchAnalyticsConsent()) return;

  if (import.meta.env.VITE_GA_TRACKING_ID) {
    ReactGA.event(eventName, eventParams);
  }

  if (import.meta.env.VITE_POSTHOG_KEY) {
    posthog.capture(eventName, eventParams);
  }
};
