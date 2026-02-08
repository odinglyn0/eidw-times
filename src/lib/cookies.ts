import Cookies from 'js-cookie';

const COOKIE_EXPIRATION_DAYS = 7; // days

// ── Functional cookies (settings) ──
const AUTO_POLL_ENABLED_KEY = 'auto_poll_enabled';
const AUTO_POLL_INTERVAL_KEY = 'auto_poll_interval';
const DARK_MODE_KEY = 'dark_mode_enabled';
const SHOW_RECOMMENDATION_KEY = 'show_recommendation';
const COOKIE_CONSENT_KEY = 'cookie_consent_given';

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
  return interval ? parseInt(interval, 10) : 30;
};

export const setDarkMode = (enabled: boolean) => {
  Cookies.set(DARK_MODE_KEY, String(enabled), { expires: COOKIE_EXPIRATION_DAYS });
};

export const getDarkMode = (): boolean | null => {
  const value = Cookies.get(DARK_MODE_KEY);
  if (value === undefined) return null;
  return value === 'true';
};

export const setShowRecommendation = (enabled: boolean) => {
  Cookies.set(SHOW_RECOMMENDATION_KEY, String(enabled), { expires: COOKIE_EXPIRATION_DAYS });
};

export const getShowRecommendation = (): boolean => {
  const value = Cookies.get(SHOW_RECOMMENDATION_KEY);
  if (value === undefined) return true;
  return value === 'true';
};
