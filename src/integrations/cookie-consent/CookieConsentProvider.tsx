import React, { createContext, useContext, useEffect, useState } from 'react';
import { getKetchConsent, getKetchAnalyticsConsent } from '@/lib/cookies';

interface CookieConsentContextType {
  hasConsent: boolean;
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
      ketch('on', 'consent', (consent: any) => {
        setHasConsent(true);

        const purposes = consent?.purposes || consent;
        const granted = !!purposes?.analytics;
        setHasAnalyticsConsent(granted);
        (window as any).__ketchAnalyticsConsent = granted;
      });

      ketch('once', 'userConsentUpdated', syncConsent);
    }

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
