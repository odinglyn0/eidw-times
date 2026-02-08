import React, { createContext, useContext, useEffect, useState } from 'react';
import { getCookieConsent, setCookieConsent } from '@/lib/cookies';

interface CookieConsentContextType {
  hasConsent: boolean;
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
 * Thin wrapper — Ketch smart tag handles the actual consent UI.
 * This provider listens for Ketch consent events and syncs state
 * so the rest of the app can check consent status.
 */
export const CookieConsentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasConsent, setHasConsent] = useState<boolean>(getCookieConsent());

  useEffect(() => {
    // Listen for Ketch consent updates
    const handleKetchConsent = () => {
      setCookieConsent(true);
      setHasConsent(true);
    };

    // Ketch fires 'consent_updated' on the semaphore object
    const win = window as any;
    if (win.semaphore) {
      win.semaphore.push(['onConsent', handleKetchConsent]);
    }

    // Also poll for the Ketch consent cookie as a fallback
    const interval = setInterval(() => {
      if (getCookieConsent() && !hasConsent) {
        setHasConsent(true);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [hasConsent]);

  return (
    <CookieConsentContext.Provider value={{ hasConsent }}>
      {children}
    </CookieConsentContext.Provider>
  );
};
