package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

type ForumHandler struct {
	db *pgxpool.Pool
}

func NewForumHandler(db *pgxpool.Pool) *ForumHandler {
	return &ForumHandler{db: db}
}

func (h *ForumHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// "replies" is registered as its own top-level segment before the /topics
	// subtree so neither can swallow the other's ids.
	r.Delete("/replies/{id}", h.DeleteReply)

	r.Get("/topics", h.ListTopics)
	r.Post("/topics", h.CreateTopic)
	r.Route("/topics/{id}", func(r chi.Router) {
		r.Get("/", h.TopicDetail)
		r.Delete("/", h.DeleteTopic)
		r.Get("/replies", h.ListReplies)
		r.Post("/replies", h.CreateReply)
	})

	return r
}

// Length caps mirror the check constraints in
// 20260726000100_forum_topics_and_replies.sql. Enforced here too so an
// oversized post returns 400 instead of a constraint violation as 500.
const (
	forumTitleMaxLen      = 200
	forumContentMaxLen    = 10000
	forumAuthorNameMaxLen = 120
)

// forumRoles are the app_role values the author_role check constraint accepts.
var forumRoles = map[string]bool{
	"admin": true, "guru": true, "santri": true, "pentashih": true,
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

// forumAuthor is the verified poster identity. Never built from the request
// body: author_id and author_role come from the JWT claims, and author_name is
// resolved from the guru/santri record so a client cannot post under someone
// else's name.
type forumAuthor struct {
	id   string
	role string
	name string
}

// resolveAuthor derives the poster from the JWT and looks up their display
// name. bodyName is the client-supplied display string, used only as a fallback
// when no profile row matches (trimmed and capped before use).
//
// The JWT subject is a santri.id or a guru.id depending on role; both reference
// auth_users(id), which is what forum_*.author_id points at.
func (h *ForumHandler) resolveAuthor(ctx context.Context, bodyName string) (forumAuthor, error) {
	a := forumAuthor{
		id:   middleware.UserIDFromCtx(ctx),
		role: middleware.RoleFromCtx(ctx),
	}
	if a.id == "" || !forumRoles[a.role] {
		return a, errors.New("identitas pengguna tidak valid")
	}

	// Authoritative display name. Checked against the role's own table so a
	// santri id cannot resolve to a guru name.
	var lookup string
	switch a.role {
	case "santri":
		lookup = `SELECT nama_lengkap FROM santri WHERE id = $1 AND deleted_at IS NULL`
	default:
		lookup = `SELECT nama FROM guru WHERE id = $1 AND deleted_at IS NULL`
	}
	var name string
	if err := h.db.QueryRow(ctx, lookup, a.id).Scan(&name); err == nil {
		a.name = strings.TrimSpace(name)
	}

	if a.name == "" {
		a.name = capLen(strings.TrimSpace(bodyName), forumAuthorNameMaxLen)
	}
	if a.name == "" {
		a.name = "Pengguna"
	}
	a.name = capLen(a.name, forumAuthorNameMaxLen)
	return a, nil
}

// capLen truncates on runes so a cap never splits a multi-byte character.
func capLen(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max])
}

// ---------------------------------------------------------------------------
// Topics
// ---------------------------------------------------------------------------

// ListTopics GET /api/forum/topics
// reply_count is aggregated over live replies only — ForumPage renders it as
// "{reply_count} balasan".
func (h *ForumHandler) ListTopics(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginate(r)

	rows, err := h.db.Query(r.Context(), `
		SELECT t.id, t.title, t.content, t.author_id, t.author_name, t.author_role,
		       t.created_at,
		       COUNT(rp.id) AS reply_count
		FROM forum_topics t
		LEFT JOIN forum_replies rp
		       ON rp.topic_id = t.id AND rp.deleted_at IS NULL
		WHERE t.deleted_at IS NULL
		GROUP BY t.id
		ORDER BY t.created_at DESC
		LIMIT $1 OFFSET $2
	`, limit, offset)
	if err != nil {
		jsonError(w, "gagal mengambil topik forum", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca topik forum", http.StatusInternalServerError)
		return
	}
	jsonData(w, items)
}

// TopicDetail GET /api/forum/topics/{id}
func (h *ForumHandler) TopicDetail(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	rows, err := h.db.Query(r.Context(), `
		SELECT t.id, t.title, t.content, t.author_id, t.author_name, t.author_role,
		       t.created_at,
		       (SELECT COUNT(*) FROM forum_replies rp
		         WHERE rp.topic_id = t.id AND rp.deleted_at IS NULL) AS reply_count
		FROM forum_topics t
		WHERE t.id = $1 AND t.deleted_at IS NULL
	`, id)
	if err != nil {
		jsonError(w, "gagal mengambil topik forum", http.StatusInternalServerError)
		return
	}
	topic, err := pgx.CollectExactlyOneRow(rows, rowToMap)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "topik tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca topik forum", http.StatusInternalServerError)
		return
	}
	jsonData(w, topic)
}

