import Cookies from 'js-cookie';

const COOKIE_EXPIRATION_DAYS = 7; // days

// ── Functional cookies (settings — always allowed, no consent gate) ──
const AUTO_POLL_ENABLED_KEY = 'auto_poll_enabled';
const AUTO_POLL_INTERVAL_KEY = 'auto_poll_interval';
const DARK_MODE_KEY = 'dark_mode_enabled';
const SHOW_RECOMMENDATION_KEY = 'show_recommendation';

// ── Ketch consent ──
// Ketch stores consent in a first-party cookie: _ketch_consent_v1_
// Value is URL-encoded JSON mapping purpose codes → { status: "granted"|"denied" }
const KETCH_CONSENT_COOKIE = '_ketch_consent_v1_';

/** Read a cookie value by name from document.cookie */
const readCookie = (key: string): string | undefined => {
  const match = document.cookie
    .split('; ')
    .reduce<string | undefined>((result, v) => {
      const parts = v.split('=');
      return parts[0] === key ? decodeURIComponent(parts.slice(1).join('=')) : result;
    }, undefined);
  return match;
};

/** True when the Ketch consent cookie exists (user has interacted with banner). */
export const getKetchConsent = (): boolean => {
  return !!readCookie(KETCH_CONSENT_COOKIE);
};

/** True only when Ketch has explicitly granted the "analytics" purpose. */
export const getKetchAnalyticsConsent = (): boolean => {
  // 1. Fast path: in-memory flag set by the consent event listener
  if ((window as any).__ketchAnalyticsConsent === true) return true;

  // 2. Parse the consent cookie
  const raw = readCookie(KETCH_CONSENT_COOKIE);
  if (!raw) return false;

  try {
    const parsed = JSON.parse(raw);
    // The cookie value is { purposeCode: { status: "granted" } }
    // or possibly { purposeCode: "granted" } depending on Ketch version
    for (const [key, val] of Object.entries(parsed)) {
      if (key === 'analytics') {
        if (typeof val === 'object' && val !== null && (val as any).status === 'granted') return true;
        if (val === 'granted' || val === true) return true;
      }
    }
  } catch {
    // Cookie parse failed — treat as no consent
  }
  return false;
};

// ── Functional cookie helpers (no consent gate) ──

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
