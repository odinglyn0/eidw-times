import { resolveDatagramUrl, DatagramMissingError, mintDatagram, storeDatagramManifest } from "./datagram";
import { datacraneFetch } from "./datacrane";
import { dataghostUnwrap } from "./dataghost";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getCookie("elasticBounceTokenScreen");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const fp = sessionStorage.getItem("_ebfp");
  if (fp) headers["X-Session-Fingerprint"] = fp;
  return headers;
}

let _remintPromise: Promise<void> | null = null;

async function _ensureDatagram(): Promise<void> {
  if (_remintPromise) return _remintPromise;
  _remintPromise = (async () => {
    try {
      const fp = sessionStorage.getItem("_ebfp");
      if (!fp) throw new Error("No fingerprint");
      const manifest = await mintDatagram(fp);
      storeDatagramManifest(manifest);
    } finally {
      _remintPromise = null;
    }
  })();
  return _remintPromise;
}

async function dgramFetch(
  originalRoute: string,
  init?: RequestInit
): Promise<Response> {
  const doFetch = async (): Promise<Response> => {
    try {
      const { url, extraHeaders } = resolveDatagramUrl(originalRoute, API_BASE_URL);
      const existing = (init?.headers as Record<string, string>) || {};
      const merged = { ...authHeaders(), ...extraHeaders, ...existing };
      return datacraneFetch(url, { ...init, headers: merged });
    } catch (e) {
      if (e instanceof DatagramMissingError) {
        await _ensureDatagram();
        const { url, extraHeaders } = resolveDatagramUrl(originalRoute, API_BASE_URL);
        const existing = (init?.headers as Record<string, string>) || {};
        const merged = { ...authHeaders(), ...extraHeaders, ...existing };
        return datacraneFetch(url, { ...init, headers: merged });
      }
      throw e;
    }
  };

  const raw = await doFetch();

  if (!raw.ok) return raw;

  const originalJson = raw.json.bind(raw);
  let _cachedBody: unknown = undefined;

  const wrappedResponse = new Proxy(raw, {
    get(target, prop) {
      if (prop === "json") {
        return async () => {
          if (_cachedBody !== undefined) return _cachedBody;
          const body = await originalJson();
          _cachedBody = dataghostUnwrap(body);
          return _cachedBody;
        };
      }
      return Reflect.get(target, prop);
    },
  });

  return wrappedResponse;
}

function getModelVersion(): 'liminal' | 'trition' {
  const model = getCookie('forecast_model');
  return model === 'liminal' ? 'liminal' : 'trition';
}

