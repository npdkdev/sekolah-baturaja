package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"lpq-backend/internal/auth"
)

const testSecret = "secret-uji-yang-panjangnya-lebih-dari-32-karakter"

func issue(t *testing.T, role string, ttl time.Duration) string {
	t.Helper()
	pair, err := auth.IssueTokenPair("user-1", role, testSecret, testSecret+"-refresh", ttl, time.Hour)
	if err != nil {
		t.Fatalf("issue token: %v", err)
	}
	return pair.AccessToken
}

// probe records what the wrapped handler saw in its context.
func probe() (http.Handler, *string, *string) {
	gotUser, gotRole := new(string), new(string)
	h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		*gotUser = UserIDFromCtx(r.Context())
		*gotRole = RoleFromCtx(r.Context())
		w.WriteHeader(http.StatusOK)
	})
	return h, gotUser, gotRole
}

// TestOptionalAuth_NeverTrustsBadTokens is the load-bearing property: an
// invalid, expired, wrong-secret or refresh-type token must leave the context
// empty so that role checks downstream refuse the request, exactly as if no
// Authorization header had been sent.
func TestOptionalAuth_NeverTrustsBadTokens(t *testing.T) {
	refreshTok, err := auth.IssueTokenPair("user-1", "admin", testSecret, testSecret+"-refresh", time.Hour, time.Hour)
	if err != nil {
		t.Fatalf("issue: %v", err)
	}

	tests := []struct {
		name   string
		header string
	}{
		{"no header", ""},
		{"not a bearer", "Basic YWRtaW46YWRtaW4="},
		{"garbage token", "Bearer not-a-jwt"},
		{"signed with another secret", "Bearer " + func() string {
			p, _ := auth.IssueTokenPair("user-1", "admin", "kunci-penyerang-yang-panjang-sekali-32", "x-refresh-secret-panjang-sekali", time.Hour, time.Hour)
			return p.AccessToken
		}()},
		{"expired", "Bearer " + issue(t, "admin", -time.Minute)},
		{"refresh token used as access", "Bearer " + refreshTok.RefreshToken},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			h, gotUser, gotRole := probe()
			req := httptest.NewRequest(http.MethodGet, "/api/content/news", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			rec := httptest.NewRecorder()

			OptionalAuth(testSecret)(h).ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Errorf("public read should still pass through, got %d", rec.Code)
			}
			if *gotUser != "" || *gotRole != "" {
				t.Errorf("context must stay empty, got user=%q role=%q", *gotUser, *gotRole)
			}
		})
	}
}

func TestOptionalAuth_PopulatesValidToken(t *testing.T) {
	h, gotUser, gotRole := probe()
	req := httptest.NewRequest(http.MethodPut, "/api/content/news/1", nil)
	req.Header.Set("Authorization", "Bearer "+issue(t, "admin", time.Hour))
	rec := httptest.NewRecorder()

	OptionalAuth(testSecret)(h).ServeHTTP(rec, req)

	if *gotUser != "user-1" || *gotRole != "admin" {
		t.Errorf("valid token not propagated: user=%q role=%q", *gotUser, *gotRole)
	}
}

// TestRequireRole pins that an empty role — the state OptionalAuth leaves
// behind for anonymous callers — is never accepted.
func TestRequireRole(t *testing.T) {
	for _, tt := range []struct {
		name       string
		header     string
		wantStatus int
	}{
		{"anonymous", "", http.StatusForbidden},
		{"wrong role", "Bearer " + issue(t, "santri", time.Hour), http.StatusForbidden},
		{"allowed role", "Bearer " + issue(t, "admin", time.Hour), http.StatusOK},
	} {
		t.Run(tt.name, func(t *testing.T) {
			h, _, _ := probe()
			req := httptest.NewRequest(http.MethodPost, "/api/attendance/calendar", nil)
			if tt.header != "" {
				req.Header.Set("Authorization", tt.header)
			}
			rec := httptest.NewRecorder()

			OptionalAuth(testSecret)(RequireRole("admin")(h)).ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Errorf("got %d, want %d", rec.Code, tt.wantStatus)
			}
		})
	}
}

func TestIsStaff(t *testing.T) {
	for _, role := range StaffRoles {
		if !IsStaff(role) {
			t.Errorf("%q should be staff", role)
		}
	}
	for _, role := range []string{"santri", "", "Admin", "wali"} {
		if IsStaff(role) {
			t.Errorf("%q should not be staff", role)
		}
	}
}
