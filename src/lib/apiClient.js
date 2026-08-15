const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

const getToken = () => localStorage.getItem('access_token');
const getRefreshToken = () => localStorage.getItem('refresh_token');
const setTokens = ({ access_token, refresh_token }) => {
  localStorage.setItem('access_token', access_token);
  if (refresh_token) localStorage.setItem('refresh_token', refresh_token);
};
export const clearTokens = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
};

let refreshPromise = null;

const tryRefresh = async () => {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const rt = getRefreshToken();
    if (!rt) throw new Error('No refresh token');
    const res = await fetch(`${API_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!res.ok) { clearTokens(); throw new Error('Session expired'); }
    const json = await res.json();
    setTokens(json);
    return json.access_token;
  })();
  // Sengaja tidak memakai .finally(): promise turunan yang dihasilkannya tidak
  // dipegang siapa pun, jadi refresh yang gagal memunculkan unhandled rejection
  // di samping error yang sudah ditangani pemanggil. Dua handler pada .then()
  // membereskan keduanya.
  const done = () => { refreshPromise = null; };
  refreshPromise.then(done, done);
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

  if (res.status === 401 && getRefreshToken()) {
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
  patch:  (path, body, opts)  => request('PATCH',  path, body, opts),
  delete: (path, opts)        => request('DELETE', path, undefined, opts),
  setTokens,
  clearTokens,
  getToken,
};

export default apiClient;

export const publicFetch = async (path, opts = {}) => {
  const url = `${API_URL}${path}`;
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Request gagal (${res.status})`);
  return json.data !== undefined ? json.data : json;
};
