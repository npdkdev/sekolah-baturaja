// Base URL for the Go backend.
//
// `??` rather than `||` on purpose: an explicitly empty VITE_API_URL means
// "same origin" — the setup where nginx serves the built frontend and proxies
// /api and /files to the API container. That is the preferred deployment,
// because same-origin means no CORS surface at all and the refresh cookie is a
// plain first-party cookie.
//
// When the variable is not set at all we fall back to the local dev backend,
// which keeps `vite dev` against a separately-run API working.
export const API_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:8080').replace(/\/+$/, '');
