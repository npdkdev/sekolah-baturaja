package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

type ContentHandler struct {
	db *pgxpool.Pool
	// feedbackLimiter throttles the public contact form. It is the only
	// unauthenticated write endpoint in the API, so without a cap anyone can
	// fill the feedbacks table as fast as they can send requests.
	feedbackLimiter *attemptLimiter
}

func NewContentHandler(db *pgxpool.Pool) *ContentHandler {
	return &ContentHandler{
		db:              db,
		feedbackLimiter: newAttemptLimiter(5, time.Hour),
	}
}

func (h *ContentHandler) Routes() http.Handler {
	r := chi.NewRouter()

	// Website content
	r.Get("/website", h.GetWebsiteContent)
	r.Put("/website/{key}", h.UpsertWebsiteContent)

	// News
	r.Get("/news", h.ListNews)
	r.Get("/news/{slug}", h.GetNews)
	r.Post("/news", h.CreateNews)
	r.Put("/news/{id}", h.UpdateNews)
	r.Delete("/news/{id}", h.DeleteNews)

	// Announcements
	r.Get("/announcements", h.ListAnnouncements)
	r.Post("/announcements", h.CreateAnnouncement)
	r.Put("/announcements/{id}", h.UpdateAnnouncement)
	r.Delete("/announcements/{id}", h.DeleteAnnouncement)

	// Feedback — public, no auth
	r.Post("/feedback", h.SubmitFeedback)

	// Public teacher roster for the "Tim Pengajar" section on /profil.
	r.Get("/teachers", h.ListPublicTeachers)

	return r
}

// ---------------------------------------------------------------------------
// Public teacher roster
// ---------------------------------------------------------------------------

type publicTeacherRow struct {
	ID           string   `json:"id"`
	Nama         string   `json:"nama"`
	Jabatan      *string  `json:"jabatan"`
	FotoURL      *string  `json:"foto_url"`
	Roles        []string `json:"roles"`
	JenisKelamin *string  `json:"jenis_kelamin"`
}

// ListPublicTeachers GET /api/content/teachers (public, no auth)
// Returns only the fields the public profile page renders. Contact details
// (email, no_hp, alamat) and rfid_tag are deliberately not selected — this
// endpoint is unauthenticated.
func (h *ContentHandler) ListPublicTeachers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT id, nama, jabatan, foto_url, roles, jenis_kelamin
		FROM guru
		WHERE status = 'active' AND deleted_at IS NULL
		ORDER BY nama
	`)
	if err != nil {
		jsonError(w, "gagal mengambil data pengajar", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := []publicTeacherRow{}
	for rows.Next() {
		var t publicTeacherRow
		if err := rows.Scan(&t.ID, &t.Nama, &t.Jabatan, &t.FotoURL, &t.Roles, &t.JenisKelamin); err != nil {
			jsonError(w, "gagal membaca data pengajar", http.StatusInternalServerError)
			return
		}
		result = append(result, t)
	}

	jsonOK(w, map[string]any{"data": result})
}

// ---------------------------------------------------------------------------
// Website Content
// ---------------------------------------------------------------------------

// GetWebsiteContent GET /api/content/website
// Query: keys (comma-separated), public_only (bool, default true)
func (h *ContentHandler) GetWebsiteContent(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	keysParam := q.Get("keys")
	publicOnly := true
	if v := q.Get("public_only"); v == "false" {
		publicOnly = false
	}

	base := `SELECT key, content FROM website_content WHERE 1=1`
	args := []any{}
	idx := 1

	if publicOnly {
		base += fmt.Sprintf(" AND is_public = $%d", idx)
		args = append(args, true)
		idx++
	}

	if keysParam != "" {
		keys := strings.Split(keysParam, ",")
		placeholders := make([]string, len(keys))
		for i, k := range keys {
			placeholders[i] = fmt.Sprintf("$%d", idx)
			args = append(args, strings.TrimSpace(k))
			idx++
		}
		base += fmt.Sprintf(" AND key IN (%s)", strings.Join(placeholders, ","))
	}

	rows, err := h.db.Query(r.Context(), base, args...)
	if err != nil {
		jsonError(w, "gagal mengambil konten website", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := map[string]any{}
	for rows.Next() {
		var key string
		var content []byte
		if err := rows.Scan(&key, &content); err != nil {
			jsonError(w, "gagal membaca konten", http.StatusInternalServerError)
			return
		}
		var val any
		if err := json.Unmarshal(content, &val); err != nil {
			// Store as raw string if not valid JSON
			val = string(content)
		}
		result[key] = val
	}

	jsonOK(w, map[string]any{"data": result})
}

// UpsertWebsiteContent PUT /api/content/website/:key (admin only)
// Body: {content, is_public}
func (h *ContentHandler) UpsertWebsiteContent(w http.ResponseWriter, r *http.Request) {
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

	var body struct {
		Content  json.RawMessage `json:"content"`
		IsPublic *bool           `json:"is_public"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.Content == nil {
		jsonError(w, "content wajib diisi", http.StatusBadRequest)
		return
	}
	isPublic := true
	if body.IsPublic != nil {
		isPublic = *body.IsPublic
	}

	_, err := h.db.Exec(r.Context(), `
		INSERT INTO website_content (key, content, is_public, updated_at)
		VALUES ($1, $2, $3, now())
		ON CONFLICT (key) DO UPDATE
		  SET content = EXCLUDED.content,
		      is_public = EXCLUDED.is_public,
		      updated_at = now()
	`, key, body.Content, isPublic)
	if err != nil {
		jsonServerError(w, "gagal menyimpan konten", err)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"key": key}})
}

