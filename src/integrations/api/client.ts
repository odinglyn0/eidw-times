const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = sessionStorage.getItem("elasticBounceTokenScreen");
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
}

export const apiClient = {
  async getCurrentSecurityData() {
    const response = await fetch(`${API_BASE_URL}/api/current-security-data`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch current security data');
    return response.json();
  },

  async getSecurityData() {
    const response = await fetch(`${API_BASE_URL}/api/security-data`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch security data');
    return response.json();
  },

  async getDepartureData(terminalId: string, threeDaysAgo: string) {
    const response = await fetch(`${API_BASE_URL}/api/departure-data`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId, threeDaysAgo })
    });
    if (!response.ok) throw new Error('Failed to fetch departure data');
    return response.json();
  },

  async getHourlyIntervalSecurityData() {
    const response = await fetch(`${API_BASE_URL}/api/hourly-interval-security-data`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch hourly interval security data');
    return response.json();
  },

  async getHourlyIntervalDepartureData(terminalId: string) {
    const response = await fetch(`${API_BASE_URL}/api/hourly-interval-departure-data`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId })
    });
    if (!response.ok) throw new Error('Failed to fetch hourly interval departure data');
    return response.json();
  },

  async submitFeatureRequest(name: string, email: string, details: string, recaptchaToken: string) {
    const response = await fetch(`${API_BASE_URL}/api/feature-requests`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ name, email, details, recaptchaToken })
    });
    if (!response.ok) throw new Error('Failed to submit feature request');
    return response.json();
  },

  async getAcknowledgedFeatureRequests() {
    const response = await fetch(`${API_BASE_URL}/api/acknowledged-feature-requests`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch acknowledged feature requests');
    return response.json();
  },

  async getActiveAnnouncements() {
    const response = await fetch(`${API_BASE_URL}/api/active-announcements`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch active announcements');
    return response.json();
  },

  async getRangeSecurityData(start: string, end: string) {
    const response = await fetch(`${API_BASE_URL}/api/range-security-data`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ start, end })
    });
    if (!response.ok) throw new Error('Failed to fetch range security data');
    return response.json();
  },

  async getIrishTime(): Promise<{ time: string }> {
    const response = await fetch(`${API_BASE_URL}/api/irish-time`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch Irish time');
    return response.json();
  },

  async getLastDepartures(): Promise<Record<string, string>> {
    const response = await fetch(`${API_BASE_URL}/api/last-departures`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch last departures');
    return response.json();
  },

  async getFacilityHours() {
    const response = await fetch(`${API_BASE_URL}/api/facility-hours`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch facility hours');
    return response.json();
  },

  async simulateGammaMethodB(terminalId: number) {
    const response = await fetch(`${API_BASE_URL}/api/simulate/gamma/method-b`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId })
    });
    if (!response.ok) throw new Error('Failed to run simulation');
    return response.json();
  },

  async simulateTangoMethodA(terminalId: number, hourTimestamp?: string) {
    const response = await fetch(`${API_BASE_URL}/api/simulate/tango/method-a`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId, hourTimestamp })
    });
    if (!response.ok) throw new Error('Failed to run simulation');
    return response.json();
  },

  async simulateGammaMethodA(terminalId: number, start: string, end: string, selectedTimeframe: number) {
    const response = await fetch(`${API_BASE_URL}/api/simulate/gamma/method-a`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId, start, end, selectedTimeframe })
    });
    if (!response.ok) throw new Error('Failed to run simulation');
    return response.json();
  },

  async getRangeDepartureData(terminalId: string, start: string, end: string) {
    const response = await fetch(`${API_BASE_URL}/api/range-departure-data`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId, start, end })
    });
    if (!response.ok) throw new Error('Failed to fetch range departure data');
    return response.json();
  },

  async getRecommendation() {
    const response = await fetch(`${API_BASE_URL}/api/recommendation`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch recommendation');
    return response.json();
  },

  async getProcessedSecurityData(terminalId: number) {
    const response = await fetch(`${API_BASE_URL}/api/processed-security-data?terminalId=${terminalId}`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch processed security data');
    return response.json();
  },

  async getProcessedDepartureData(terminalId: number) {
    const response = await fetch(`${API_BASE_URL}/api/processed-departure-data?terminalId=${terminalId}`, {
      headers: authHeaders()
    });
    if (!response.ok) throw new Error('Failed to fetch processed departure data');
    return response.json();
  },

  async getChartData(terminalId: number, start: string, end: string, granularity: number) {
    const response = await fetch(`${API_BASE_URL}/api/chart-data`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId, start, end, granularity })
    });
    if (!response.ok) throw new Error('Failed to fetch chart data');
    return response.json();
  },

  async getHourlyDetailStats(terminalId: number, currentTimestamp: string, prevTimestamp?: string, nextTimestamp?: string) {
    const response = await fetch(`${API_BASE_URL}/api/hourly-detail-stats`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId, currentTimestamp, prevTimestamp, nextTimestamp })
    });
    if (!response.ok) throw new Error('Failed to fetch hourly detail stats');
    return response.json();
  },

  async getProjectedHourlyStats(terminalId: number, numSims: number = 500) {
    const response = await fetch(`${API_BASE_URL}/api/projected-hourly-stats`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ terminalId, numSims })
    });
    if (!response.ok) throw new Error('Failed to fetch projected hourly stats');
    return response.json();
  },

  async verifyBounceToken(recaptchaToken: string, fingerprint: string) {
    const response = await fetch(`${API_BASE_URL}/api/bouncetoken/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recaptchaToken, fingerprint })
    });
    return response.json();
  },

  async checkboxVerifyBounceToken(recaptchaToken: string, fingerprint: string) {
    const response = await fetch(`${API_BASE_URL}/api/bouncetoken/checkbox-verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recaptchaToken, fingerprint })
    });
    return response.json();
  }
};