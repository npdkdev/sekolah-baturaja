package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/auth"
	"lpq-backend/internal/middleware"
)

type SantriHandler struct {
	db *pgxpool.Pool
}

func NewSantriHandler(db *pgxpool.Pool) *SantriHandler {
	return &SantriHandler{db: db}
}

func (h *SantriHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Public
	r.Get("/count", h.Count)

	r.Get("/", h.List)
	// by-rfid before /{id} so "by-rfid" is not read as an id.
	r.Get("/by-rfid/{rfid}", h.ByRFID)
	r.Get("/{id}", h.Detail)
	r.Post("/", h.Create)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.Delete)
	r.Post("/bulk", h.BulkCreate)
	r.Put("/{id}/jilid", h.UpdateJilid)
	r.Put("/{id}/order", h.UpdateOrder)
	r.Post("/move-class", h.MoveClass)
	r.Post("/{id}/archive", h.Archive)
	r.Post("/{id}/restore", h.Restore)
	r.Get("/{id}/transfer-destinations", h.TransferDestinations)

	return r
}

// Columns a client may set on create.
var santriInsertable = map[string]bool{
	"nomor_induk_qiroati": true, "nama_lengkap": true, "nama_panggilan": true,
	"kategori": true, "jenis_kelamin": true, "tanggal_lahir": true, "tempat_lahir": true,
	"alamat": true, "no_hp_ortu": true, "foto_url": true, "avatar_path": true,
	"rfid_tag": true, "current_class_id": true, "sesi_mengaji": true, "jilid": true,
	"tanggal_pendaftaran": true, "nama_ayah": true, "nama_ibu": true, "no_kk": true,
	"no_nik": true, "berkas_foto": true, "berkas_akta": true, "berkas_kk": true,
	"berkas_form": true, "link_qiroati": true, "default_spp_amount": true,
	"status": true, "points": true, "order_in_class": true, "password": true,
	"email": true,
}

// santriCreatable is santriInsertable plus id, which insertSantriTx sets itself
// from the freshly created auth_users row. id stays out of santriInsertable so
// the shared Update path can never rewrite a primary key.
var santriCreatable = func() map[string]bool {
	m := make(map[string]bool, len(santriInsertable)+1)
	for k, v := range santriInsertable {
		m[k] = v
	}
	m["id"] = true
	return m
}()

// Fields a santri may edit on their own record.
var santriSelfEditable = map[string]bool{
	"nama_panggilan": true, "no_hp_ortu": true, "alamat": true,
}

