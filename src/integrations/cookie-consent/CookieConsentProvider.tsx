import React, { createContext, useContext, useEffect, useState } from 'react';
import { getKetchConsent, getKetchAnalyticsConsent } from '@/lib/cookies';

interface CookieConsentContextType {
  /** General consent — the Ketch consent cookie exists. */
  hasConsent: boolean;
  /** Analytics-specific consent confirmed by Ketch. */
  hasAnalyticsConsent: boolean;
}

const CookieConsentContext = createContext<CookieConsentContextType | undefined>(undefined);

export const useCookieConsent = () => {
  const context = useContext(CookieConsentContext);
  if (context === undefined) {
    throw new Error('useCookieConsent must be used within a CookieConsentProvider');
  }
  return context;
};

/**
 * Listens for Ketch consent via the official semaphore API:
 *   ketch('on', 'consent', callback)   — fires every time consent is resolved
 *   ketch('once', 'userConsentUpdated') — fires once when user interacts with banner
 *
 * Also checks the _ketch_consent_v1_ cookie as a fallback for returning visitors.
 */
export const CookieConsentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasConsent, setHasConsent] = useState<boolean>(getKetchConsent());
  const [hasAnalyticsConsent, setHasAnalyticsConsent] = useState<boolean>(getKetchAnalyticsConsent());

  useEffect(() => {
    const syncConsent = () => {
      setHasConsent(true);
      const analyticsGranted = getKetchAnalyticsConsent();
      setHasAnalyticsConsent(analyticsGranted);
      (window as any).__ketchAnalyticsConsent = analyticsGranted;
    };

    const ketch = (window as any).ketch;
    if (typeof ketch === 'function') {
      // Ketch consent event payload shape: { purposes: { analytics: true, ... }, vendorConsents?: {...} }
      ketch('on', 'consent', (consent: any) => {
        setHasConsent(true);

        // Extract analytics from the purposes map
        const purposes = consent?.purposes || consent;
        const granted = !!purposes?.analytics;
        setHasAnalyticsConsent(granted);
        (window as any).__ketchAnalyticsConsent = granted;
      });

      ketch('once', 'userConsentUpdated', syncConsent);
    }

    // Fallback: poll the cookie for returning visitors whose consent was
    // already stored before React mounted.
    const interval = setInterval(() => {
      if (!hasConsent && getKetchConsent()) {
        syncConsent();
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [hasConsent, hasAnalyticsConsent]);

  return (
    <CookieConsentContext.Provider value={{ hasConsent, hasAnalyticsConsent }}>
      {children}
    </CookieConsentContext.Provider>
  );
};
