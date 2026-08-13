package handler

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestSPA(t *testing.T) *SPA {
	t.Helper()
	root := t.TempDir()
	write := func(rel, body string) {
		full := filepath.Join(root, rel)
		if err := os.MkdirAll(filepath.Dir(full), 0o755); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(full, []byte(body), 0o644); err != nil {
			t.Fatalf("write %s: %v", rel, err)
		}
	}
	write("index.html", "<html>app</html>")
	write("assets/index-abc123.js", "console.log(1)")
	write("favicon.ico", "icon")

	// A secret alongside the served directory — the target of a traversal.
	if err := os.WriteFile(filepath.Join(filepath.Dir(root), "secret.txt"), []byte("rahasia"), 0o644); err != nil {
		t.Fatalf("write secret: %v", err)
	}

	spa := NewSPA(root)
	if spa == nil {
		t.Fatal("NewSPA returned nil for a directory containing index.html")
	}
	return spa
}

func get(t *testing.T, spa *SPA, target string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	spa.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, target, nil))
	return rec
}

func TestSPA_ServesRealFiles(t *testing.T) {
	spa := newTestSPA(t)

	rec := get(t, spa, "/assets/index-abc123.js")
	if rec.Code != http.StatusOK {
		t.Fatalf("asset: got %d, want 200", rec.Code)
	}
	// Vite fingerprints asset names, so caching them hard is safe — and required
	// for the app not to refetch the whole bundle on every navigation.
	if cc := rec.Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("asset Cache-Control = %q, want immutable", cc)
	}
}

func TestSPA_FallsBackToIndexForClientRoutes(t *testing.T) {
	spa := newTestSPA(t)

	for _, path := range []string{"/", "/dashboard", "/santri/123/detail"} {
		rec := get(t, spa, path)
		if rec.Code != http.StatusOK {
			t.Errorf("%s: got %d, want 200", path, rec.Code)
		}
		if body := rec.Body.String(); !strings.Contains(body, "app") {
			t.Errorf("%s: want index.html, got %q", path, body)
		}
		// index.html names the current asset hashes; caching it would pin the app
		// to a stale build after every deploy.
		if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
			t.Errorf("%s: Cache-Control = %q, want no-cache", path, cc)
		}
	}
}

// TestSPA_APIPathsNeverGetHTML is the one that keeps debugging sane: an unknown
// /api route must answer JSON. Handing back the HTML shell makes the frontend
// fail with a JSON parse error that points nowhere near the real cause.
func TestSPA_APIPathsNeverGetHTML(t *testing.T) {
	spa := newTestSPA(t)

	for _, path := range []string{"/api/tidak-ada", "/api/santri/999", "/files/avatars/x.webp"} {
		rec := get(t, spa, path)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s: got %d, want 404", path, rec.Code)
		}
		if body := rec.Body.String(); strings.Contains(body, "<html") {
			t.Errorf("%s: returned HTML instead of JSON: %q", path, body)
		}
	}
}

// TestSPA_RejectsTraversal covers the reason resolve() checks the joined path
// stays under root: without it, a crafted path reads any file the process can.
func TestSPA_RejectsTraversal(t *testing.T) {
	spa := newTestSPA(t)

	for _, path := range []string{
		"/../secret.txt",
		"/../../secret.txt",
		"/assets/../../secret.txt",
		"/%2e%2e/secret.txt",
	} {
		rec := get(t, spa, path)
		if body := rec.Body.String(); strings.Contains(body, "rahasia") {
			t.Errorf("%s: leaked file outside the served directory", path)
		}
		// Anything that is not a real file inside root falls back to the SPA shell,
		// which is the safe outcome.
		if rec.Code != http.StatusOK && rec.Code != http.StatusNotFound {
			t.Errorf("%s: unexpected status %d", path, rec.Code)
		}
	}
}

// TestNewSPA_NilWithoutIndex pins the development path: with no build output the
// server must run API-only rather than failing to start.
func TestNewSPA_NilWithoutIndex(t *testing.T) {
	if spa := NewSPA(t.TempDir()); spa != nil {
		t.Error("NewSPA should return nil when index.html is absent")
	}
	if spa := NewSPA("/direktori/yang/tidak/ada"); spa != nil {
		t.Error("NewSPA should return nil for a missing directory")
	}
}
