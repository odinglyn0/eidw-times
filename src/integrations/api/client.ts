const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export const apiClient = {
  async getCurrentSecurityData() {
    const response = await fetch(`${API_BASE_URL}/api/current-security-data`);
    if (!response.ok) throw new Error('Failed to fetch current security data');
    return response.json();
  },

  async getSecurityData() {
    const response = await fetch(`${API_BASE_URL}/api/security-data`);
    if (!response.ok) throw new Error('Failed to fetch security data');
    return response.json();
  },

  async getDepartureData(terminalId: string, threeDaysAgo: string) {
    const response = await fetch(`${API_BASE_URL}/api/departure-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, threeDaysAgo })
    });
    if (!response.ok) throw new Error('Failed to fetch departure data');
    return response.json();
  },

  async getHourlyIntervalSecurityData() {
    const response = await fetch(`${API_BASE_URL}/api/hourly-interval-security-data`);
    if (!response.ok) throw new Error('Failed to fetch hourly interval security data');
    return response.json();
  },

  async getHourlyIntervalDepartureData(terminalId: string) {
    const response = await fetch(`${API_BASE_URL}/api/hourly-interval-departure-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId })
    });
    if (!response.ok) throw new Error('Failed to fetch hourly interval departure data');
    return response.json();
  },

  async submitFeatureRequest(name: string, email: string, details: string, recaptchaToken: string) {
    const response = await fetch(`${API_BASE_URL}/api/feature-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, details, recaptchaToken })
    });
    if (!response.ok) throw new Error('Failed to submit feature request');
    return response.json();
  },

  async getAcknowledgedFeatureRequests() {
    const response = await fetch(`${API_BASE_URL}/api/acknowledged-feature-requests`);
    if (!response.ok) throw new Error('Failed to fetch acknowledged feature requests');
    return response.json();
  },

  async getActiveAnnouncements() {
    const response = await fetch(`${API_BASE_URL}/api/active-announcements`);
    if (!response.ok) throw new Error('Failed to fetch active announcements');
    return response.json();
  },

  async getRangeSecurityData(start: string, end: string) {
    const response = await fetch(`${API_BASE_URL}/api/range-security-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start, end })
    });
    if (!response.ok) throw new Error('Failed to fetch range security data');
    return response.json();
  },

  async getIrishTime(): Promise<{ time: string }> {
    const response = await fetch(`${API_BASE_URL}/api/irish-time`);
    if (!response.ok) throw new Error('Failed to fetch Irish time');
    return response.json();
  },

  async getLastDepartures(): Promise<Record<string, string>> {
    const response = await fetch(`${API_BASE_URL}/api/last-departures`);
    if (!response.ok) throw new Error('Failed to fetch last departures');
    return response.json();
  },

  async getFacilityHours() {
    const response = await fetch(`${API_BASE_URL}/api/facility-hours`);
    if (!response.ok) throw new Error('Failed to fetch facility hours');
    return response.json();
  },

  async simulateGammaMethodB(terminalId: number, numSims: number = 15) {
    const response = await fetch(`${API_BASE_URL}/api/simulate/gamma/method-b`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, numSims })
    });
    if (!response.ok) throw new Error('Failed to run simulation');
    return response.json();
  },

  async simulateTangoMethodA(terminalId: number, hourTimestamp?: string, numSims: number = 200) {
    const response = await fetch(`${API_BASE_URL}/api/simulate/tango/method-a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, hourTimestamp, numSims })
    });
    if (!response.ok) throw new Error('Failed to run simulation');
    return response.json();
  },

  async simulateGammaMethodA(terminalId: number, start: string, end: string, selectedTimeframe: number, numSims: number = 200) {
    const response = await fetch(`${API_BASE_URL}/api/simulate/gamma/method-a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, start, end, selectedTimeframe, numSims })
    });
    if (!response.ok) throw new Error('Failed to run simulation');
    return response.json();
  },

  async getRangeDepartureData(terminalId: string, start: string, end: string) {
    const response = await fetch(`${API_BASE_URL}/api/range-departure-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ terminalId, start, end })
    });
    if (!response.ok) throw new Error('Failed to fetch range departure data');
    return response.json();
  }
};