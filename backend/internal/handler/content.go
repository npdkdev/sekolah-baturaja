package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
	"lpq-backend/internal/storage"
)

type ContentHandler struct {
	db    *pgxpool.Pool
	store *storage.Store
}

func NewContentHandler(db *pgxpool.Pool, store *storage.Store) *ContentHandler {
	return &ContentHandler{db: db, store: store}
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

	// Feedback — POST is the public contact form; list/delete are back-office.
	r.Post("/feedback", h.SubmitFeedback)
	r.Get("/feedback", h.ListFeedback)
	r.Put("/feedback/{id}", h.UpdateFeedback)
	r.Delete("/feedback/{id}", h.DeleteFeedback)

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
//
// Akun sistem dikecualikan: profil dengan peran admin atau superadmin bukan
// pengajar dan tidak boleh tampil di situs publik. Untuk template yang dijual ini
// penting — tanpa penyaringan, akun superadmin milik PENJUAL ikut terpampang di
// halaman kontak situs pembeli.
func (h *ContentHandler) ListPublicTeachers(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT g.id, g.nama, g.jabatan, g.foto_url, g.avatar_path, g.roles, g.jenis_kelamin
		FROM guru g
		LEFT JOIN user_profiles up ON up.id = g.id
		WHERE g.status = 'active'
		  AND g.deleted_at IS NULL
		  AND (up.role IS NULL OR up.role NOT IN ('admin', 'superadmin'))
		ORDER BY g.nama
	`)
	if err != nil {
		jsonError(w, "gagal mengambil data pengajar", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := []publicTeacherRow{}
	for rows.Next() {
		var t publicTeacherRow
		var avatarPath *string
		if err := rows.Scan(&t.ID, &t.Nama, &t.Jabatan, &t.FotoURL, &avatarPath, &t.Roles, &t.JenisKelamin); err != nil {
			jsonError(w, "gagal membaca data pengajar", http.StatusInternalServerError)
			return
		}
		// Avatar guru disimpan di bucket privat dan hanya path-nya yang
		// persisten. Buat URL bertanda tangan untuk halaman publik agar foto
		// tetap dapat dibaca tanpa membuka bucket atau menyimpan URL kadaluarsa.
		if h.store != nil && avatarPath != nil && strings.TrimSpace(*avatarPath) != "" {
			url := h.store.SignedURL(storage.BucketAvatars, strings.TrimSpace(*avatarPath), time.Hour, publicRequestBaseURL(r))
			t.FotoURL = &url
		}
		result = append(result, t)
	}

	jsonOK(w, map[string]any{"data": result})
}

func publicRequestBaseURL(r *http.Request) string {
	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if forwarded := r.Header.Get("X-Forwarded-Proto"); forwarded != "" {
		scheme = strings.Split(forwarded, ",")[0]
	}
	host := r.Host
	if host == "" {
		host = "localhost:8080"
	}
	return scheme + "://" + host
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

// brandKeys memuat identitas website: nama sekolah, logo, ikon, dan aksen warna.
// Aplikasi ini template yang dijual, jadi kunci-kunci ini HANYA boleh diubah
// superadmin (pemilik template). Pembeli berperan admin dan tetap bebas mengubah
// seluruh konten administrasi sekolah lewat kunci lain.
var brandKeys = map[string]struct{}{
	"school_identity": {},
	"logoUrl":         {},
}

// UpsertWebsiteContent PUT /api/content/website/:key
//
// Dua tingkat izin: kunci identitas menuntut superadmin, sisanya cukup
// admin/tata usaha. Pemeriksaannya di sini dan bukan di router karena router
// hanya melihat path, sedangkan kuncinya baru diketahui dari parameter URL.
func (h *ContentHandler) UpsertWebsiteContent(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if !middleware.CanManage(role) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	key := chi.URLParam(r, "key")
	if key == "" {
		jsonError(w, "key wajib diisi", http.StatusBadRequest)
		return
	}

	if _, brand := brandKeys[key]; brand && !middleware.CanManageBrand(role) {
		jsonError(w, "identitas website hanya dapat diubah superadmin", http.StatusForbidden)
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
		jsonError(w, fmt.Sprintf("gagal menyimpan konten: %v", err), http.StatusInternalServerError)
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
	Category      string          `json:"category"`
	Excerpt       *string         `json:"excerpt"`
	Summary       *string         `json:"summary"`
	Content       json.RawMessage `json:"content"`
	Body          string          `json:"body"`
	CoverImageURL *string         `json:"cover_image_url"`
	Media         json.RawMessage `json:"media"`
	Gallery       json.RawMessage `json:"gallery"`
	Author        string          `json:"author"`
	AuthorRole    string          `json:"author_role"`
	Status        string          `json:"status"`
	PublishedAt   *string         `json:"published_at"`
	IsFeatured    bool            `json:"is_featured"`
	DisplayOrder  int             `json:"display_order"`
	IsPublic      bool            `json:"is_public"`
	CreatedAt     string          `json:"created_at"`
	UpdatedAt     string          `json:"updated_at"`
}

type newsPayload struct {
	Title         *string         `json:"title"`
	Slug          *string         `json:"slug"`
	Category      *string         `json:"category"`
	Excerpt       *string         `json:"excerpt"`
	Summary       *string         `json:"summary"`
	Content       json.RawMessage `json:"content"`
	Body          *string         `json:"body"`
	CoverImageURL *string         `json:"cover_image_url"`
	Media         json.RawMessage `json:"media"`
	Gallery       json.RawMessage `json:"gallery"`
	Author        *string         `json:"author"`
	AuthorRole    *string         `json:"author_role"`
	Status        *string         `json:"status"`
	PublishedAt   *string         `json:"published_at"`
	IsFeatured    *bool           `json:"is_featured"`
	DisplayOrder  *int            `json:"display_order"`
	IsPublic      *bool           `json:"is_public"`
}

const newsColumns = `id,title,slug,category,excerpt,content,cover_image_url,media,
 author,author_role,status,published_at::text,is_featured,display_order,is_public,
 created_at::text,updated_at::text`

var newsSlugPattern = regexp.MustCompile(`^[a-z0-9]+(?:-[a-z0-9]+)*$`)

type newsScanner interface{ Scan(...any) error }

func scanNews(s newsScanner) (newsRow, error) {
	var n newsRow
	err := s.Scan(&n.ID, &n.Title, &n.Slug, &n.Category, &n.Excerpt, &n.Content,
		&n.CoverImageURL, &n.Media, &n.Author, &n.AuthorRole, &n.Status, &n.PublishedAt,
		&n.IsFeatured, &n.DisplayOrder, &n.IsPublic, &n.CreatedAt, &n.UpdatedAt)
	if err != nil {
		return n, err
	}
	n.Summary = n.Excerpt
	n.Gallery = n.Media
	var object map[string]json.RawMessage
	if json.Unmarshal(n.Content, &object) == nil {
		for _, key := range []string{"body", "text"} {
			var text string
			if raw, ok := object[key]; ok && json.Unmarshal(raw, &text) == nil {
				n.Body = text
				break
			}
		}
	}
	return n, nil
}

func newsText(name, value string, max int) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", fmt.Errorf("%s wajib diisi", name)
	}
	if len([]rune(value)) > max {
		return "", fmt.Errorf("%s maksimal %d karakter", name, max)
	}
	return value, nil
}

func newsSlug(value string) (string, error) {
	value, err := newsText("slug", value, 120)
	if err == nil && !newsSlugPattern.MatchString(value) {
		err = fmt.Errorf("slug hanya boleh berisi huruf kecil, angka, dan tanda hubung")
	}
	return value, err
}

func newsStatus(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value != "draft" && value != "published" && value != "archived" {
		return "", fmt.Errorf("status harus draft, published, atau archived")
	}
	return value, nil
}

func newsTime(value string) (string, error) {
	value = strings.TrimSpace(value)
	if _, err := time.Parse(time.RFC3339, value); err != nil {
		return "", fmt.Errorf("published_at harus memakai format RFC3339")
	}
	return value, nil
}

func newsJSON(name string, raw json.RawMessage, objectOnly bool) (json.RawMessage, error) {
	if string(raw) == "null" {
		if objectOnly {
			return json.RawMessage(`{}`), nil
		}
		return json.RawMessage(`[]`), nil
	}
	if !json.Valid(raw) {
		return nil, fmt.Errorf("%s harus berupa JSON valid", name)
	}
	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, fmt.Errorf("%s harus berupa JSON valid", name)
	}
	_, object := value.(map[string]any)
	_, array := value.([]any)
	if !object || (objectOnly && array) {
		if objectOnly {
			return nil, fmt.Errorf("%s harus berupa object JSON", name)
		}
		if !array {
			return nil, fmt.Errorf("%s harus berupa object atau array JSON", name)
		}
	}
	return raw, nil
}

func contentFromBody(value string) json.RawMessage {
	raw, _ := json.Marshal(map[string]string{"body": value})
	return raw
}

func newsDBError(w http.ResponseWriter, action string, err error) {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		if pgErr.Code == "23505" {
			jsonError(w, "slug berita sudah digunakan", http.StatusConflict)
			return
		}
		if pgErr.Code == "23502" || pgErr.Code == "23514" || pgErr.Code == "22P02" {
			jsonError(w, "data berita tidak valid", http.StatusBadRequest)
			return
		}
	}
	jsonError(w, "gagal "+action+" berita", http.StatusInternalServerError)
}

// ListNews returns all lifecycle states to content managers and only public,
// published rows to unauthenticated readers.
func (h *ContentHandler) ListNews(w http.ResponseWriter, r *http.Request) {
	manager := middleware.CanManage(middleware.RoleFromCtx(r.Context()))
	page, limit := 1, 10
	if manager {
		limit = 100
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("page")); err == nil && v > 0 {
		page = v
	}
	if v, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil && v > 0 && v <= 100 {
		limit = v
	}
	where := "WHERE status='published' AND is_public"
	if manager {
		where = ""
	}
	var total int
	if err := h.db.QueryRow(r.Context(), "SELECT count(*) FROM news "+where).Scan(&total); err != nil {
		jsonError(w, "gagal menghitung berita", http.StatusInternalServerError)
		return
	}
	rows, err := h.db.Query(r.Context(), "SELECT "+newsColumns+" FROM news "+where+
		" ORDER BY is_featured DESC,display_order ASC,published_at DESC NULLS LAST,created_at DESC LIMIT $1 OFFSET $2",
		limit, (page-1)*limit)
	if err != nil {
		jsonError(w, "gagal mengambil berita", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	result := []newsRow{}
	for rows.Next() {
		n, err := scanNews(rows)
		if err != nil {
			jsonError(w, "gagal membaca berita", http.StatusInternalServerError)
			return
		}
		result = append(result, n)
	}
	if rows.Err() != nil {
		jsonError(w, "gagal membaca berita", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": result, "total": total, "page": page, "limit": limit})
}

// GetNews accepts a slug publicly and a slug or id for content managers.
func (h *ContentHandler) GetNews(w http.ResponseWriter, r *http.Request) {
	key := chi.URLParam(r, "slug")
	if key == "" {
		jsonError(w, "slug wajib diisi", http.StatusBadRequest)
		return
	}
	where := "WHERE slug=$1 AND status='published' AND is_public"
	if middleware.CanManage(middleware.RoleFromCtx(r.Context())) {
		where = "WHERE slug=$1 OR id::text=$1"
	}
	n, err := scanNews(h.db.QueryRow(r.Context(), "SELECT "+newsColumns+" FROM news "+where, key))
	if err != nil {
		jsonError(w, "berita tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"data": n})
}

func (h *ContentHandler) CreateNews(w http.ResponseWriter, r *http.Request) {
	if !middleware.CanManage(middleware.RoleFromCtx(r.Context())) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var p newsPayload
	if json.NewDecoder(r.Body).Decode(&p) != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if p.Title == nil || p.Slug == nil {
		jsonError(w, "title dan slug wajib diisi", http.StatusBadRequest)
		return
	}
	title, err := newsText("title", *p.Title, 200)
	if err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	slug, err := newsSlug(*p.Slug)
	if err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	category := "Pengumuman"
	if p.Category != nil {
		category, err = newsText("category", *p.Category, 80)
		if err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
	}
	status := "draft"
	if p.Status != nil {
		status, err = newsStatus(*p.Status)
		if err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
	}
	author := "Sekolah"
	if p.Author != nil {
		author, err = newsText("author", *p.Author, 160)
		if err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
	}
	authorRole := "Sekolah"
	if p.AuthorRole != nil {
		authorRole, err = newsText("author_role", *p.AuthorRole, 80)
		if err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
	}
	content := json.RawMessage(`{}`)
	if len(p.Content) > 0 {
		content, err = newsJSON("content", p.Content, true)
	} else if p.Body != nil {
		content = contentFromBody(*p.Body)
	}
	if err != nil {
		jsonError(w, err.Error(), 400)
		return
	}
	mediaInput := p.Media
	if len(mediaInput) == 0 {
		mediaInput = p.Gallery
	}
	media := json.RawMessage(`[]`)
	if len(mediaInput) > 0 {
		media, err = newsJSON("media", mediaInput, false)
		if err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
	}
	var excerpt any
	if p.Excerpt != nil {
		excerpt = strings.TrimSpace(*p.Excerpt)
	} else if p.Summary != nil {
		excerpt = strings.TrimSpace(*p.Summary)
	}
	var cover any
	if p.CoverImageURL != nil {
		cover = strings.TrimSpace(*p.CoverImageURL)
	}
	var published any
	if p.PublishedAt != nil {
		published, err = newsTime(*p.PublishedAt)
		if err != nil {
			jsonError(w, err.Error(), 400)
			return
		}
	}
	if status == "published" && published == nil {
		published = time.Now().UTC().Format(time.RFC3339)
	}
	featured := false
	if p.IsFeatured != nil {
		featured = *p.IsFeatured
	}
	order := 0
	if p.DisplayOrder != nil {
		order = *p.DisplayOrder
	}
	if order < 0 {
		jsonError(w, "display_order harus bilangan bulat non-negatif", 400)
		return
	}
	public := true
	if p.IsPublic != nil {
		public = *p.IsPublic
	}
	n, err := scanNews(h.db.QueryRow(r.Context(), `INSERT INTO news
		(title,slug,category,excerpt,content,cover_image_url,media,author,author_role,status,published_at,is_featured,display_order,is_public)
		VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING `+newsColumns,
		title, slug, category, excerpt, content, cover, media, author, authorRole, status, published, featured, order, public))
	if err != nil {
		newsDBError(w, "menyimpan", err)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": n})
}

func (h *ContentHandler) UpdateNews(w http.ResponseWriter, r *http.Request) {
	if !middleware.CanManage(middleware.RoleFromCtx(r.Context())) {
		jsonError(w, "forbidden", 403)
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", 400)
		return
	}
	var p newsPayload
	if json.NewDecoder(r.Body).Decode(&p) != nil {
		jsonError(w, "request tidak valid", 400)
		return
	}
	sets := []string{}
	args := []any{}
	idx := 1
	add := func(column string, value any) {
		sets = append(sets, fmt.Sprintf("%s=$%d", column, idx))
		args = append(args, value)
		idx++
	}
	if p.Title != nil {
		v, e := newsText("title", *p.Title, 200)
		if e != nil {
			jsonError(w, e.Error(), 400)
			return
		}
		add("title", v)
	}
	if p.Slug != nil {
		v, e := newsSlug(*p.Slug)
		if e != nil {
			jsonError(w, e.Error(), 400)
			return
		}
		add("slug", v)
	}
	if p.Category != nil {
		v, e := newsText("category", *p.Category, 80)
		if e != nil {
			jsonError(w, e.Error(), 400)
			return
		}
		add("category", v)
	}
	if p.Excerpt != nil {
		add("excerpt", strings.TrimSpace(*p.Excerpt))
	} else if p.Summary != nil {
		add("excerpt", strings.TrimSpace(*p.Summary))
	}
	if len(p.Content) > 0 {
		v, e := newsJSON("content", p.Content, true)
		if e != nil {
			jsonError(w, e.Error(), 400)
			return
		}
		add("content", v)
	} else if p.Body != nil {
		sets = append(sets, fmt.Sprintf("content=jsonb_set(content,'{body}',to_jsonb($%d::text),true)", idx))
		args = append(args, *p.Body)
		idx++
	}
	if p.CoverImageURL != nil {
		add("cover_image_url", strings.TrimSpace(*p.CoverImageURL))
	}
	media := p.Media
	if len(media) == 0 {
		media = p.Gallery
	}
	if len(media) > 0 {
		v, e := newsJSON("media", media, false)
		if e != nil {
			jsonError(w, e.Error(), 400)
			return
		}
		add("media", v)
	}
	if p.Author != nil {
		v, e := newsText("author", *p.Author, 160)
		if e != nil {
			jsonError(w, e.Error(), 400)
			return
		}
		add("author", v)
	}
	if p.AuthorRole != nil {
		v, e := newsText("author_role", *p.AuthorRole, 80)
		if e != nil {
			jsonError(w, e.Error(), 400)
			return
		}
		add("author_role", v)
	}
	status := ""
	if p.Status != nil {
		var e error
		status, e = newsStatus(*p.Status)
		if e != nil {
			jsonError(w, e.Error(), 400)
			return
		}
		add("status", status)
	}
	if p.PublishedAt != nil {
		v, e := newsTime(*p.PublishedAt)
		if e != nil {
			jsonError(w, e.Error(), 400)
			return
		}
		add("published_at", v)
	} else if status == "published" {
		sets = append(sets, "published_at=COALESCE(published_at,now())")
	}
	if p.IsFeatured != nil {
		add("is_featured", *p.IsFeatured)
	}
	if p.DisplayOrder != nil {
		if *p.DisplayOrder < 0 {
			jsonError(w, "display_order harus bilangan bulat non-negatif", 400)
			return
		}
		add("display_order", *p.DisplayOrder)
	}
	if p.IsPublic != nil {
		add("is_public", *p.IsPublic)
	}
	if len(sets) == 0 {
		jsonError(w, "tidak ada field yang diupdate", 400)
		return
	}
	sets = append(sets, "updated_at=now()")
	args = append(args, id)
	query := fmt.Sprintf("UPDATE news SET %s WHERE id=$%d RETURNING %s", strings.Join(sets, ","), idx, newsColumns)
	n, err := scanNews(h.db.QueryRow(r.Context(), query, args...))
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "berita tidak ditemukan", 404)
		} else {
			newsDBError(w, "mengupdate", err)
		}
		return
	}
	jsonOK(w, map[string]any{"data": n})
}

func (h *ContentHandler) DeleteNews(w http.ResponseWriter, r *http.Request) {
	if !middleware.CanManage(middleware.RoleFromCtx(r.Context())) {
		jsonError(w, "forbidden", 403)
		return
	}
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", 400)
		return
	}
	tag, err := h.db.Exec(r.Context(), `DELETE FROM news WHERE id=$1`, id)
	if err != nil {
		newsDBError(w, "menghapus", err)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "berita tidak ditemukan", 404)
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
	if !middleware.CanManage(role) {
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
		jsonError(w, fmt.Sprintf("gagal menyimpan pengumuman: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"data": map[string]string{"id": id}})
}

// UpdateAnnouncement PUT /api/content/announcements/:id (admin only)
func (h *ContentHandler) UpdateAnnouncement(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if !middleware.CanManage(role) {
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
		jsonError(w, fmt.Sprintf("gagal mengupdate pengumuman: %v", err), http.StatusInternalServerError)
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
	if !middleware.CanManage(role) {
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

type feedbackRow struct {
	ID        string  `json:"id"`
	Nama      *string `json:"nama"`
	Email     *string `json:"email"`
	Phone     *string `json:"phone"`
	Message   string  `json:"message"`
	Status    string  `json:"status"`
	CreatedAt string  `json:"created_at"`
}

// SubmitFeedback POST /api/content/feedback (public, no auth)
//
// Accepts both the current field names the contact form sends (phone, message)
// and the older no_hp/pesan spelling. The form sends the former; the handler
// only understood the latter, so every submission failed validation.
func (h *ContentHandler) SubmitFeedback(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Nama    string  `json:"nama"`
		Email   *string `json:"email"`
		Phone   *string `json:"phone"`
		NoHp    *string `json:"no_hp"`
		Message string  `json:"message"`
		Pesan   string  `json:"pesan"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	message := body.Message
	if message == "" {
		message = body.Pesan
	}
	phone := body.Phone
	if phone == nil {
		phone = body.NoHp
	}

	if strings.TrimSpace(body.Nama) == "" || strings.TrimSpace(message) == "" {
		jsonError(w, "nama dan pesan wajib diisi", http.StatusBadRequest)
		return
	}

	var id string
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO feedbacks (nama, email, phone, message)
		VALUES ($1,$2,$3,$4)
		RETURNING id
	`, body.Nama, body.Email, phone, message).Scan(&id)
	if err != nil {
		jsonError(w, fmt.Sprintf("gagal menyimpan pesan: %v", err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"data": map[string]string{"id": id}})
}

// ListFeedback GET /api/content/feedback (admin only)
//
// Feeds the "Pesan Masuk" list in the Konten admin panel. Newest first so the
// unhandled messages sit at the top.
func (h *ContentHandler) ListFeedback(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if !middleware.CanManage(role) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id, nama, email, phone, message, status, created_at::text
		FROM feedbacks
		ORDER BY created_at DESC
	`)
	if err != nil {
		jsonError(w, "gagal mengambil pesan masuk", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := []feedbackRow{}
	for rows.Next() {
		var f feedbackRow
		if err := rows.Scan(&f.ID, &f.Nama, &f.Email, &f.Phone, &f.Message, &f.Status, &f.CreatedAt); err != nil {
			jsonError(w, "gagal membaca pesan masuk", http.StatusInternalServerError)
			return
		}
		result = append(result, f)
	}

	jsonOK(w, map[string]any{"data": result})
}

// UpdateFeedback PUT /api/content/feedback/:id (admin only)
func (h *ContentHandler) UpdateFeedback(w http.ResponseWriter, r *http.Request) {
	role := middleware.RoleFromCtx(r.Context())
	if !middleware.CanManage(role) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	var body struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	status := strings.TrimSpace(body.Status)
	switch status {
	case "new", "reviewed", "closed", "spam":
	default:
		jsonError(w, "status pesan tidak valid", http.StatusBadRequest)
		return
	}

	var actor any
	if userID := middleware.UserIDFromCtx(r.Context()); userID != "" {
		actor = userID
	}
	tag, err := h.db.Exec(r.Context(), `
		UPDATE feedbacks
		SET status = $1,
		    handled_by = CASE WHEN $1 = 'new' THEN NULL ELSE $2 END,
		    handled_at = CASE WHEN $1 = 'new' THEN NULL ELSE now() END
		WHERE id = $3
	`, status, actor, id)
	if err != nil {
		jsonError(w, "gagal memperbarui status pesan", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "pesan tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"id": id, "status": status}})
}
func (h *ContentHandler) DeleteFeedback(w http.ResponseWriter, r *http.Request) {

// DeleteFeedback DELETE /api/content/feedback/:id (admin only)
	role := middleware.RoleFromCtx(r.Context())
	if !middleware.CanManage(role) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	tag, err := h.db.Exec(r.Context(), `DELETE FROM feedbacks WHERE id = $1`, id)
	if err != nil {
		jsonError(w, "gagal menghapus pesan", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "pesan tidak ditemukan", http.StatusNotFound)
		return
	}

	jsonOK(w, map[string]any{"data": map[string]string{"id": id}})
}
