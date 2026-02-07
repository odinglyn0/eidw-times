const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080';

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
  }
};