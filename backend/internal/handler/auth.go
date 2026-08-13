package handler

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"

	"lpq-backend/internal/auth"
	"lpq-backend/internal/config"
	"lpq-backend/internal/middleware"
)

type AuthHandler struct {
	db  *pgxpool.Pool
	cfg *config.Config
	// ipLimiter throttles by source IP, userLimiter by the username being tried.
	// Both are needed: the IP window alone lets a botnet spread a guessing run
	// across many addresses against one account, and the username window alone
	// lets one host walk the whole roster one guess per account.
	ipLimiter   *rateLimiter
	userLimiter *rateLimiter
}

func NewAuthHandler(db *pgxpool.Pool, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		db:          db,
		cfg:         cfg,
		ipLimiter:   newRateLimiter(db, "login_ip", 10, 5*time.Minute),
		userLimiter: newRateLimiter(db, "login_user", 10, 15*time.Minute),
	}
}

type loginRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(io.LimitReader(r.Body, maxAuthBodyBytes)).Decode(&req); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Password = strings.TrimSpace(req.Password)
	if req.Username == "" || req.Password == "" {
		jsonError(w, "username dan password wajib diisi", http.StatusBadRequest)
		return
	}

	// Brute-force guard. Checked before any DB work so a flood cannot be turned
	// into a bcrypt-cost amplification attack against the server itself.
	if !h.ipLimiter.allow(r.Context(), clientIP(r)) || !h.userLimiter.allow(r.Context(), strings.ToLower(req.Username)) {
		jsonError(w, "terlalu banyak percobaan login, coba lagi nanti", http.StatusTooManyRequests)
		return
	}

	userID, role, hash, err := h.resolveUser(r.Context(), req.Username)
	if err != nil {
		// Spend comparable time on the unknown-user path so response latency does
		// not reveal which usernames exist.
		auth.CheckPassword(dummyBcryptHash, req.Password)
		jsonError(w, "username atau password salah", http.StatusUnauthorized)
		return
	}

	if err := auth.CheckPassword(hash, req.Password); err != nil {
		// Self-heal for accounts imported from Supabase whose `password` column
		// still holds the plaintext nomor_induk. The ONLY safe trigger is the
		// stored value itself being that plaintext and matching what was typed.
		//
		// The earlier version keyed on `req.Password == req.Username`, which
		// authenticated anyone who typed a santri's nomor_induk twice — the
		// nomor induk is printed on their records and known to staff, so that
		// was a full account takeover that also overwrote the real password.
		if !isLegacyPlaintextMatch(role, hash, req.Password) {
			jsonError(w, "username atau password salah", http.StatusUnauthorized)
			return
		}
		if newHash, err := auth.HashPassword(req.Password); err == nil {
			h.db.Exec(r.Context(), `UPDATE santri SET password = $1 WHERE id = $2`, newHash, userID)
		}
	}

	// A successful login clears the counters so a legitimate user who fumbled
	// their password a few times is not locked out afterwards.
	h.ipLimiter.reset(r.Context(), clientIP(r))
	h.userLimiter.reset(r.Context(), strings.ToLower(req.Username))

	pair, err := auth.IssueTokenPair(
		userID, role,
		h.cfg.JWTSecret, h.cfg.JWTRefreshSecret,
		time.Duration(h.cfg.AccessTokenTTL)*time.Minute,
		time.Duration(h.cfg.RefreshTokenTTL)*24*time.Hour,
	)
	if err != nil {
		jsonError(w, "gagal membuat token", http.StatusInternalServerError)
		return
	}
	h.setRefreshCookie(w, pair.RefreshToken)
	jsonOK(w, accessOnly(pair))
}

// refreshCookieName holds the long-lived credential. It never reaches
// JavaScript.
const refreshCookieName = "lpq_refresh"

// refreshCookiePath scopes the cookie to the auth endpoints, so it is not
// attached to every API call — only where it is actually needed.
const refreshCookiePath = "/api/auth"

// accessOnly strips the refresh token from what goes back in the body.
//
// Both tokens used to be returned as JSON and stored in localStorage, which
// means any XSS could read a 30-day credential and keep the account
// indefinitely. The refresh token now travels only as an httpOnly cookie:
// unreadable from script, so an XSS is limited to the 15-minute access token
// held in memory for as long as the tab is open.
func accessOnly(pair auth.TokenPair) map[string]string {
	return map[string]string{"access_token": pair.AccessToken}
}

func (h *AuthHandler) setRefreshCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    token,
		Path:     refreshCookiePath,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		// Strict: the cookie is never attached to a cross-site request, which is
		// what removes the CSRF surface on /api/auth/refresh. This requires the
		// frontend and the API to be same-site (app.example.id + api.example.id,
		// or any two ports on one host in development).
		SameSite: http.SameSiteStrictMode,
		MaxAge:   h.cfg.RefreshTokenTTL * 24 * 60 * 60,
	})
}

