import Cookies from 'js-cookie';

const COOKIE_EXPIRATION_DAYS = 7; // days

// ── Functional cookies (settings — always allowed, no consent gate) ──
const AUTO_POLL_ENABLED_KEY = 'auto_poll_enabled';
const AUTO_POLL_INTERVAL_KEY = 'auto_poll_interval';
const DARK_MODE_KEY = 'dark_mode_enabled';
const SHOW_RECOMMENDATION_KEY = 'show_recommendation';

// ── Ketch consent ──

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

/** True when any Ketch consent cookie exists (user has interacted with banner). */
export const getKetchConsent = (): boolean => {
  return document.cookie.split('; ').some(c =>
    c.startsWith('_ketch_consent_') || c.startsWith('_swb_consent_')
  );
};

/** True only when Ketch has explicitly granted the "analytics" purpose. */
export const getKetchAnalyticsConsent = (): boolean => {
  // 1. Fast path: in-memory flag set by the consent event listener
  if ((window as any).__ketchAnalyticsConsent === true) return true;

  // 2. Parse the consent cookie
  // Try multiple known Ketch cookie names
  const cookieNames = ['_ketch_consent_v1_', '_swb_consent_'];
  for (const name of cookieNames) {
    const raw = readCookie(name);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      // Could be { purposes: { analytics: { status: "granted" } } }
      // or { analytics: { status: "granted" } }
      // or { purposes: { analytics: true } }
      const purposes = parsed?.purposes || parsed;
      const val = purposes?.analytics;
      if (val === true || val === 'granted') return true;
      if (typeof val === 'object' && val !== null && val.status === 'granted') return true;
    } catch {
      // Cookie parse failed
    }
  }

  // 3. Also check all cookies for any ketch consent cookie we might have missed
  const allCookies = document.cookie.split('; ');
  for (const c of allCookies) {
    if (c.startsWith('_ketch_consent_') || c.startsWith('_swb_consent_')) {
      try {
        const raw = decodeURIComponent(c.split('=').slice(1).join('='));
        const parsed = JSON.parse(raw);
        const purposes = parsed?.purposes || parsed;
        const val = purposes?.analytics;
        if (val === true || val === 'granted') return true;
        if (typeof val === 'object' && val !== null && val.status === 'granted') return true;
      } catch {
        // skip
      }
    }
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
