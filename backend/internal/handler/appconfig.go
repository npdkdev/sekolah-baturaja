package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// AppConfigHandler manages feature-config keys stored in website_content
// with is_public = false. These are internal runtime configs consumed by
// the frontend (adultSessionConfig, level_config, gatcha_config, etc.).
type AppConfigHandler struct {
	db *pgxpool.Pool
}

func NewAppConfigHandler(db *pgxpool.Pool) *AppConfigHandler {
	return &AppConfigHandler{db: db}
}

// validConfigKeys is the authoritative list of config keys this handler
// manages. Any key not in this set is rejected on write.
var validConfigKeys = map[string]struct{}{
	"adultSessionConfig":        {},
	"level_config":              {},
	"gatcha_config":             {},
	"quiz_hafalan_config":       {},
	"tv_config":                 {},
	"guru_session_overrides":    {},
	"hafalanVideos":             {},
	"random_name_settings":      {},
	"attendance_session_config": {},
}

func (h *AppConfigHandler) Routes() http.Handler {
	r := chi.NewRouter()

	r.Get("/", h.GetMultipleConfigs)
	r.Get("/{key}", h.GetConfig)
	r.Put("/{key}", h.UpsertConfig)

	return r
}

// GetConfig GET /api/config/:key (authenticated)
// Returns {key, content}
func (h *AppConfigHandler) GetConfig(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "key")
	if key == "" {
		jsonError(w, "key wajib diisi", http.StatusBadRequest)
		return
	}

	var content []byte
	err := h.db.QueryRow(r.Context(), `
		SELECT content FROM website_content WHERE key = $1
	`, key).Scan(&content)
	if err != nil {
		jsonError(w, "konfigurasi tidak ditemukan", http.StatusNotFound)
		return
	}

	var val any
	if err := json.Unmarshal(content, &val); err != nil {
		val = string(content)
	}

	jsonOK(w, map[string]any{"data": map[string]any{
		"key":     key,
		"content": val,
	}})
}

// GetMultipleConfigs GET /api/config (authenticated)
// Query: keys (comma-separated)
// Returns {key: content} map
func (h *AppConfigHandler) GetMultipleConfigs(w http.ResponseWriter, r *http.Request) {
	keysParam := r.URL.Query().Get("keys")
	if keysParam == "" {
		jsonError(w, "keys wajib diisi", http.StatusBadRequest)
		return
	}

	keys := strings.Split(keysParam, ",")
	placeholders := make([]string, len(keys))
	args := make([]any, len(keys))
	for i, k := range keys {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = strings.TrimSpace(k)
	}

	rows, err := h.db.Query(r.Context(),
		fmt.Sprintf(
			"SELECT key, content FROM website_content WHERE key IN (%s)",
			strings.Join(placeholders, ","),
		),
		args...,
	)
	if err != nil {
		jsonError(w, "gagal mengambil konfigurasi", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := map[string]any{}
	for rows.Next() {
		var key string
		var content []byte
		if err := rows.Scan(&key, &content); err != nil {
			jsonError(w, "gagal membaca konfigurasi", http.StatusInternalServerError)
			return
		}
		var val any
		if err := json.Unmarshal(content, &val); err != nil {
			val = string(content)
		}
		result[key] = val
	}

	jsonOK(w, map[string]any{"data": result})
}

// UpsertConfig PUT /api/config/:key (admin only)
// Body: {content}
// Only keys in validConfigKeys are accepted.
func (h *AppConfigHandler) UpsertConfig(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	key := chi.URLParam(r, "key")
	if key == "" {
		jsonError(w, "key wajib diisi", http.StatusBadRequest)
		return
	}
	if _, ok := validConfigKeys[key]; !ok {
		jsonError(w, fmt.Sprintf("key '%s' tidak diizinkan", key), http.StatusBadRequest)
		return
	}

	var body struct {
		Content json.RawMessage `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.Content == nil {
		jsonError(w, "content wajib diisi", http.StatusBadRequest)
		return
	}

	_, err := h.db.Exec(r.Context(), `
		INSERT INTO website_content (key, content, is_public, updated_at)
		VALUES ($1, $2, false, now())
		ON CONFLICT (key) DO UPDATE
		  SET content    = EXCLUDED.content,
		      updated_at = now()
	`, key, body.Content)
	if err != nil {
		jsonServerError(w, "gagal menyimpan konfigurasi", err)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"key": key}})
}

// readBody reads and returns the full request body, allowing callers to
// attempt multiple JSON unmarshal strategies (array vs. object).
func readBody(r *http.Request) ([]byte, error) {
	b, err := io.ReadAll(io.LimitReader(r.Body, 4<<20)) // 4 MB cap
	if err != nil {
		return nil, fmt.Errorf("read body: %w", err)
	}
	// Re-arm the body so downstream reads also work (defensive).
	r.Body = io.NopCloser(bytes.NewReader(b))
	return b, nil
}