// ---------------------------------------------------------------------------
// News
// ---------------------------------------------------------------------------

type newsRow struct {
	ID            string          `json:"id"`
	Title         string          `json:"title"`
	Slug          string          `json:"slug"`
	Excerpt       *string         `json:"excerpt"`
	Content       json.RawMessage `json:"content"`
	CoverImageURL *string         `json:"cover_image_url"`
	Status        string          `json:"status"`
	PublishedAt   *string         `json:"published_at"`
	CreatedAt     string          `json:"created_at"`
}

// ListNews GET /api/content/news (public — published only)
// Query: page, limit
func (h *ContentHandler) ListNews(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page := 1
	limit := 10
	if v, err := strconv.Atoi(q.Get("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v > 0 && v <= 100 {
		limit = v
	}
	offset := (page - 1) * limit

	var total int
	if err := h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM news WHERE status = 'published'`,
	).Scan(&total); err != nil {
		jsonError(w, "gagal menghitung berita", http.StatusInternalServerError)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id, title, slug, excerpt, content, cover_image_url, status,
		       published_at::text, created_at::text
		FROM news
		WHERE status = 'published'
		ORDER BY published_at DESC NULLS LAST, created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		jsonError(w, "gagal mengambil berita", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := []newsRow{}
	for rows.Next() {
		var n newsRow
		if err := rows.Scan(&n.ID, &n.Title, &n.Slug, &n.Excerpt, &n.Content, &n.CoverImageURL, &n.Status, &n.PublishedAt, &n.CreatedAt); err != nil {
			jsonError(w, "gagal membaca berita", http.StatusInternalServerError)
			return
		}
		result = append(result, n)
	}

	jsonOK(w, map[string]any{
		"data":  result,
		"total": total,
		"page":  page,
		"limit": limit,
	})
}

// GetNews GET /api/content/news/:slug (public)
func (h *ContentHandler) GetNews(w http.ResponseWriter, r *http.Request) {
	slug := chi.URLParam(r, "slug")
	if slug == "" {
		jsonError(w, "slug wajib diisi", http.StatusBadRequest)
		return
	}

	var n newsRow
	err := h.db.QueryRow(r.Context(), `
		SELECT id, title, slug, excerpt, content, cover_image_url, status, published_at, created_at
		FROM news
		WHERE slug = $1 AND status = 'published'
	`, slug).Scan(&n.ID, &n.Title, &n.Slug, &n.Excerpt, &n.Content, &n.CoverImageURL, &n.Status, &n.PublishedAt, &n.CreatedAt)
	if err != nil {
		jsonError(w, "berita tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{"data": n})
}

// CreateNews POST /api/content/news (admin only)
func (h *ContentHandler) CreateNews(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	var body struct {
		Title         string          `json:"title"`
		Slug          string          `json:"slug"`
		Excerpt       *string         `json:"excerpt"`
		Content       json.RawMessage `json:"content"`
		CoverImageURL *string         `json:"cover_image_url"`
		Status        string          `json:"status"`
		PublishedAt   *string         `json:"published_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.Title == "" || body.Slug == "" {
		jsonError(w, "title dan slug wajib diisi", http.StatusBadRequest)
		return
	}
	if body.Status != "published" && body.Status != "draft" {
		body.Status = "draft"
	}

	var id string
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO news (title, slug, excerpt, content, cover_image_url, status, published_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id
	`, body.Title, body.Slug, body.Excerpt, body.Content, body.CoverImageURL, body.Status, body.PublishedAt).Scan(&id)
	if err != nil {
		jsonServerError(w, "gagal menyimpan berita", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"data": map[string]string{"id": id}})
}

// UpdateNews PUT /api/content/news/:id (admin only)
func (h *ContentHandler) UpdateNews(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	var body struct {
		Title         *string         `json:"title"`
		Slug          *string         `json:"slug"`
		Excerpt       *string         `json:"excerpt"`
		Content       json.RawMessage `json:"content"`
		CoverImageURL *string         `json:"cover_image_url"`
		Status        *string         `json:"status"`
		PublishedAt   *string         `json:"published_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	setClauses := []string{}
	args := []any{}
	idx := 1

	if body.Title != nil {
		setClauses = append(setClauses, fmt.Sprintf("title = $%d", idx))
		args = append(args, *body.Title)
		idx++
	}
	if body.Slug != nil {
		setClauses = append(setClauses, fmt.Sprintf("slug = $%d", idx))
		args = append(args, *body.Slug)
		idx++
	}
	if body.Excerpt != nil {
		setClauses = append(setClauses, fmt.Sprintf("excerpt = $%d", idx))
		args = append(args, *body.Excerpt)
		idx++
	}
	if body.Content != nil {
		setClauses = append(setClauses, fmt.Sprintf("content = $%d", idx))
		args = append(args, body.Content)
		idx++
	}
	if body.CoverImageURL != nil {
		setClauses = append(setClauses, fmt.Sprintf("cover_image_url = $%d", idx))
		args = append(args, *body.CoverImageURL)
		idx++
	}
	if body.Status != nil {
		setClauses = append(setClauses, fmt.Sprintf("status = $%d", idx))
		args = append(args, *body.Status)
		idx++
	}
	if body.PublishedAt != nil {
		setClauses = append(setClauses, fmt.Sprintf("published_at = $%d", idx))
		args = append(args, *body.PublishedAt)
		idx++
	}

	if len(setClauses) == 0 {
		jsonError(w, "tidak ada field yang diupdate", http.StatusBadRequest)
		return
	}

	args = append(args, id)
	query := fmt.Sprintf("UPDATE news SET %s WHERE id = $%d", strings.Join(setClauses, ", "), idx)
	tag, err := h.db.Exec(r.Context(), query, args...)
	if err != nil {
		jsonServerError(w, "gagal mengupdate berita", err)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "berita tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"id": id}})
}

// DeleteNews DELETE /api/content/news/:id (admin only)
func (h *ContentHandler) DeleteNews(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM news WHERE id = $1`, id)
	if err != nil {
		jsonError(w, "gagal menghapus berita", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "berita tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"id": id}})
}

// ---------------------------------------------------------------------------
// Announcements
// ---------------------------------------------------------------------------

type announcementRow struct {
	ID            string          `json:"id"`
	Title         string          `json:"title"`
	Slug          string          `json:"slug"`
	Excerpt       *string         `json:"excerpt"`
	Content       json.RawMessage `json:"content"`
	CoverImageURL *string         `json:"cover_image_url"`
	Status        string          `json:"status"`
	Priority      *string         `json:"priority"`
	ValidUntil    *string         `json:"valid_until"`
	PublishedAt   *string         `json:"published_at"`
	CreatedAt     string          `json:"created_at"`
}

// ListAnnouncements GET /api/content/announcements (public — active only)
func (h *ContentHandler) ListAnnouncements(w http.ResponseWriter, r *http.Request) {
	today := time.Now().Format("2006-01-02")
	rows, err := h.db.Query(r.Context(), `
		SELECT id, title, slug, excerpt, content, cover_image_url, status, priority,
		       valid_until::text, published_at::text, created_at::text
		FROM announcements
		WHERE status = 'published'
		  AND (valid_until IS NULL OR valid_until >= $1)
		ORDER BY
		  CASE priority WHEN 'high' THEN 1 WHEN 'normal' THEN 2 WHEN 'low' THEN 3 ELSE 4 END,
		  published_at DESC NULLS LAST,
		  created_at DESC
	`, today)
	if err != nil {
		jsonError(w, "gagal mengambil pengumuman", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := []announcementRow{}
	for rows.Next() {
		var a announcementRow
		if err := rows.Scan(
			&a.ID, &a.Title, &a.Slug, &a.Excerpt, &a.Content, &a.CoverImageURL,
			&a.Status, &a.Priority, &a.ValidUntil, &a.PublishedAt, &a.CreatedAt,
		); err != nil {
			jsonError(w, "gagal membaca pengumuman", http.StatusInternalServerError)
			return
		}
		result = append(result, a)
	}

	jsonOK(w, map[string]any{"data": result})
}

// CreateAnnouncement POST /api/content/announcements (admin only)
func (h *ContentHandler) CreateAnnouncement(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	var body struct {
		Title         string          `json:"title"`
		Slug          string          `json:"slug"`
		Excerpt       *string         `json:"excerpt"`
		Content       json.RawMessage `json:"content"`
		CoverImageURL *string         `json:"cover_image_url"`
		Status        string          `json:"status"`
		Priority      string          `json:"priority"`
		ValidUntil    *string         `json:"valid_until"`
		PublishedAt   *string         `json:"published_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.Title == "" || body.Slug == "" {
		jsonError(w, "title dan slug wajib diisi", http.StatusBadRequest)
		return
	}
	validPriority := map[string]bool{"high": true, "normal": true, "low": true}
	if !validPriority[body.Priority] {
		body.Priority = "normal"
	}
	if body.Status != "published" && body.Status != "draft" {
		body.Status = "draft"
	}

	var id string
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO announcements (title, slug, excerpt, content, cover_image_url, status, priority, valid_until, published_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		RETURNING id
	`, body.Title, body.Slug, body.Excerpt, body.Content, body.CoverImageURL,
		body.Status, body.Priority, body.ValidUntil, body.PublishedAt,
	).Scan(&id)
	if err != nil {
		jsonServerError(w, "gagal menyimpan pengumuman", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"data": map[string]string{"id": id}})
}

// UpdateAnnouncement PUT /api/content/announcements/:id (admin only)
func (h *ContentHandler) UpdateAnnouncement(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	var body struct {
		Title         *string         `json:"title"`
		Slug          *string         `json:"slug"`
		Excerpt       *string         `json:"excerpt"`
		Content       json.RawMessage `json:"content"`
		CoverImageURL *string         `json:"cover_image_url"`
		Status        *string         `json:"status"`
		Priority      *string         `json:"priority"`
		ValidUntil    *string         `json:"valid_until"`
		PublishedAt   *string         `json:"published_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	setClauses := []string{}
	args := []any{}
	idx := 1

	addField := func(col string, val any) {
		setClauses = append(setClauses, fmt.Sprintf("%s = $%d", col, idx))
		args = append(args, val)
		idx++
	}

	if body.Title != nil {
		addField("title", *body.Title)
	}
	if body.Slug != nil {
		addField("slug", *body.Slug)
	}
	if body.Excerpt != nil {
		addField("excerpt", *body.Excerpt)
	}
	if body.Content != nil {
		addField("content", body.Content)
	}
	if body.CoverImageURL != nil {
		addField("cover_image_url", *body.CoverImageURL)
	}
	if body.Status != nil {
		addField("status", *body.Status)
	}
	if body.Priority != nil {
		addField("priority", *body.Priority)
	}
	if body.ValidUntil != nil {
		addField("valid_until", *body.ValidUntil)
	}
	if body.PublishedAt != nil {
		addField("published_at", *body.PublishedAt)
	}

	if len(setClauses) == 0 {
		jsonError(w, "tidak ada field yang diupdate", http.StatusBadRequest)
		return
	}

	args = append(args, id)
	query := fmt.Sprintf("UPDATE announcements SET %s WHERE id = $%d", strings.Join(setClauses, ", "), idx)
	tag, err := h.db.Exec(r.Context(), query, args...)
	if err != nil {
		jsonServerError(w, "gagal mengupdate pengumuman", err)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "pengumuman tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"id": id}})
}

// DeleteAnnouncement DELETE /api/content/announcements/:id (admin only)
func (h *ContentHandler) DeleteAnnouncement(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM announcements WHERE id = $1`, id)
	if err != nil {
		jsonError(w, "gagal menghapus pengumuman", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "pengumuman tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"id": id}})
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

// SubmitFeedback POST /api/content/feedback (public, no auth)
func (h *ContentHandler) SubmitFeedback(w http.ResponseWriter, r *http.Request) {
	if !h.feedbackLimiter.allow(clientIP(r)) {
		jsonError(w, "terlalu banyak pesan terkirim, coba lagi nanti", http.StatusTooManyRequests)
		return
	}

	var body struct {
		Nama  string  `json:"nama"`
		Email *string `json:"email"`
		NoHp  *string `json:"no_hp"`
		Pesan string  `json:"pesan"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.Nama == "" || body.Pesan == "" {
		jsonError(w, "nama dan pesan wajib diisi", http.StatusBadRequest)
		return
	}

	var id string
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO feedbacks (nama, email, phone, message)
		VALUES ($1,$2,$3,$4)
		RETURNING id
	`, body.Nama, body.Email, body.NoHp, body.Pesan).Scan(&id)
	if err != nil {
		jsonServerError(w, "gagal menyimpan pesan", err)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"data": map[string]string{"id": id}})
}