export const apiClient = {
  async getCurrentSecurityData() {
    const response = await dgramFetch('/api/current-security-data');
    if (!response.ok) throw new Error('Failed to fetch current security data');
    return response.json();
  },

  async getSecurityData() {
    const response = await dgramFetch('/api/security-data');
    if (!response.ok) throw new Error('Failed to fetch security data');
    return response.json();
  },

  async getDepartureData(terminalId: string, threeDaysAgo: string) {
    const response = await dgramFetch('/api/departure-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, threeDaysAgo })
    });
    if (!response.ok) throw new Error('Failed to fetch departure data');
    return response.json();
  },

  async getHourlyIntervalSecurityData() {
    const response = await dgramFetch('/api/hourly-interval-security-data');
    if (!response.ok) throw new Error('Failed to fetch hourly interval security data');
    return response.json();
  },

  async getHourlyIntervalDepartureData(terminalId: string) {
    const response = await dgramFetch('/api/hourly-interval-departure-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId })
    });
    if (!response.ok) throw new Error('Failed to fetch hourly interval departure data');
    return response.json();
  },

  async submitFeatureRequest(name: string, email: string, details: string, recaptchaToken: string) {
    const response = await dgramFetch('/api/feature-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, details, recaptchaToken })
    });
    if (!response.ok) throw new Error('Failed to submit feature request');
    return response.json();
  },

  async getAcknowledgedFeatureRequests() {
    const response = await dgramFetch('/api/acknowledged-feature-requests');
    if (!response.ok) throw new Error('Failed to fetch acknowledged feature requests');
    return response.json();
  },

  async getActiveAnnouncements() {
    const response = await dgramFetch('/api/active-announcements');
    if (!response.ok) throw new Error('Failed to fetch active announcements');
    return response.json();
  },

  async getRangeSecurityData(start: string, end: string) {
    const response = await dgramFetch('/api/range-security-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end })
    });
    if (!response.ok) throw new Error('Failed to fetch range security data');
    return response.json();
  },

  async getIrishTime(): Promise<{ time: string }> {
    const response = await dgramFetch('/api/irish-time');
    if (!response.ok) throw new Error('Failed to fetch Irish time');
    return response.json();
  },

  async getLastDepartures(): Promise<Record<string, string>> {
    const response = await dgramFetch('/api/last-departures');
    if (!response.ok) throw new Error('Failed to fetch last departures');
    return response.json();
  },

  async getFacilityHours() {
    const response = await dgramFetch('/api/facility-hours');
    if (!response.ok) throw new Error('Failed to fetch facility hours');
    return response.json();
  },

  async simulateGammaMethodB(terminalId: number) {
    const version = getModelVersion();
    const response = await dgramFetch(`/api/simulate/${version}/method-b`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId })
    });
    if (!response.ok) throw new Error('Failed to run simulation');
    return response.json();
  },

  async simulateTangoMethodA(terminalId: number, hourTimestamp?: string) {
    const version = getModelVersion();
    const response = await dgramFetch(`/api/simulate/${version}/method-d`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, hourTimestamp })
    });
    if (!response.ok) throw new Error('Failed to run simulation');
    return response.json();
  },

  async simulateGammaMethodA(terminalId: number, start: string, end: string, selectedTimeframe: number) {
    const version = getModelVersion();
    const response = await dgramFetch(`/api/simulate/${version}/method-a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, start, end, selectedTimeframe })
    });
    if (!response.ok) throw new Error('Failed to run simulation');
    return response.json();
  },

  async getRangeDepartureData(terminalId: string, start: string, end: string) {
    const response = await dgramFetch('/api/range-departure-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, start, end })
    });
    if (!response.ok) throw new Error('Failed to fetch range departure data');
    return response.json();
  },

  async getRecommendation() {
    const response = await dgramFetch('/api/recommendation');
    if (!response.ok) throw new Error('Failed to fetch recommendation');
    return response.json();
  },

  async getProcessedSecurityData(terminalId: number) {
    const response = await dgramFetch(`/api/processed-security-data?terminalId=${terminalId}`);
    if (!response.ok) throw new Error('Failed to fetch processed security data');
    return response.json();
  },

  async getProcessedDepartureData(terminalId: number) {
    const response = await dgramFetch(`/api/processed-departure-data?terminalId=${terminalId}`);
    if (!response.ok) throw new Error('Failed to fetch processed departure data');
    return response.json();
  },

  async getChartData(terminalId: number, start: string, end: string, granularity: number) {
    const response = await dgramFetch('/api/chart-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, start, end, granularity })
    });
    if (!response.ok) throw new Error('Failed to fetch chart data');
    return response.json();
  },

  async getHourlyDetailStats(terminalId: number, currentTimestamp: string, prevTimestamp?: string, nextTimestamp?: string) {
    const response = await dgramFetch('/api/hourly-detail-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, currentTimestamp, prevTimestamp, nextTimestamp })
    });
    if (!response.ok) throw new Error('Failed to fetch hourly detail stats');
    return response.json();
  },

  async getProjectedHourlyStats(terminalId: number, numSims: number = 500) {
    const model = getModelVersion();
    const response = await dgramFetch('/api/projected-hourly-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, numSims, model })
    });
    if (!response.ok) throw new Error('Failed to fetch projected hourly stats');
    return response.json();
  },

  async verifyBounceToken(recaptchaToken: string, fingerprint: string) {
    const response = await datacraneFetch(`${API_BASE_URL}/api/bouncetoken/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recaptchaToken, fingerprint })
    });
    return response.json();
  },

  async verifyBounceTokenWithFlint(recaptchaToken: string, fingerprint: string, challengeId: string, nonce: string) {
    const response = await datacraneFetch(`${API_BASE_URL}/api/bouncetoken/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recaptchaToken,
        fingerprint,
        dataflintChallengeId: challengeId,
        dataflintNonce: nonce,
      })
    });
    return response.json();
  },

  async getProjected6h(terminalId: number) {
    const version = getModelVersion();
    const response = await dgramFetch(`/api/simulate/${version}/method-c`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId })
    });
    if (!response.ok) throw new Error('Failed to fetch projected 6h data');
    return response.json();
  }
};
