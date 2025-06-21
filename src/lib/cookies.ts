import Cookies from 'js-cookie';

const COOKIE_CONSENT_KEY = 'cookie_consent_given';
const AUTO_POLL_ENABLED_KEY = 'auto_poll_enabled';
const AUTO_POLL_INTERVAL_KEY = 'auto_poll_interval';
const COOKIE_EXPIRATION_DAYS = 7;

export const setCookieConsent = (consent: boolean) => {
  Cookies.set(COOKIE_CONSENT_KEY, String(consent), { expires: COOKIE_EXPIRATION_DAYS });
};

export const getCookieConsent = (): boolean => {
  return Cookies.get(COOKIE_CONSENT_KEY) === 'true';
};

export const setAutoPollEnabled = (enabled: boolean) => {
  Cookies.set(AUTO_POLL_ENABLED_KEY, String(enabled), { expires: COOKIE_EXPIRATION_DAYS });
};

export const getAutoPollEnabled = (): boolean => {
  return Cookies.get(AUTO_POLL_ENABLED_KEY) === 'true';
};

export const setAutoPollInterval = (interval: number) => {
  Cookies.set(AUTO_POLL_INTERVAL_KEY, String(interval), { expires: COOKIE_EXPIRATION_DAYS });
};

export const getAutoPollInterval = (): number => {
  const interval = Cookies.get(AUTO_POLL_INTERVAL_KEY);
  return interval ? parseInt(interval, 10) : 30; // Default to 30 seconds
};