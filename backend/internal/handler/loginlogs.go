package handler

import (
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/auth"
	"lpq-backend/internal/config"
	"lpq-backend/internal/middleware"
)

// LoginLogsHandler serves the admin login activity panel plus the public
// login-attempt recorder.
//
// Ported from the Supabase `public.record_login_attempt` RPC
// (db/migrations/20260716000300_login_activity_logs.sql). Same privacy
// stance as the RPC: no passwords, no tokens, no raw user-agent. The
// `user_agent` column exists on the table but is deliberately left NULL —
// the migration comment states the function records attempts "without
// accepting passwords, tokens, or raw user-agent data".
//
// cfg is needed because RecordAttempt is mounted OUTSIDE the RequireAuth
// group (a failed login has no token yet), so it validates an optional
// Bearer token itself instead of reading it from the auth middleware.
type LoginLogsHandler struct {
	db      *pgxpool.Pool
	cfg     *config.Config
	limiter *attemptLimiter
}

func NewLoginLogsHandler(db *pgxpool.Pool, cfg *config.Config) *LoginLogsHandler {
	return &LoginLogsHandler{
		db:      db,
		cfg:     cfg,
		limiter: newAttemptLimiter(20, 5*time.Minute),
	}
}

// Routes returns the admin-only endpoints. They are mounted inside the
// RequireAuth group. RecordAttempt is registered separately in main.go as a
// public route — see the comment on that method.
func (h *LoginLogsHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.List)
	r.Delete("/{id}", h.Delete)
	return r
}

// login_logs has no deleted_at column (verified against
// 20260716000300_login_activity_logs.sql lines 4-18), so reads need no
// soft-delete filter and Delete is a hard DELETE — matching the
// "login_logs_admin_delete" policy in the same migration.
const loginLogColumns = `id, user_id, role, username_attempt, status,
	       ip_address, city, country, device, user_agent, created_at`

// GET /api/login-logs?page=&limit=&search= (admin only)
//
// The admin panel (src/components/dashboard/admin/LoginLogs.jsx) appends pages
// client-side and decides "hasMore" from the returned array length, so the
// response is a plain array under {"data": ...} — it does not read
// X-Total-Count. page is 0-based, which is what paginate() expects.
func (h *LoginLogsHandler) List(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	limit, offset := paginate(r)

	query := "SELECT " + loginLogColumns + " FROM login_logs"
	args := []any{}

	// The search box placeholder is "Cari username, IP, atau peran..." so the
	// filter spans username_attempt, ip_address and role.
	if search := strings.TrimSpace(r.URL.Query().Get("search")); search != "" {
		args = append(args, "%"+search+"%")
		query += fmt.Sprintf(` WHERE (username_attempt ILIKE $%[1]d
			   OR ip_address ILIKE $%[1]d
			   OR role ILIKE $%[1]d)`, len(args))
	}

	args = append(args, limit, offset)
	query += fmt.Sprintf(" ORDER BY created_at DESC LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil log login", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca log login", http.StatusInternalServerError)
		return
	}
	jsonData(w, items)
}