// CreateTopic POST /api/forum/topics
// Body: {title, content, author_name}. Any author_id / author_role in the body
// is ignored — both are taken from the JWT.
func (h *ForumHandler) CreateTopic(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Title      string `json:"title"`
		Content    string `json:"content"`
		AuthorName string `json:"author_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	title := strings.TrimSpace(body.Title)
	content := strings.TrimSpace(body.Content)
	if title == "" || content == "" {
		jsonError(w, "judul dan isi topik wajib diisi", http.StatusBadRequest)
		return
	}
	if len([]rune(title)) > forumTitleMaxLen {
		jsonError(w, "judul topik terlalu panjang", http.StatusBadRequest)
		return
	}
	if len([]rune(content)) > forumContentMaxLen {
		jsonError(w, "isi topik terlalu panjang", http.StatusBadRequest)
		return
	}

	author, err := h.resolveAuthor(r.Context(), body.AuthorName)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		INSERT INTO forum_topics (title, content, author_id, author_name, author_role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, title, content, author_id, author_name, author_role, created_at
	`, title, content, author.id, author.name, author.role)
	if err != nil {
		jsonError(w, "gagal membuat topik forum", http.StatusInternalServerError)
		return
	}
	item, err := pgx.CollectExactlyOneRow(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca topik baru", http.StatusInternalServerError)
		return
	}
	item["reply_count"] = 0
	jsonCreated(w, item)
}

// DeleteTopic DELETE /api/forum/topics/{id} — soft delete.
func (h *ForumHandler) DeleteTopic(w http.ResponseWriter, r *http.Request) {
	h.softDelete(w, r, "forum_topics", "topik")
}

// ---------------------------------------------------------------------------
// Replies
// ---------------------------------------------------------------------------

// ListReplies GET /api/forum/topics/{id}/replies
func (h *ForumHandler) ListReplies(w http.ResponseWriter, r *http.Request) {
	limit, offset := paginate(r)
	topicID := chi.URLParam(r, "id")

	rows, err := h.db.Query(r.Context(), `
		SELECT id, topic_id, content, author_id, author_name, author_role, created_at
		FROM forum_replies
		WHERE topic_id = $1 AND deleted_at IS NULL
		ORDER BY created_at
		LIMIT $2 OFFSET $3
	`, topicID, limit, offset)
	if err != nil {
		jsonError(w, "gagal mengambil balasan forum", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca balasan forum", http.StatusInternalServerError)
		return
	}
	jsonData(w, items)
}

// CreateReply POST /api/forum/topics/{id}/replies
// Body: {content, author_name}. author_id / author_role come from the JWT.
func (h *ForumHandler) CreateReply(w http.ResponseWriter, r *http.Request) {
	topicID := chi.URLParam(r, "id")

	var body struct {
		Content    string `json:"content"`
		AuthorName string `json:"author_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	content := strings.TrimSpace(body.Content)
	if content == "" {
		jsonError(w, "isi balasan wajib diisi", http.StatusBadRequest)
		return
	}
	if len([]rune(content)) > forumContentMaxLen {
		jsonError(w, "isi balasan terlalu panjang", http.StatusBadRequest)
		return
	}

	author, err := h.resolveAuthor(r.Context(), body.AuthorName)
	if err != nil {
		jsonError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	// Reject replies to a missing or removed topic explicitly; the FK alone
	// would surface as a 500 and would not catch a soft-deleted parent.
	var exists bool
	if err := h.db.QueryRow(r.Context(),
		`SELECT EXISTS (SELECT 1 FROM forum_topics WHERE id = $1 AND deleted_at IS NULL)`,
		topicID,
	).Scan(&exists); err != nil {
		jsonError(w, "gagal memeriksa topik", http.StatusInternalServerError)
		return
	}
	if !exists {
		jsonError(w, "topik tidak ditemukan", http.StatusNotFound)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		INSERT INTO forum_replies (topic_id, content, author_id, author_name, author_role)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, topic_id, content, author_id, author_name, author_role, created_at
	`, topicID, content, author.id, author.name, author.role)
	if err != nil {
		jsonError(w, "gagal mengirim balasan", http.StatusInternalServerError)
		return
	}
	item, err := pgx.CollectExactlyOneRow(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca balasan baru", http.StatusInternalServerError)
		return
	}
	jsonCreated(w, item)
}

// DeleteReply DELETE /api/forum/replies/{id} — soft delete.
func (h *ForumHandler) DeleteReply(w http.ResponseWriter, r *http.Request) {
	h.softDelete(w, r, "forum_replies", "balasan")
}

// ---------------------------------------------------------------------------
// Shared delete path
// ---------------------------------------------------------------------------

// softDelete stamps deleted_at on a topic or reply after an explicit ownership
// check: the author may remove their own post, admin may remove any. The
// requester's identity comes from the JWT, so a client cannot claim someone
// else's row. table is a package-level literal, never request input.
func (h *ForumHandler) softDelete(w http.ResponseWriter, r *http.Request, table, label string) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromCtx(ctx)
	isAdmin := middleware.RoleFromCtx(ctx) == "admin"

	if userID == "" {
		jsonError(w, "identitas pengguna tidak valid", http.StatusUnauthorized)
		return
	}

	// Ownership is read first so a forbidden attempt is distinguishable from a
	// missing row instead of collapsing both into one ambiguous 404.
	var authorID string
	err := h.db.QueryRow(ctx,
		`SELECT author_id FROM `+table+` WHERE id = $1 AND deleted_at IS NULL`,
		id,
	).Scan(&authorID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, label+" tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal memeriksa "+label, http.StatusInternalServerError)
		return
	}
	if !isAdmin && authorID != userID {
		jsonError(w, "Anda tidak memiliki akses untuk aksi forum ini.", http.StatusForbidden)
		return
	}

	// The ownership predicate is repeated in the UPDATE so a concurrent change
	// between the two statements cannot widen what this request may remove.
	ct, err := h.db.Exec(ctx,
		`UPDATE `+table+`
		    SET deleted_at = now()
		  WHERE id = $1 AND deleted_at IS NULL AND ($2 OR author_id = $3)`,
		id, isAdmin, userID)
	if err != nil {
		jsonError(w, "gagal menghapus "+label, http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		jsonError(w, label+" tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonData(w, map[string]any{"id": id, "deleted": true})
}
