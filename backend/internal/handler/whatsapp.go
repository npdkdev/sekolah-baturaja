package handler

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// WhatsAppHandler serves the per-jilid WhatsApp invite links used by the admin
// mutation flow (whatsapp_group_links, defined in
// db/migrations/20260721000400_whatsapp_group_links.sql).
//
// The table has no deleted_at column — is_active is the soft-delete flag, which
// is why bulk-deactivate UPDATEs is_active = false instead of deleting rows.
type WhatsAppHandler struct {
	db *pgxpool.Pool
}

func NewWhatsAppHandler(db *pgxpool.Pool) *WhatsAppHandler {
	return &WhatsAppHandler{db: db}
}

func (h *WhatsAppHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Static segments first. No /{id} route exists today, but keeping the
	// static-before-param order avoids the trap if one is added later.
	r.Post("/groups/bulk-upsert", h.BulkUpsertGroups)
	r.Post("/groups/bulk-deactivate", h.BulkDeactivateGroups)
	r.Get("/groups", h.ListGroups)

	return r
}

// whatsappInviteRe mirrors constraint whatsapp_group_links_url_check:
//
//	check (whatsapp_link ~ '^https://chat\.whatsapp\.com/[A-Za-z0-9_-]+$')
//
// Validated here too so a bad link returns 400 with a readable message instead
// of a raw Postgres constraint violation.
var whatsappInviteRe = regexp.MustCompile(`^https://chat\.whatsapp\.com/[A-Za-z0-9_-]+$`)

const whatsappGroupColumns = `id, jilid, group_name, whatsapp_link, is_active,
	       created_at, updated_at, created_by, updated_by`

// staffCanReadWhatsApp mirrors policy "whatsapp_group_links_staff_select" from
// 20260724000100_whatsapp_group_links_guru_read.sql — admin or guru. Guru needs
// read access because JilidChangeModal is rendered from GuruDashboard.
func staffCanReadWhatsApp(role string) bool {
	return role == "admin" || role == "guru"
}

// GET /api/whatsapp/groups           — all rows
// GET /api/whatsapp/groups?jilid=X   — single active row for that jilid
//
// Returns a plain array under {"data": ...}. src/lib/whatsappGroupLinksAdapters.js
// filters inactive rows itself in normalizeWhatsAppGroupLinks, so the unfiltered
// list is intentional: it keeps the admin editor's state in sync with the table.
// The single-jilid lookup DOES filter is_active because JilidChangeModal only
// wants a link it can actually share.
func (h *WhatsAppHandler) ListGroups(w http.ResponseWriter, r *http.Request) {
	if !staffCanReadWhatsApp(middleware.RoleFromCtx(r.Context())) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	query := "SELECT " + whatsappGroupColumns + " FROM whatsapp_group_links"
	args := []any{}

	if jilid := strings.TrimSpace(r.URL.Query().Get("jilid")); jilid != "" {
		args = append(args, jilid)
		query += " WHERE jilid = $1 AND is_active = true"
	}
	query += " ORDER BY jilid"

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil link grup WhatsApp", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca link grup WhatsApp", http.StatusInternalServerError)
		return
	}
	jsonData(w, items)
}

// POST /api/whatsapp/groups/bulk-upsert (admin only)
//
// Body: {"rows": [{jilid, group_name, whatsapp_link, is_active}, ...]}
// — exactly what saveWhatsAppGroupLinks builds for the non-empty links.
func (h *WhatsAppHandler) BulkUpsertGroups(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	var body struct {
		Rows []struct {
			Jilid        string  `json:"jilid"`
			GroupName    *string `json:"group_name"`
			WhatsAppLink string  `json:"whatsapp_link"`
			IsActive     *bool   `json:"is_active"`
		} `json:"rows"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if len(body.Rows) == 0 {
		jsonError(w, "rows kosong", http.StatusBadRequest)
		return
	}

	actor := actorID(r)

	ctx := r.Context()
	tx, err := h.db.Begin(ctx)
	if err != nil {
		jsonError(w, "gagal memulai transaksi", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	saved := make([]map[string]any, 0, len(body.Rows))
	for _, row := range body.Rows {
		jilid := strings.TrimSpace(row.Jilid)
		link := strings.TrimSpace(row.WhatsAppLink)

		// constraint whatsapp_group_links_jilid_not_blank: length(btrim(jilid)) > 0
		if jilid == "" {
			jsonError(w, "jilid wajib diisi", http.StatusBadRequest)
			return
		}
		if !whatsappInviteRe.MatchString(link) {
			jsonError(w, "link grup "+jilid+" harus menggunakan format https://chat.whatsapp.com/...", http.StatusBadRequest)
			return
		}

		isActive := true
		if row.IsActive != nil {
			isActive = *row.IsActive
		}

		// updated_at is maintained by trigger set_whatsapp_group_links_updated_at
		// (same migration), so it is not set explicitly here.
		rows, err := tx.Query(ctx, `
			INSERT INTO whatsapp_group_links
			       (jilid, group_name, whatsapp_link, is_active, created_by, updated_by)
			VALUES ($1, $2, $3, $4, $5, $5)
			ON CONFLICT (jilid) DO UPDATE SET
			       group_name    = EXCLUDED.group_name,
			       whatsapp_link = EXCLUDED.whatsapp_link,
			       is_active     = EXCLUDED.is_active,
			       updated_by    = EXCLUDED.updated_by,
			       updated_at    = now()
			RETURNING `+whatsappGroupColumns,
			jilid, row.GroupName, link, isActive, actor)
		if err != nil {
			jsonError(w, "gagal menyimpan link grup WhatsApp: "+err.Error(), http.StatusBadRequest)
			return
		}
		item, err := pgx.CollectExactlyOneRow(rows, rowToMap)
		if err != nil {
			jsonError(w, "gagal membaca link grup WhatsApp", http.StatusInternalServerError)
			return
		}
		saved = append(saved, item)
	}

	if err := tx.Commit(ctx); err != nil {
		jsonError(w, "gagal menyimpan perubahan link grup", http.StatusInternalServerError)
		return
	}
	jsonData(w, saved)
}

// POST /api/whatsapp/groups/bulk-deactivate (admin only)
//
// Body: {"jilid_list": ["Jilid 1A", ...]} — the jilid whose link was cleared in
// the editor. Soft delete: is_active = false, rows are kept.
func (h *WhatsAppHandler) BulkDeactivateGroups(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	var body struct {
		JilidList []string `json:"jilid_list"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	list := make([]string, 0, len(body.JilidList))
	for _, j := range body.JilidList {
		if j = strings.TrimSpace(j); j != "" {
			list = append(list, j)
		}
	}
	if len(list) == 0 {
		jsonError(w, "jilid_list kosong", http.StatusBadRequest)
		return
	}

	ct, err := h.db.Exec(r.Context(), `
		UPDATE whatsapp_group_links
		   SET is_active  = false,
		       updated_by = $2,
		       updated_at = now()
		 WHERE jilid = ANY($1)
	`, list, actorID(r))
	if err != nil {
		jsonError(w, "gagal menonaktifkan link grup WhatsApp", http.StatusInternalServerError)
		return
	}

	jsonData(w, map[string]any{"deactivated": ct.RowsAffected()})
}

// actorID returns the JWT subject as a nullable uuid arg. created_by/updated_by
// are FKs onto auth_users(id), so an empty string has to become NULL — same
// reason as the note in payment.go.
func actorID(r *http.Request) *string {
	id := middleware.UserIDFromCtx(r.Context())
	if id == "" {
		return nil
	}
	return &id
}
