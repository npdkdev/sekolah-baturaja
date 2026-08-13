const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// The access token lives in a module variable, never in localStorage.
//
// Storing it (and the 30-day refresh token) in localStorage meant any XSS could
// read a long-lived credential and keep the account indefinitely. The refresh
// token is now an httpOnly cookie the browser holds and script cannot read; the
// access token is short-lived and disappears when the tab closes.
let accessToken = null;

const getToken = () => accessToken;
const setTokens = ({ access_token }) => { accessToken = access_token || null; };
export const clearTokens = () => { accessToken = null; };

// Auth calls must carry the refresh cookie, so they need credentials.
const authFetch = (path, opts = {}) =>
  fetch(`${API_URL}${path}`, { credentials: 'include', ...opts });

export const logout = async () => {
  try {
    await authFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    // Network failure still clears the local session; the cookie expires on its own.
  }
  clearTokens();
};

let refreshPromise = null;

// restoreSession exchanges the refresh cookie for an access token. Called on app
// boot — this is what makes a session survive a reload now that nothing is
// persisted in localStorage. Returns null when there is no valid session.
export const restoreSession = async () => {
  try {
    return await tryRefresh();
  } catch {
    return null;
  }
};

const tryRefresh = async () => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const res = await authFetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) { clearTokens(); throw new Error('Session expired'); }
    const json = await res.json();
    setTokens(json);
    return json.access_token;
  })();
  refreshPromise.finally(() => { refreshPromise = null; });
  return refreshPromise;
};

const request = async (method, path, body, opts = {}) => {
  const url = `${API_URL}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const fetchOpts = { method, headers, ...opts };
  if (body !== undefined) fetchOpts.body = JSON.stringify(body);

  let res = await fetch(url, fetchOpts);

  // A 401 is now also the normal path on first load, when no access token has
  // been fetched yet but the refresh cookie is still valid.
  if (res.status === 401) {
    try {
      const newToken = await tryRefresh();
      headers['Authorization'] = `Bearer ${newToken}`;
      res = await fetch(url, { ...fetchOpts, headers });
    } catch {
      clearTokens();
      window.dispatchEvent(new Event('auth:logout'));
      throw new Error('Session expired. Silakan login ulang.');
    }
  }

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request gagal (${res.status})`);
  const data = json.data !== undefined ? json.data : json;
  if (opts.withMeta) {
    const total = Number(res.headers.get('X-Total-Count'));
    return { data, total: Number.isFinite(total) ? total : (Array.isArray(data) ? data.length : 0) };
  }
  return data;
};

const apiClient = {
  get:    (path, opts)        => request('GET',    path, undefined, opts),
  post:   (path, body, opts)  => request('POST',   path, body, opts),
  put:    (path, body, opts)  => request('PUT',    path, body, opts),
  delete: (path, opts)        => request('DELETE', path, undefined, opts),
  setTokens,
  clearTokens,
  getToken,
  authFetch,
};

export default apiClient;

export const publicFetch = async (path, opts = {}) => {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request gagal (${res.status})`);
  return json.data !== undefined ? json.data : json;
};
