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
	ipLimiter   *attemptLimiter
	userLimiter *attemptLimiter
}

func NewAuthHandler(db *pgxpool.Pool, cfg *config.Config) *AuthHandler {
	return &AuthHandler{
		db:          db,
		cfg:         cfg,
		ipLimiter:   newAttemptLimiter(10, 5*time.Minute),
		userLimiter: newAttemptLimiter(10, 15*time.Minute),
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
	if !h.ipLimiter.allow(clientIP(r)) || !h.userLimiter.allow(strings.ToLower(req.Username)) {
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
	h.ipLimiter.reset(clientIP(r))
	h.userLimiter.reset(strings.ToLower(req.Username))

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
	jsonOK(w, pair)
}

func (h *AuthHandler) Refresh(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(io.LimitReader(r.Body, maxAuthBodyBytes)).Decode(&body); err != nil || body.RefreshToken == "" {
		jsonError(w, "refresh_token wajib diisi", http.StatusBadRequest)
		return
	}
	claims, err := auth.ValidateRefreshToken(body.RefreshToken, h.cfg.JWTRefreshSecret)
	if err != nil {
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
	jsonOK(w, pair)
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
	// Coba santri: login by nomor_induk_qiroati atau nama_panggilan
	var row userRow
	err = h.db.QueryRow(ctx, `
		SELECT id, 'santri', COALESCE(password,'')
		FROM santri
		WHERE (nomor_induk_qiroati = $1 OR LOWER(nama_panggilan) = LOWER($1))
		  AND status = 'Aktif'
		LIMIT 1
	`, username).Scan(&row.id, &row.role, &row.hash)
	if err == nil {
		return row.id, row.role, row.hash, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", "", "", err
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
