import Cookies from 'js-cookie';

const COOKIE_EXPIRATION_DAYS = 7;

const AUTO_POLL_ENABLED_KEY = 'auto_poll_enabled';
const AUTO_POLL_INTERVAL_KEY = 'auto_poll_interval';
const DARK_MODE_KEY = 'dark_mode_enabled';
const SHOW_RECOMMENDATION_KEY = 'show_recommendation';
const FORECAST_MODEL_KEY = 'forecast_model';
const SECURITY_VIEW_MODE_KEY = 'security_view_mode';

const readCookie = (key: string): string | undefined => {
  const match = document.cookie
    .split('; ')
    .reduce<string | undefined>((result, v) => {
      const parts = v.split('=');
      return parts[0] === key ? decodeURIComponent(parts.slice(1).join('=')) : result;
    }, undefined);
  return match;
};

export const getKetchConsent = (): boolean => {
  return document.cookie.split('; ').some(c =>
    c.startsWith('_ketch_consent_') || c.startsWith('_swb_consent_')
  );
};

export const getKetchAnalyticsConsent = (): boolean => {
  if ((window as any).__ketchAnalyticsConsent === true) return true;

  const cookieNames = ['_ketch_consent_v1_', '_swb_consent_'];
  for (const name of cookieNames) {
    const raw = readCookie(name);
    if (!raw) continue;

    try {
      const parsed = JSON.parse(raw);
      const purposes = parsed?.purposes || parsed;
      const val = purposes?.analytics;
      if (val === true || val === 'granted') return true;
      if (typeof val === 'object' && val !== null && val.status === 'granted') return true;
    } catch {
    }
  }

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
      }
    }
  }

  return false;
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

export const setForecastModel = (model: 'liminal' | 'trition') => {
  Cookies.set(FORECAST_MODEL_KEY, model, { expires: COOKIE_EXPIRATION_DAYS });
};

export const getForecastModel = (): 'liminal' | 'trition' => {
  const value = Cookies.get(FORECAST_MODEL_KEY);
  if (value === 'liminal') return 'liminal';
  return 'trition';
};

export const setSecurityViewMode = (mode: 'graph' | 'tiles') => {
  Cookies.set(SECURITY_VIEW_MODE_KEY, mode, { expires: COOKIE_EXPIRATION_DAYS });
};

export const getSecurityViewMode = (): 'graph' | 'tiles' => {
  const value = Cookies.get(SECURITY_VIEW_MODE_KEY);
  if (value === 'tiles') return 'tiles';
  return 'graph';
};
