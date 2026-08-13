import apiClient from '@/lib/apiClient';

export const LOGIN_SECURITY_CONSENT_KEY = 'lpq_login_security_notice_v1';

import { API_URL } from '@/lib/apiBase';

export const fetchLoginLogs = async ({ page = 0, pageSize = 15, searchTerm = '' } = {}) => {
  const params = new URLSearchParams({ page, limit: pageSize });
  if (searchTerm) params.set('search', searchTerm);
  return apiClient.get(`/api/login-logs?${params}`);
};

export const deleteLoginLog = async (id) => {
  await apiClient.delete(`/api/login-logs/${id}`);
};

export const recordLoginAttempt = async ({ username, status, device }) => {
  if (!username) return false;
  try {
    const headers = { 'Content-Type': 'application/json' };
    const token = apiClient.getToken();
    if (status === 'success' && token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${API_URL}/api/auth/login-attempt`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        username_attempt: String(username).trim().slice(0, 160),
        status,
        device,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
};