// GET /api/santri
func (h *SantriHandler) List(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	role := middleware.RoleFromCtx(ctx)
	userID := middleware.UserIDFromCtx(ctx)

	limit, offset := paginate(r)

	where := []string{}
	args := []any{}
	add := func(cond string, val any) {
		args = append(args, val)
		where = append(where, fmt.Sprintf(cond, len(args)))
	}

	if status := r.URL.Query().Get("status"); status != "" {
		add("s.status = $%d", status)
	}
	if kategori := r.URL.Query().Get("kategori"); kategori != "" {
		add("s.kategori ILIKE $%d", kategori)
	}
	// kategori_in accepts a comma list and matches case-insensitively, which is
	// what the santri tabs need ("Anak,TPQ" and friends live in the data as
	// mixed case).
	if list := strings.TrimSpace(r.URL.Query().Get("kategori_in")); list != "" {
		add("lower(s.kategori) = ANY($%d)", lowerAll(strings.Split(list, ",")))
	}
	if jilid := r.URL.Query().Get("jilid"); jilid != "" {
		add("s.jilid = $%d", jilid)
	}
	switch r.URL.Query().Get("rfid") {
	case "assigned":
		where = append(where, "(s.rfid_tag IS NOT NULL AND s.rfid_tag <> '')")
	case "unassigned":
		where = append(where, "(s.rfid_tag IS NULL OR s.rfid_tag = '')")
	}
	if excl := r.URL.Query().Get("exclude_kategori"); excl != "" {
		add("(s.kategori IS NULL OR s.kategori <> $%d)", excl)
	}
	if classID := r.URL.Query().Get("class_id"); classID != "" {
		add("s.current_class_id = $%d", classID)
	}
	if ids := strings.TrimSpace(r.URL.Query().Get("class_ids")); ids != "" {
		add("s.current_class_id = ANY($%d)", strings.Split(ids, ","))
	}
	if sesi := strings.TrimSpace(r.URL.Query().Get("sesi")); sesi != "" {
		add("s.sesi_mengaji = ANY($%d)", strings.Split(sesi, ","))
	}
	if r.URL.Query().Get("active_only") == "true" {
		where = append(where,
			"(s.status IS NULL OR s.status ILIKE 'aktif' OR s.status ILIKE 'active')")
	}
	// Archived santri keep their row with deleted_at set. They stay hidden unless
	// the caller opts in, so the archive dialog is the only screen that sees them.
	if r.URL.Query().Get("not_deleted") == "true" ||
		r.URL.Query().Get("include_archived") != "true" {
		where = append(where, "s.deleted_at IS NULL")
	}
	if search := strings.TrimSpace(r.URL.Query().Get("search")); search != "" {
		args = append(args, "%"+search+"%")
		i := len(args)
		where = append(where, fmt.Sprintf(
			"(s.nama_lengkap ILIKE $%d OR s.nomor_induk_qiroati ILIKE $%d "+
				"OR s.nama_panggilan ILIKE $%d OR s.nama_ayah ILIKE $%d "+
				"OR s.rfid_tag ILIKE $%d)", i, i, i, i, i))
	}

	// Authz scoping.
	switch role {
	case "admin":
		// full access
	case "pentashih":
		// Pentashih review santri lintas kelas, jadi aksesnya baca-penuh —
		// sama dengan policy santri_pentashih_select di migrasi
		// 20260725000100_pentashih_full_read_access_rls.sql.
	case "guru":
		args = append(args, userID)
		i := len(args)
		where = append(where, fmt.Sprintf(
			"(s.current_class_id IN (SELECT id FROM classes WHERE id_guru = $%d) "+
				"OR s.id IN (SELECT cm.santri_id FROM class_memberships cm "+
				"JOIN classes c ON c.id = cm.class_id WHERE c.id_guru = $%d AND cm.status = 'active'))", i, i))
	case "santri":
		add("s.id = $%d", userID)
	default:
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	whereSQL := ""
	if len(where) > 0 {
		whereSQL = " WHERE " + strings.Join(where, " AND ")
	}

	// Total row count for the same filters, so the client can paginate.
	var total int
	if err := h.db.QueryRow(ctx,
		"SELECT count(*) FROM santri s"+whereSQL, args...).Scan(&total); err != nil {
		jsonError(w, "gagal menghitung data santri", http.StatusInternalServerError)
		return
	}

	// Sort column comes from a whitelist — never interpolate a raw query value
	// into ORDER BY.
	orderBy := " ORDER BY s.order_in_class NULLS LAST, s.nama_lengkap"
	switch r.URL.Query().Get("order") {
	case "nama":
		orderBy = " ORDER BY s.nama_lengkap"
	case "nama_lengkap", "tanggal_pendaftaran", "jenis_kelamin", "jilid", "sesi_mengaji", "points":
		dir := "ASC"
		if strings.EqualFold(r.URL.Query().Get("direction"), "desc") {
			dir = "DESC"
		}
		orderBy = fmt.Sprintf(" ORDER BY s.%s %s NULLS LAST",
			r.URL.Query().Get("order"), dir)
	}
	query := "SELECT s.* FROM santri s" + whereSQL + orderBy
	args = append(args, limit, offset)
	query += fmt.Sprintf(" LIMIT $%d OFFSET $%d", len(args)-1, len(args))

	rows, err := h.db.Query(ctx, query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil data santri", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca data santri", http.StatusInternalServerError)
		return
	}
	w.Header().Set("X-Total-Count", strconv.Itoa(total))
	jsonData(w, items)
}

