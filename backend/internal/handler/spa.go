package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"
)

// SPA serves the built frontend straight from the Go binary's container.
//
// No reverse proxy in front: the browser talks to one origin for both the app
// and the API. That removes CORS from the picture entirely, makes the refresh
// cookie a plain first-party cookie, and — the part that matters most —
// keeps r.RemoteAddr the real client address. With a proxy in front, the login
// rate limiter would have to trust X-Forwarded-For, which is exactly the header
// an attacker forges to get a fresh bucket per request.
type SPA struct {
	root  string
	index []byte
}

// NewSPA returns nil when the directory holds no index.html — the API then runs
// without a frontend, which is what happens in development where Vite serves
// the app itself.
func NewSPA(root string) *SPA {
	index, err := os.ReadFile(filepath.Join(root, "index.html"))
	if err != nil {
		return nil
	}
	return &SPA{root: root, index: index}
}

// ServeHTTP resolves a real file when one exists and falls back to index.html
// so client-side routes like /dashboard survive a page reload.
//
// Registered as chi's NotFound handler, so it only ever sees paths no route
// matched. API prefixes are excluded explicitly: an unknown /api path must
// answer 404 as JSON, not hand back the HTML shell — a frontend that receives
// HTML where it expected JSON fails in a way that is tedious to debug.
func (s *SPA) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if IsAPIPath(r.URL.Path) {
		jsonError(w, "endpoint tidak ditemukan", http.StatusNotFound)
		return
	}

	if name, ok := s.resolve(r.URL.Path); ok {
		// Vite fingerprints asset filenames, so those are safe to cache hard.
		// index.html must not be: it is the file that names the current assets.
		if strings.HasPrefix(r.URL.Path, "/assets/") {
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		}
		http.ServeFile(w, r, name)
		return
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.Write(s.index)
}

// resolve maps a URL path to a file inside root, or reports that none exists.
//
// The join is guarded: path.Clean on a rooted path plus a check that the result
// stays under root means "/../../etc/passwd" cannot escape the served
// directory, however the client encodes it.
func (s *SPA) resolve(urlPath string) (string, bool) {
	clean := filepath.Clean("/" + strings.TrimPrefix(urlPath, "/"))
	name := filepath.Join(s.root, clean)
	if !strings.HasPrefix(name, filepath.Clean(s.root)+string(os.PathSeparator)) {
		return "", false
	}
	info, err := os.Stat(name)
	if err != nil || info.IsDir() {
		return "", false
	}
	return name, true
}

// IsAPIPath reports whether a path belongs to the backend rather than the app.
// Used by the SPA fallback and by the security-header middleware, which applies
// a far stricter CSP to API and upload responses than to the app itself.
func IsAPIPath(p string) bool {
	return strings.HasPrefix(p, "/api/") || strings.HasPrefix(p, "/files/")
}
