import React, { createContext, useContext, useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { getCookieConsent, setCookieConsent } from '@/lib/cookies';

interface CookieConsentContextType {
  hasConsent: boolean;
  giveConsent: () => void;
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
  const [hasConsent, setHasConsent] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

  useEffect(() => {
    const consent = getCookieConsent();
    setHasConsent(consent);
    if (!consent) {
      setIsDialogOpen(true);
    }
  }, []);

  const giveConsent = () => {
    setCookieConsent(true);
    setHasConsent(true);
    setIsDialogOpen(false);
  };

  return (
    <CookieConsentContext.Provider value={{ hasConsent, giveConsent }}>
      {children}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Cookie Consent</DialogTitle>
            <DialogDescription>
              This website uses cookies to remember your preferences, such as auto-refresh settings. By continuing to use this site, you agree to our use of cookies.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={giveConsent}>Accept Cookies</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CookieConsentContext.Provider>
  );
};