// DELETE /api/login-logs/{id} (admin only)
func (h *LoginLogsHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	ct, err := h.db.Exec(r.Context(), `DELETE FROM login_logs WHERE id = $1`, id)
	if err != nil {
		jsonError(w, "gagal menghapus log login", http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		jsonError(w, "log tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonData(w, map[string]any{"id": id, "deleted": true})
}

// allowed values for login_logs.status — constraint login_logs_status_check
// check (status in ('success', 'failed')).
var loginStatusAllowed = map[string]bool{"success": true, "failed": true}

// allowed values for login_logs.role — constraint login_logs_role_check
// check (role is null or role in ('admin', 'guru', 'santri', 'pentashih')).
var loginRoleAllowed = map[string]bool{
	"admin": true, "guru": true, "santri": true, "pentashih": true,
}

// device has no CHECK constraint on the table, but the original RPC narrowed it
// to Desktop/Tablet/Mobile and fell back to 'Unknown'. Kept so existing rows and
// new rows stay comparable.
var loginDeviceAllowed = map[string]bool{
	"Desktop": true, "Tablet": true, "Mobile": true,
}

// RecordAttempt POST /api/auth/login-attempt (PUBLIC — no auth required)
//
// Must stay outside the RequireAuth group: a FAILED login has no token yet, and
// src/lib/loginSecurityAdapters.js only attaches Authorization when
// status === 'success'. When a valid Bearer token IS present the user id and
// role are taken from it — never from the request body.
//
// Body: {username_attempt, status, device}
func (h *LoginLogsHandler) RecordAttempt(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UsernameAttempt string `json:"username_attempt"`
		Status          string `json:"status"`
		Device          string `json:"device"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10)).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	username := strings.TrimSpace(body.UsernameAttempt)
	if username == "" {
		jsonError(w, "username wajib diisi", http.StatusBadRequest)
		return
	}
	if len(username) > 160 {
		username = username[:160]
	}
	if !loginStatusAllowed[body.Status] {
		jsonError(w, "status login tidak valid", http.StatusBadRequest)
		return
	}

	device := "Unknown"
	if loginDeviceAllowed[body.Device] {
		device = body.Device
	}

	ip := clientIP(r)

	// The Supabase RPC rate-limited this at 20 hits / 300s via
	// consume_auth_rate_limit. This endpoint is unauthenticated, so keep an
	// equivalent guard here. In-memory and therefore per-process — good enough
	// for a single-instance deployment; move to Postgres or Redis if the backend
	// is ever scaled horizontally.
	if !h.limiter.allow(ip) {
		jsonError(w, "terlalu banyak percobaan, coba lagi nanti", http.StatusTooManyRequests)
		return
	}

	// Identity strictly from the JWT. No middleware on this route, so parse the
	// optional header directly.
	var userID *string
	var role *string
	if claimUserID, claimRole, ok := h.optionalClaims(r); ok {
		if body.Status == "success" && claimUserID != "" {
			id := claimUserID
			userID = &id
		}
		if loginRoleAllowed[claimRole] {
			rl := claimRole
			role = &rl
		}
	}

	var ipArg *string
	if ip != "" {
		ipArg = &ip
	}

	// city/country stay NULL: no geo-IP lookup exists in this backend, and the
	// UI already falls back to "Tidak tersedia".
	if _, err := h.db.Exec(r.Context(), `
		INSERT INTO login_logs (user_id, role, username_attempt, status, ip_address, device)
		VALUES ($1, $2, $3, $4, $5, $6)
	`, userID, role, username, body.Status, ipArg, device); err != nil {
		jsonError(w, "gagal mencatat aktivitas login", http.StatusInternalServerError)
		return
	}

	jsonCreated(w, map[string]any{"recorded": true})
}

// optionalClaims validates the Authorization header when present. A missing or
// invalid token is not an error here — an unauthenticated failed-login attempt
// still has to be recorded.
func (h *LoginLogsHandler) optionalClaims(r *http.Request) (userID, role string, ok bool) {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return "", "", false
	}
	claims, err := auth.ValidateAccessToken(strings.TrimPrefix(header, "Bearer "), h.cfg.JWTSecret)
	if err != nil {
		return "", "", false
	}
	return claims.UserID, claims.Role, true
}

// clientIP returns the host portion of RemoteAddr. chimw.RealIP has already
// rewritten RemoteAddr from X-Forwarded-For / X-Real-IP by the time this runs.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return strings.TrimSpace(r.RemoteAddr)
	}
	return host
}

// attemptLimiter is a fixed-window counter keyed by IP.
type attemptLimiter struct {
	mu     sync.Mutex
	hits   map[string]*attemptWindow
	max    int
	window time.Duration
	lastGC time.Time
}

type attemptWindow struct {
	count int
	start time.Time
}

func newAttemptLimiter(max int, window time.Duration) *attemptLimiter {
	return &attemptLimiter{
		hits:   map[string]*attemptWindow{},
		max:    max,
		window: window,
		lastGC: time.Now(),
	}
}

func (l *attemptLimiter) allow(key string) bool {
	if key == "" {
		key = "unknown"
	}
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	// Drop expired windows occasionally so the map cannot grow without bound.
	if now.Sub(l.lastGC) > l.window {
		for k, v := range l.hits {
			if now.Sub(v.start) > l.window {
				delete(l.hits, k)
			}
		}
		l.lastGC = now
	}

	w, ok := l.hits[key]
	if !ok || now.Sub(w.start) > l.window {
		l.hits[key] = &attemptWindow{count: 1, start: now}
		return true
	}
	if w.count >= l.max {
		return false
	}
	w.count++
	return true
}