func (h *AuthHandler) clearRefreshCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     refreshCookieName,
		Value:    "",
		Path:     refreshCookiePath,
		HttpOnly: true,
		Secure:   h.cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

// Logout clears the refresh cookie. The access token is not revocable — it is
// stateless and short-lived — so the client drops its in-memory copy and the
// remaining validity window closes on its own.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	h.clearRefreshCookie(w)
	jsonOK(w, map[string]bool{"ok": true})
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	// The refresh token comes from the httpOnly cookie only. Accepting it from
	// the request body as a fallback would defeat the point: script could still
	// hold and replay one.
	cookie, err := r.Cookie(refreshCookieName)
	if err != nil || cookie.Value == "" {
		jsonError(w, "sesi tidak ditemukan", http.StatusUnauthorized)
		return
	}
	claims, err := auth.ValidateRefreshToken(cookie.Value, h.cfg.JWTRefreshSecret)
	if err != nil {
		h.clearRefreshCookie(w)
		jsonError(w, "refresh token tidak valid atau kedaluwarsa", http.StatusUnauthorized)
		return
	}

	// Re-read the account instead of trusting the claims. Refresh tokens live for
	// 30 days, so without this a demoted admin keeps admin access, and a
	// deactivated or deleted account keeps working, until the token finally
	// expires. The role that goes into the new pair is the one in the DB now.
	role, err := h.currentRole(r.Context(), claims.UserID, claims.Role)
	if err != nil {
		jsonError(w, "akun tidak aktif", http.StatusUnauthorized)
		return
	}

	pair, err := auth.IssueTokenPair(
		claims.UserID, role,
		h.cfg.JWTSecret, h.cfg.JWTRefreshSecret,
		time.Duration(h.cfg.AccessTokenTTL)*time.Minute,
		time.Duration(h.cfg.RefreshTokenTTL)*24*time.Hour,
	)
	if err != nil {
		jsonError(w, "gagal membuat token", http.StatusInternalServerError)
		return
	}
	// Rotate: each refresh issues a fresh cookie, so a stolen one has a bounded
	// life rather than lasting the full 30 days.
	h.setRefreshCookie(w, pair.RefreshToken)
	jsonOK(w, accessOnly(pair))
}

// maxAuthBodyBytes caps auth request bodies. These payloads are two short
// strings; anything larger is abuse, and bcrypt only reads the first 72 bytes
// anyway.
const maxAuthBodyBytes = 4 << 10

// dummyBcryptHash is a valid bcrypt digest of a value nobody can supply. It is
// compared against on the unknown-user path purely to burn the same ~cost-12
// CPU time a real comparison would, flattening the timing side channel that
// otherwise turns login into a username oracle.
const dummyBcryptHash = "$2a$12$C6UzMDM.H6dfI/f/IKcEe.NLtEqxYRe5vDNCgQqOWJKuPPtFtdRWy"

// isLegacyPlaintextMatch reports whether `stored` is a pre-migration plaintext
// password equal to what the user typed. Only santri rows were imported with
// plaintext (see docs/migration/auth-spec.md); everything else must go through
// bcrypt. A bcrypt digest is never treated as plaintext, so a santri who has
// already been healed or who set a real password cannot be matched this way.
func isLegacyPlaintextMatch(role, stored, supplied string) bool {
	if role != "santri" || stored == "" || isBcryptHash(stored) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(stored), []byte(supplied)) == 1
}

// isBcryptHash recognises the modular-crypt prefixes bcrypt emits ($2a$, $2b$,
// $2y$). Anything else in the password column is legacy plaintext.
func isBcryptHash(s string) bool {
	return len(s) >= 4 && s[0] == '$' && s[1] == '2' &&
		(s[2] == 'a' || s[2] == 'b' || s[2] == 'y') && s[3] == '$'
}

type userRow struct {
	id   string
	role string
	hash string
}