// GET /api/santri/{id}
func (h *SantriHandler) Detail(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	role := middleware.RoleFromCtx(ctx)
	userID := middleware.UserIDFromCtx(ctx)

	if role == "santri" && userID != id {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	rows, err := h.db.Query(ctx, `
		SELECT s.*,
		       c.id AS class_id, c.nama_kelas AS class_nama, c.sesi AS class_sesi,
		       c.kategori AS class_kategori, c.id_guru AS class_id_guru,
		       g.nama AS class_guru_nama
		FROM santri s
		LEFT JOIN classes c ON c.id = s.current_class_id
		LEFT JOIN guru g ON g.id = c.id_guru
		WHERE s.id = $1
	`, id)
	if err != nil {
		jsonError(w, "gagal mengambil data santri", http.StatusInternalServerError)
		return
	}
	item, err := pgx.CollectExactlyOneRow(rows, rowToMap)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "santri tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca data santri", http.StatusInternalServerError)
		return
	}

	// Guru may only read santri in their own class.
	if role == "guru" && !h.guruOwnsSantri(ctx, userID, id) {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	jsonData(w, item)
}

// POST /api/santri
func (h *SantriHandler) Create(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	item, err := h.insertSantri(r.Context(), body)
	if err != nil {
		jsonError(w, "gagal membuat santri: "+err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonData(w, item)
}

// POST /api/santri/bulk
func (h *SantriHandler) BulkCreate(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	var body []map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if len(body) == 0 {
		jsonError(w, "data kosong", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin(r.Context())
	if err != nil {
		jsonError(w, "gagal memulai transaksi", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())

	created := make([]map[string]any, 0, len(body))
	for _, rec := range body {
		// insertSantriTx also creates the auth_users + user_profiles rows that
		// santri.id references, and hashes the password itself.
		item, err := insertSantriTx(r.Context(), tx, rec)
		if err != nil {
			jsonError(w, "gagal menyisipkan santri: "+err.Error(), http.StatusBadRequest)
			return
		}
		created = append(created, item)
	}
	if err := tx.Commit(r.Context()); err != nil {
		jsonError(w, "gagal menyimpan data", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonData(w, created)
}

// PUT /api/santri/{id}
func (h *SantriHandler) Update(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	role := middleware.RoleFromCtx(ctx)
	userID := middleware.UserIDFromCtx(ctx)

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	allowed := santriInsertable
	switch role {
	case "admin":
		// full field access
	case "santri":
		if userID != id {
			jsonError(w, "forbidden", http.StatusForbidden)
			return
		}
		allowed = santriSelfEditable
	default:
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	if err := hashPasswordField(body); err != nil {
		jsonError(w, "gagal memproses password", http.StatusInternalServerError)
		return
	}

	item, err := updateRow(ctx, h.db, "santri", id, body, allowed)
	if err != nil {
		if errors.Is(err, errNoFields) {
			jsonError(w, "tidak ada field yang bisa diperbarui", http.StatusBadRequest)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "santri tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal memperbarui santri: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonData(w, item)
}

// DELETE /api/santri/{id} — soft delete.
func (h *SantriHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id := chi.URLParam(r, "id")
	ct, err := h.db.Exec(r.Context(), `UPDATE santri SET status = 'Nonaktif' WHERE id = $1`, id)
	if err != nil {
		jsonError(w, "gagal menonaktifkan santri", http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		jsonError(w, "santri tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonData(w, map[string]any{"id": id, "status": "Nonaktif"})
}

// GET /api/santri/count — public.
func (h *SantriHandler) Count(w http.ResponseWriter, r *http.Request) {
	var total int
	err := h.db.QueryRow(r.Context(),
		`SELECT COUNT(*) FROM santri WHERE status = 'Aktif'`).Scan(&total)
	if err != nil {
		jsonError(w, "gagal menghitung santri", http.StatusInternalServerError)
		return
	}
	jsonData(w, map[string]int{"total": total})
}

// PUT /api/santri/{id}/jilid
func (h *SantriHandler) UpdateJilid(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	role := middleware.RoleFromCtx(ctx)
	if role != "admin" && role != "guru" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromCtx(ctx)

	var body struct {
		Jilid string `json:"jilid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Jilid) == "" {
		jsonError(w, "jilid wajib diisi", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		jsonError(w, "gagal memulai transaksi", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	var fromJilid *string
	err = tx.QueryRow(ctx, `SELECT jilid FROM santri WHERE id = $1`, id).Scan(&fromJilid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "santri tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca jilid saat ini", http.StatusInternalServerError)
		return
	}

	if _, err := tx.Exec(ctx, `UPDATE santri SET jilid = $1 WHERE id = $2`, body.Jilid, id); err != nil {
		jsonError(w, "gagal memperbarui jilid", http.StatusInternalServerError)
		return
	}
	if err := insertJilidHistoryTx(ctx, tx, id, fromJilid, body.Jilid, userID); err != nil {
		jsonError(w, "gagal mencatat riwayat jilid", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		jsonError(w, "gagal menyimpan perubahan", http.StatusInternalServerError)
		return
	}
	jsonData(w, map[string]any{"id": id, "jilid": body.Jilid})
}

// PUT /api/santri/{id}/order
func (h *SantriHandler) UpdateOrder(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id := chi.URLParam(r, "id")
	var body struct {
		OrderInClass int `json:"order_in_class"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	ct, err := h.db.Exec(r.Context(),
		`UPDATE santri SET order_in_class = $1 WHERE id = $2`, body.OrderInClass, id)
	if err != nil {
		jsonError(w, "gagal memperbarui urutan", http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		jsonError(w, "santri tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonData(w, map[string]any{"id": id, "order_in_class": body.OrderInClass})
}

// POST /api/santri/move-class
func (h *SantriHandler) MoveClass(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	role := middleware.RoleFromCtx(ctx)
	if role != "admin" && role != "guru" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	userID := middleware.UserIDFromCtx(ctx)

	var body struct {
		SantriID      string `json:"santri_id"`
		TargetClassID string `json:"target_class_id"`
		Reason        string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.SantriID == "" || body.TargetClassID == "" {
		jsonError(w, "santri_id dan target_class_id wajib diisi", http.StatusBadRequest)
		return
	}

	tx, err := h.db.Begin(ctx)
	if err != nil {
		jsonError(w, "gagal memulai transaksi", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	var fromClass *string
	err = tx.QueryRow(ctx, `SELECT current_class_id FROM santri WHERE id = $1`, body.SantriID).Scan(&fromClass)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "santri tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca kelas saat ini", http.StatusInternalServerError)
		return
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO class_mutations (santri_id, from_class_id, to_class_id, reason, created_by, mutation_date)
		VALUES ($1, $2, $3, $4, $5, now())
	`, body.SantriID, fromClass, body.TargetClassID, body.Reason, userID); err != nil {
		jsonError(w, "gagal mencatat mutasi kelas", http.StatusInternalServerError)
		return
	}
	if _, err := tx.Exec(ctx,
		`UPDATE santri SET current_class_id = $1 WHERE id = $2`,
		body.TargetClassID, body.SantriID); err != nil {
		jsonError(w, "gagal memindahkan santri", http.StatusInternalServerError)
		return
	}
	if err := tx.Commit(ctx); err != nil {
		jsonError(w, "gagal menyimpan mutasi", http.StatusInternalServerError)
		return
	}
	jsonData(w, map[string]any{
		"santri_id":     body.SantriID,
		"from_class_id": fromClass,
		"to_class_id":   body.TargetClassID,
	})
}

func (h *SantriHandler) insertSantri(ctx context.Context, body map[string]any) (map[string]any, error) {
	tx, err := h.db.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	item, err := insertSantriTx(ctx, tx, body)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return item, nil
}

// insertSantriTx creates the auth_users row, the user_profiles role row, and the
// santri profile. santri.id is a FK onto auth_users(id), so the identity row has
// to exist first — this is the local replacement for what Supabase Auth used to
// do out-of-band in the manage-user edge function.
func insertSantriTx(ctx context.Context, tx pgx.Tx, body map[string]any) (map[string]any, error) {
	profile := make(map[string]any, len(body)+1)
	for k, v := range body {
		profile[k] = v
	}

	// Santri log in with nomor_induk_qiroati; default the password to it so a new
	// account is usable immediately. Login self-heals the hash on first use.
	if _, ok := profile["password"]; !ok {
		if nomor := strings.TrimSpace(asString(profile["nomor_induk_qiroati"])); nomor != "" {
			profile["password"] = nomor
		}
	}
	if err := hashPasswordField(profile); err != nil {
		return nil, err
	}

	email := strings.ToLower(strings.TrimSpace(asString(profile["email"])))
	var emailArg any
	if email != "" {
		emailArg = email
	}

	var newID string
	if err := tx.QueryRow(ctx,
		`INSERT INTO auth_users (email) VALUES ($1) RETURNING id`, emailArg).Scan(&newID); err != nil {
		return nil, err
	}

	displayName := strings.TrimSpace(asString(profile["nama_lengkap"]))
	if _, err := tx.Exec(ctx, `
		INSERT INTO user_profiles (id, role, display_name, email, status)
		VALUES ($1, 'santri'::app_role, $2, $3, 'active')
	`, newID, displayName, emailArg); err != nil {
		return nil, err
	}

	profile["id"] = newID
	return insertRowTx(ctx, tx, "santri", profile, santriCreatable)
}

func (h *SantriHandler) guruOwnsSantri(ctx context.Context, guruID, santriID string) bool {
	var exists bool
	err := h.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM santri s
			WHERE s.id = $1 AND (
				s.current_class_id IN (SELECT id FROM classes WHERE id_guru = $2)
				OR s.id IN (SELECT cm.santri_id FROM class_memberships cm
					JOIN classes c ON c.id = cm.class_id
					WHERE c.id_guru = $2 AND cm.status = 'active')
			)
		)
	`, santriID, guruID).Scan(&exists)
	return err == nil && exists
}

// GET /api/santri/by-rfid/{rfid} — kiosk scan lookup.
func (h *SantriHandler) ByRFID(w http.ResponseWriter, r *http.Request) {
	if middleware.RoleFromCtx(r.Context()) == "" {
		jsonError(w, "unauthorized", http.StatusUnauthorized)
		return
	}
	rfid := chi.URLParam(r, "rfid")
	rows, err := h.db.Query(r.Context(), `
		SELECT s.*,
		       c.id AS class_id, c.nama_kelas AS class_nama, c.sesi AS class_sesi,
		       c.kategori AS class_kategori, c.id_guru AS class_id_guru,
		       c.is_active AS class_is_active,
		       g.nama AS class_guru_nama
		FROM santri s
		LEFT JOIN classes c ON c.id = s.current_class_id
		LEFT JOIN guru g ON g.id = c.id_guru
		WHERE s.rfid_tag = $1
	`, rfid)
	if err != nil {
		jsonError(w, "gagal mencari santri", http.StatusInternalServerError)
		return
	}
	item, err := pgx.CollectExactlyOneRow(rows, rowToMap)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "santri dengan rfid tersebut tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca data santri", http.StatusInternalServerError)
		return
	}
	jsonData(w, item)
}

// POST /api/santri/{id}/archive — port of set_santri_archive_state(archived=true).
// Archiving never deletes: class, attendance, payment, hafalan, character, and
// mutation rows all stay, only the account is deactivated.
func (h *SantriHandler) Archive(w http.ResponseWriter, r *http.Request) {
	h.setArchiveState(w, r, true)
}

// POST /api/santri/{id}/restore — port of set_santri_archive_state(archived=false).
func (h *SantriHandler) Restore(w http.ResponseWriter, r *http.Request) {
	h.setArchiveState(w, r, false)
}

func (h *SantriHandler) setArchiveState(w http.ResponseWriter, r *http.Request, archived bool) {
	ctx := r.Context()
	if middleware.RoleFromCtx(ctx) != "admin" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	id := chi.URLParam(r, "id")
	actor := middleware.UserIDFromCtx(ctx)

	var body struct {
		Reason string `json:"reason"`
	}
	// Restore sends no body; an unreadable body is not an error here.
	json.NewDecoder(r.Body).Decode(&body)
	reason := strings.TrimSpace(body.Reason)

	tx, err := h.db.Begin(ctx)
	if err != nil {
		jsonError(w, "gagal memulai transaksi", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(ctx)

	status := "Aktif"
	profileStatus := "active"
	var reasonArg, archivedBy any
	if archived {
		status = "Nonaktif"
		profileStatus = "inactive"
		if reason != "" {
			reasonArg = reason
		}
		archivedBy = actor
	}

	var currentClassID *string
	err = tx.QueryRow(ctx, `
		UPDATE santri SET
			status = $2,
			deleted_at = CASE WHEN $3 THEN COALESCE(deleted_at, now()) ELSE NULL END,
			archive_reason = $4,
			archived_by = $5,
			updated_by = $6,
			updated_at = now()
		WHERE id = $1
		RETURNING current_class_id
	`, id, status, archived, reasonArg, archivedBy, actor).Scan(&currentClassID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "data santri tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal memperbarui status santri", http.StatusInternalServerError)
		return
	}

	if _, err := tx.Exec(ctx, `
		UPDATE user_profiles
		SET status = $2::account_status, updated_by = $3, updated_at = now()
		WHERE id = $1
	`, id, profileStatus, actor); err != nil {
		jsonError(w, "gagal memperbarui akun santri", http.StatusInternalServerError)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		jsonError(w, "gagal menyimpan perubahan arsip", http.StatusInternalServerError)
		return
	}

	jsonData(w, map[string]any{
		"santri_id":        id,
		"archived":         archived,
		"account_status":   status,
		"current_class_id": currentClassID,
	})
}

// GET /api/santri/{id}/transfer-destinations — port of
// list_guru_transfer_destinations. Guru may only ask about santri in their own
// class; destinations are limited to active classes of the same kategori.
func (h *SantriHandler) TransferDestinations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	role := middleware.RoleFromCtx(ctx)
	userID := middleware.UserIDFromCtx(ctx)
	id := chi.URLParam(r, "id")

	if role != "admin" && role != "guru" {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}
	if role == "guru" && !h.guruOwnsSantri(ctx, userID, id) {
		jsonError(w, "santri ini tidak berada di kelas Anda", http.StatusForbidden)
		return
	}

	var kategori *string
	err := h.db.QueryRow(ctx, `
		SELECT kategori FROM santri
		WHERE id = $1 AND lower(COALESCE(status, '')) IN ('aktif', 'active')
	`, id).Scan(&kategori)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "santri aktif tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca data santri", http.StatusInternalServerError)
		return
	}

	rows, err := h.db.Query(ctx, `
		SELECT c.id, c.nama_kelas, c.id_guru, g.nama AS guru_nama,
		       c.sesi, c.kategori, c.sort_order
		FROM classes c
		LEFT JOIN guru g ON g.id = c.id_guru
		WHERE c.is_active IS TRUE
		  AND c.deleted_at IS NULL
		  AND lower(COALESCE(c.kategori, '')) = lower(COALESCE($1, ''))
		ORDER BY c.sort_order ASC NULLS LAST, c.nama_kelas ASC
	`, kategori)
	if err != nil {
		jsonError(w, "gagal mengambil kelas tujuan", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca kelas tujuan", http.StatusInternalServerError)
		return
	}
	jsonData(w, items)
}

// ---- shared helpers (package handler) ----

var errNoFields = errors.New("no updatable fields")

// lowerAll trims and lowercases each entry so a comma-separated filter can be
// matched case-insensitively against lower(column) = ANY(...).
func lowerAll(values []string) []string {
	out := make([]string, 0, len(values))
	for _, v := range values {
		if t := strings.TrimSpace(v); t != "" {
			out = append(out, strings.ToLower(t))
		}
	}
	return out
}

// hashPasswordField bcrypts body["password"] in place so a plaintext value can
// never reach the DB via insertRow/updateRow. An empty or blank password is
// dropped entirely — callers that want to clear a login send password: null.
func hashPasswordField(body map[string]any) error {
	raw, ok := body["password"]
	if !ok {
		return nil
	}
	plain, ok := raw.(string)
	if !ok || strings.TrimSpace(plain) == "" {
		// null (clear login) stays as-is; blank string is meaningless — drop it.
		if raw != nil {
			delete(body, "password")
		}
		return nil
	}
	hashed, err := auth.HashPassword(plain)
	if err != nil {
		return err
	}
	body["password"] = hashed
	return nil
}

// paginate reads page (default 0) and limit (default 50, max 200) and returns
// limit + offset. jsonData lives in academic.go; parsePagination in attendance.go.
func paginate(r *http.Request) (limit, offset int) {
	limit = 50
	page := 0
	if v := r.URL.Query().Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}
	if limit > 200 {
		limit = 200
	}
	if v := r.URL.Query().Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			page = n
		}
	}
	return limit, page * limit
}

type querier interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}

// rowToMap is pgx.RowToMap plus uuid normalization. Use it everywhere instead of
// pgx.RowToMap directly.
//
// pgx decodes a uuid column into [16]byte when the destination is `any`, which is
// what RowToMap uses. encoding/json then renders that as a 16-number array, so
// every id came back as "id":[209,15,90,...] instead of "id":"d10f5aca-...". The
// responses were still HTTP 200, which is why this survived: the frontend takes
// those ids straight into request URLs (DELETE /api/login-logs/{id}), so the reads
// looked healthy while the ids were unusable.
//
// Fixing it here rather than on the connection is deliberate. Swapping pgx's uuid
// codec for TextCodec also flips the *parameter* wire format, which breaks every
// `uuid = ANY($1)` query with "improper binary format in array element 1" — the
// text[] no longer matches uuid[]. Normalizing the decoded map leaves parameter
// encoding untouched.
func rowToMap(row pgx.CollectableRow) (map[string]any, error) {
	m, err := pgx.RowToMap(row)
	if err != nil {
		return nil, err
	}
	for k, v := range m {
		if b, ok := v.([16]byte); ok {
			m[k] = uuidString(b)
		}
	}
	return m, nil
}

// uuidString formats raw uuid bytes as 8-4-4-4-12 hex.
func uuidString(b [16]byte) string {
	const hexDigits = "0123456789abcdef"
	out := make([]byte, 0, 36)
	for i, c := range b {
		if i == 4 || i == 6 || i == 8 || i == 10 {
			out = append(out, '-')
		}
		out = append(out, hexDigits[c>>4], hexDigits[c&0x0f])
	}
	return string(out)
}

// insertRow builds a whitelisted INSERT ... RETURNING * and returns the row as a map.
func insertRow(ctx context.Context, q querier, table string, data map[string]any, allowed map[string]bool) (map[string]any, error) {
	sqlStr, args, err := buildInsert(table, data, allowed)
	if err != nil {
		return nil, err
	}
	rows, err := q.Query(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectExactlyOneRow(rows, rowToMap)
}

func insertRowTx(ctx context.Context, tx pgx.Tx, table string, data map[string]any, allowed map[string]bool) (map[string]any, error) {
	return insertRow(ctx, tx, table, data, allowed)
}

func buildInsert(table string, data map[string]any, allowed map[string]bool) (string, []any, error) {
	cols := make([]string, 0, len(data))
	for k := range data {
		if allowed[k] {
			cols = append(cols, k)
		}
	}
	if len(cols) == 0 {
		return "", nil, errNoFields
	}
	sort.Strings(cols)
	placeholders := make([]string, len(cols))
	args := make([]any, len(cols))
	for i, c := range cols {
		placeholders[i] = fmt.Sprintf("$%d", i+1)
		args[i] = data[c]
	}
	sqlStr := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s) RETURNING *",
		table, strings.Join(cols, ", "), strings.Join(placeholders, ", "))
	return sqlStr, args, nil
}

// updateRow builds a whitelisted partial UPDATE ... RETURNING * and returns the row as a map.
func updateRow(ctx context.Context, q querier, table, id string, data map[string]any, allowed map[string]bool) (map[string]any, error) {
	cols := make([]string, 0, len(data))
	for k := range data {
		if allowed[k] {
			cols = append(cols, k)
		}
	}
	if len(cols) == 0 {
		return nil, errNoFields
	}
	sort.Strings(cols)
	sets := make([]string, len(cols))
	args := make([]any, 0, len(cols)+1)
	for i, c := range cols {
		sets[i] = fmt.Sprintf("%s = $%d", c, i+1)
		args = append(args, data[c])
	}
	args = append(args, id)
	sqlStr := fmt.Sprintf("UPDATE %s SET %s WHERE id = $%d RETURNING *",
		table, strings.Join(sets, ", "), len(args))
	rows, err := q.Query(ctx, sqlStr, args...)
	if err != nil {
		return nil, err
	}
	return pgx.CollectExactlyOneRow(rows, rowToMap)
}