// resolveUser mencari user di santri (nomor_induk/panggilan) atau guru (email).
// Santri dicek duluan; jika tidak ketemu baru coba guru/admin/pentashih.
func (h *AuthHandler) resolveUser(ctx context.Context, username string) (id, role, hash string, err error) {
	// Santri: nomor_induk_qiroati first. It carries a unique index
	// (santri_nomor_induk_qiroati_unique), so it identifies exactly one account.
	var row userRow
	err = h.db.QueryRow(ctx, `
		SELECT id, 'santri', COALESCE(password,'')
		FROM santri
		WHERE nomor_induk_qiroati = $1 AND status = 'Aktif'
	`, username).Scan(&row.id, &row.role, &row.hash)
	if err == nil {
		return row.id, row.role, row.hash, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", "", "", err
	}

	// Nickname fallback. nama_panggilan has NO unique constraint and nicknames
	// collide constantly in a school, yet this used to be OR-ed into the query
	// above with a bare LIMIT 1 — so which classmate's row came back was
	// whatever Postgres happened to return. Paired with the legacy plaintext
	// passwords that meant a santri who knew a namesake's nomor induk could land
	// in that namesake's account.
	//
	// Resolve only when the nickname is unambiguous among active santri;
	// otherwise refuse and let them use their nomor induk.
	rows, err := h.db.Query(ctx, `
		SELECT id, COALESCE(password,'')
		FROM santri
		WHERE LOWER(nama_panggilan) = LOWER($1) AND status = 'Aktif'
		LIMIT 2
	`, username)
	if err != nil {
		return "", "", "", err
	}
	matches := make([]userRow, 0, 2)
	for rows.Next() {
		var m userRow
		if err := rows.Scan(&m.id, &m.hash); err != nil {
			rows.Close()
			return "", "", "", err
		}
		matches = append(matches, m)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return "", "", "", err
	}
	if len(matches) == 1 {
		return matches[0].id, "santri", matches[0].hash, nil
	}
	if len(matches) > 1 {
		return "", "", "", errors.New("nama panggilan tidak unik")
	}

	// Coba guru/admin/pentashih: login by email
	err = h.db.QueryRow(ctx, `
		SELECT g.id, up.role, COALESCE(g.password,'')
		FROM guru g
		JOIN user_profiles up ON up.id = g.id
		WHERE LOWER(g.email) = LOWER($1)
		  AND g.status = 'active'
		  AND up.status = 'active'
		LIMIT 1
	`, username).Scan(&row.id, &row.role, &row.hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", "", "", errors.New("user tidak ditemukan")
		}
		return "", "", "", err
	}
	return row.id, row.role, row.hash, nil
}

// currentRole re-reads the caller's role from the database and fails if the
// account no longer exists or is no longer active. `claimRole` only decides
// which table to look in; the returned role always comes from the DB.
func (h *AuthHandler) currentRole(ctx context.Context, userID, claimRole string) (string, error) {
	if userID == "" {
		return "", errors.New("user id kosong")
	}
	if claimRole == "santri" {
		var status string
		if err := h.db.QueryRow(ctx,
			`SELECT COALESCE(status,'') FROM santri WHERE id = $1`, userID).Scan(&status); err != nil {
			return "", err
		}
		if status != "Aktif" {
			return "", errors.New("santri tidak aktif")
		}
		return "santri", nil
	}

	var role string
	if err := h.db.QueryRow(ctx, `
		SELECT up.role
		FROM guru g
		JOIN user_profiles up ON up.id = g.id
		WHERE g.id = $1 AND g.status = 'active' AND up.status = 'active'
	`, userID).Scan(&role); err != nil {
		return "", err
	}
	return role, nil
}

// VerifyPassword re-checks the logged-in user's own password. Used as a
// confirmation step before destructive actions like restore.
func (h *AuthHandler) VerifyPassword(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	role := middleware.RoleFromCtx(r.Context())
	if userID == "" {
		jsonError(w, "tidak terautentikasi", http.StatusUnauthorized)
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Password == "" {
		jsonError(w, "password wajib diisi", http.StatusBadRequest)
		return
	}

	table := "guru"
	if role == "santri" {
		table = "santri"
	}
	var hash string
	if err := h.db.QueryRow(r.Context(),
		`SELECT COALESCE(password,'') FROM `+table+` WHERE id = $1`, userID).Scan(&hash); err != nil {
		jsonError(w, "akun tidak ditemukan", http.StatusNotFound)
		return
	}
	if hash == "" || bcrypt.CompareHashAndPassword([]byte(hash), []byte(body.Password)) != nil {
		jsonError(w, "password salah", http.StatusUnauthorized)
		return
	}
	jsonOK(w, map[string]any{"verified": true})
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromCtx(r.Context())
	role := middleware.RoleFromCtx(r.Context())
	if userID == "" {
		jsonError(w, "tidak terautentikasi", http.StatusUnauthorized)
		return
	}

	var displayName, email string
	var err error
	if role == "santri" {
		err = h.db.QueryRow(r.Context(),
			`SELECT COALESCE(nama_lengkap,''), COALESCE(nomor_induk_qiroati,'') FROM santri WHERE id = $1`, userID,
		).Scan(&displayName, &email)
	} else {
		err = h.db.QueryRow(r.Context(),
			`SELECT COALESCE(nama,''), COALESCE(email,'') FROM guru WHERE id = $1`, userID,
		).Scan(&displayName, &email)
	}
	if err != nil {
		jsonError(w, "profil tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{
		"id":           userID,
		"role":         role,
		"display_name": displayName,
		"email":        email,
		"status":       "active",
	})
}

func jsonOK(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

func jsonError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// jsonServerError logs the underlying error and returns only the generic
// message to the caller.
//
// Several handlers used to format the raw error into the response body, which
// handed clients Postgres text: table and column names, constraint names, and
// the offending values from failed inserts. That is a free schema map for an
// attacker and can echo back other people's data in a conflict message.
func jsonServerError(w http.ResponseWriter, msg string, err error) {
	log.Printf("%s: %v", msg, err)
	jsonError(w, msg, http.StatusInternalServerError)
}
