package handler

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// AcademicHandler menangani hafalan, murojaah, jilid history, dan penilaian karakter santri.
//
// Nama kolom di sini mengikuti skema Supabase yang sudah ada (hafalan_items.item_name,
// hafalan_progress.item_id, murojaah_submissions, santri_character_*), bukan skema
// baru — tabelnya sudah berisi data produksi dan migrasinya immutable.
type AcademicHandler struct {
	db *pgxpool.Pool
}

func NewAcademicHandler(db *pgxpool.Pool) *AcademicHandler {
	return &AcademicHandler{db: db}
}

// Routes mengembalikan router chi untuk /api/academic.
// Diasumsikan sudah berada di belakang middleware.RequireAuth di main.go.
func (h *AcademicHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Hafalan items
	r.Get("/items", h.ListItems)
	r.With(middleware.RequireRole("admin")).Post("/items", h.CreateItem)
	r.With(middleware.RequireRole("admin")).Put("/items/{id}", h.UpdateItem)

	// Hafalan progress
	r.Get("/progress", h.ListProgress)
	r.Get("/progress/summary/{santri_id}", h.ProgressSummary)
	r.With(middleware.RequireRole("admin", "guru")).Post("/progress", h.UpsertProgress)

	// Murojaah
	r.Get("/murojah", h.ListMurojah)
	r.Post("/murojah", h.SubmitMurojah) // santri submits their own
	// Menilai dan menghapus setoran dijaga DI DALAM handler lewat
	// pastikanBolehMurojah, bukan oleh daftar peran di sini. Daftar lama hanya
	// memuat "admin" dan "guru" — tata usaha dan superadmin tertutup — dan yang
	// lebih penting, daftar peran tidak dapat memeriksa apakah muridnya memang
	// murid guru tersebut.
	r.Put("/murojah/{id}", h.ReviewMurojah)
	r.Delete("/murojah/{id}", h.DeleteMurojah)

	// Jilid history
	r.Get("/jilid-history", h.ListJilidHistoryBatch)
	r.Get("/jilid-history/{santri_id}", h.ListJilidHistory)
	r.With(middleware.RequireRole("admin", "guru")).Post("/jilid-history", h.CreateJilidHistory)

	// Character assessment
	r.Get("/character/items", h.ListCharacterItems)
	r.Get("/character/profile/{santri_id}", h.CharacterProfile)
	r.With(middleware.RequireRole("admin", "guru")).Post("/character/scores", h.UpsertCharacterScore)
	r.With(middleware.RequireRole("admin", "guru")).Post("/character/strengths", h.SetCharacterStrength)
	r.With(middleware.RequireRole("admin", "guru")).Post("/character/behavior", h.RecordBehavior)
	r.With(middleware.RequireRole("admin", "guru")).Put("/character/behavior/{id}", h.UpdateBehavior)

	// Notes
	r.Get("/notes", h.ListNotes)
	r.With(middleware.RequireRole("admin", "guru")).Post("/notes", h.AddNote)
	r.With(middleware.RequireRole("admin", "guru")).Put("/notes/{id}", h.UpdateNote)

	return r
}

// ---------- Hafalan items ----------

var hafalanItemEditable = map[string]bool{
	"program_scope": true, "category": true, "jilid": true,
	"item_order": true, "item_name": true, "is_active": true,
}

func (h *AcademicHandler) ListItems(w http.ResponseWriter, r *http.Request) {
	where := []string{}
	args := []any{}
	add := func(clause string, val any) {
		args = append(args, val)
		where = append(where, clause+" = $"+itoa(len(args)))
	}

	if v := r.URL.Query().Get("jilid"); v != "" {
		add("jilid", v)
	}
	if v := r.URL.Query().Get("category"); v != "" {
		add("category", v)
	}
	if v := r.URL.Query().Get("program_scope"); v != "" {
		add("program_scope", v)
	}
	if v := r.URL.Query().Get("is_active"); v != "" {
		add("is_active", v == "true")
	}

	q := `SELECT id, program_scope, category, jilid, item_name, item_order, is_active
	      FROM hafalan_items`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY program_scope, category, jilid, item_order"

	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		jsonError(w, "gagal memuat item hafalan", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca item hafalan", http.StatusInternalServerError)
		return
	}
	jsonData(w, items)
}

func (h *AcademicHandler) CreateItem(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(asString(body["item_name"])) == "" {
		jsonError(w, "item_name wajib diisi", http.StatusBadRequest)
		return
	}
	item, err := insertRow(r.Context(), h.db, "hafalan_items", body, hafalanItemEditable)
	if err != nil {
		jsonError(w, "gagal membuat item hafalan: "+err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonData(w, item)
}

func (h *AcademicHandler) UpdateItem(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	item, err := updateRow(r.Context(), h.db, "hafalan_items", id, body, hafalanItemEditable)
	if err != nil {
		if errors.Is(err, errNoFields) {
			jsonError(w, "tidak ada field yang bisa diperbarui", http.StatusBadRequest)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "item hafalan tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal memperbarui item hafalan: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonData(w, item)
}

// ---------- Hafalan progress ----------

// GET /api/academic/progress?santri_ids=a,b,c
// Without santri_ids a santri gets their own rows, guru/admin get everything in
// their scope — the guru dashboard loads the whole roster's progress at once.
func (h *AcademicHandler) ListProgress(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	role := middleware.RoleFromCtx(ctx)
	userID := middleware.UserIDFromCtx(ctx)

	where := []string{}
	args := []any{}

	if ids := strings.TrimSpace(r.URL.Query().Get("santri_ids")); ids != "" {
		args = append(args, strings.Split(ids, ","))
		where = append(where, "hp.santri_id = ANY($"+itoa(len(args))+")")
	} else if id := r.URL.Query().Get("santri_id"); id != "" {
		args = append(args, id)
		where = append(where, "hp.santri_id = $"+itoa(len(args)))
	}

	// A santri may only ever read their own progress, whatever they asked for.
	if role == "santri" {
		args = append(args, userID)
		where = append(where, "hp.santri_id = $"+itoa(len(args)))
	}

	q := `SELECT hp.id, hp.santri_id, hp.item_id, hp.category, hp.item_name,
	             hp.status, hp.score, hp.catatan AS notes, hp.assessed_by, hp.assessed_at,
	             hp.updated_at, hi.jilid, hi.item_order, hi.program_scope
	      FROM hafalan_progress hp
	      LEFT JOIN hafalan_items hi ON hi.id = hp.item_id`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY hi.jilid NULLS LAST, hi.item_order NULLS LAST"

	rows, err := h.db.Query(ctx, q, args...)
	if err != nil {
		jsonError(w, "gagal memuat progress hafalan", http.StatusInternalServerError)
		return
	}
	out, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca progress hafalan", http.StatusInternalServerError)
		return
	}
	jsonData(w, out)
}

// POST /api/academic/progress — upsert one santri's score for one item.
// hafalan_progress has a *partial* unique index on (santri_id, item_id) WHERE
// item_id IS NOT NULL, so ON CONFLICT can't be relied on for the item_id IS NULL
// case; update-then-insert covers both. A DB trigger derives status from score.
func (h *AcademicHandler) UpsertProgress(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var body struct {
		SantriID   string  `json:"santri_id"`
		ItemID     *string `json:"item_id"`
		Category   string  `json:"category"`
		ItemName   string  `json:"item_name"`
		Score      int     `json:"score"`
		Status     string  `json:"status"`
		Notes      *string `json:"notes"`
		AssessedAt any     `json:"assessed_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.SantriID == "" {
		jsonError(w, "santri_id wajib diisi", http.StatusBadRequest)
		return
	}
	if body.Score < 1 || body.Score > 4 {
		jsonError(w, "score harus antara 1 dan 4", http.StatusBadRequest)
		return
	}
	// assessed_by always comes from the JWT, never from the request body.
	assessedBy := middleware.UserIDFromCtx(ctx)

	var id string
	err := h.db.QueryRow(ctx, `
		UPDATE hafalan_progress
		SET score = $3, catatan = $4, assessed_by = $5, assessed_at = now(), updated_by = $5
		WHERE santri_id = $1
		  AND ($2::uuid IS NOT NULL AND item_id = $2::uuid
		       OR $2::uuid IS NULL AND item_id IS NULL AND category = $6 AND item_name = $7)
		RETURNING id
	`, body.SantriID, body.ItemID, body.Score, body.Notes, assessedBy,
		body.Category, body.ItemName).Scan(&id)

	if errors.Is(err, pgx.ErrNoRows) {
		err = h.db.QueryRow(ctx, `
			INSERT INTO hafalan_progress
			  (santri_id, item_id, category, item_name, score, catatan,
			   assessed_by, assessed_at, created_by, updated_by)
			VALUES ($1, $2, $3, $4, $5, $6, $7, now(), $7, $7)
			RETURNING id
		`, body.SantriID, body.ItemID, body.Category, body.ItemName,
			body.Score, body.Notes, assessedBy).Scan(&id)
	}
	if err != nil {
		jsonError(w, "gagal menyimpan progress hafalan: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonData(w, map[string]any{"id": id, "santri_id": body.SantriID, "score": body.Score})
}

func (h *AcademicHandler) ProgressSummary(w http.ResponseWriter, r *http.Request) {
	santriID := chi.URLParam(r, "santri_id")
	if role := middleware.RoleFromCtx(r.Context()); role == "santri" &&
		middleware.UserIDFromCtx(r.Context()) != santriID {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT hi.jilid,
		       COUNT(*) AS total,
		       COUNT(*) FILTER (WHERE hp.status = 'lulus') AS lulus
		FROM hafalan_items hi
		LEFT JOIN hafalan_progress hp ON hp.item_id = hi.id AND hp.santri_id = $1
		WHERE hi.is_active = true
		GROUP BY hi.jilid
		ORDER BY hi.jilid
	`, santriID)
	if err != nil {
		jsonError(w, "gagal memuat ringkasan hafalan", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var jilid *string
		var total, lulus int
		if err := rows.Scan(&jilid, &total, &lulus); err != nil {
			jsonError(w, "gagal membaca ringkasan hafalan", http.StatusInternalServerError)
			return
		}
		pct := 0.0
		if total > 0 {
			pct = float64(lulus) / float64(total) * 100
		}
		out = append(out, map[string]any{
			"jilid": jilid, "total": total, "lulus": lulus, "completion_percentage": pct,
		})
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "gagal membaca ringkasan hafalan", http.StatusInternalServerError)
		return
	}
	jsonData(w, out)
}

// ---------- Murojaah ----------

// GET /api/academic/murojah — scoped by role: a santri sees only their own
// submissions, a guru sees the santri in their classes, admin sees everything.
func (h *AcademicHandler) ListMurojah(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	role := middleware.RoleFromCtx(ctx)
	userID := middleware.UserIDFromCtx(ctx)

	where := []string{}
	args := []any{}

	if id := r.URL.Query().Get("santri_id"); id != "" {
		args = append(args, id)
		where = append(where, "ms.santri_id = $"+itoa(len(args)))
	}
	// CanManage, bukan daftar peran manual — lihat catatan pada santri.go List:
	// daftar manual di sini juga hanya memuat "admin", jadi tata usaha dan
	// superadmin menerima 403.
	switch {
	case middleware.CanManage(role):
	case role == "guru":
		args = append(args, userID)
		i := itoa(len(args))
		where = append(where,
			"(ms.target_guru_id = $"+i+" OR s.current_class_id IN "+
				"(SELECT id FROM classes WHERE id_guru = $"+i+"))")
	case role == "santri":
		args = append(args, userID)
		where = append(where, "ms.santri_id = $"+itoa(len(args)))
	default:
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	q := `SELECT ms.id, ms.santri_id, ms.target_guru_id, ms.type, ms.content,
	             ms.recording_path, ms.status, ms.feedback, ms.submitted_at,
	             ms.reviewed_at, ms.created_at,
	             s.nama_lengkap AS santri_nama, s.nama_panggilan AS santri_panggilan,
	             s.foto_url AS santri_foto_url, s.jilid AS santri_jilid
	      FROM murojaah_submissions ms
	      JOIN santri s ON s.id = ms.santri_id`
	if len(where) > 0 {
		q += " WHERE " + strings.Join(where, " AND ")
	}
	q += " ORDER BY ms.created_at DESC"

	rows, err := h.db.Query(ctx, q, args...)
	if err != nil {
		jsonError(w, "gagal memuat murojaah", http.StatusInternalServerError)
		return
	}
	list, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca murojaah", http.StatusInternalServerError)
		return
	}

	// The UI reads sub.santri?.nama_lengkap — rebuild the nested shape PostgREST
	// used to embed, then drop the flat aliases.
	for _, row := range list {
		row["santri"] = map[string]any{
			"id":             row["santri_id"],
			"nama_lengkap":   row["santri_nama"],
			"nama_panggilan": row["santri_panggilan"],
			"foto_url":       row["santri_foto_url"],
			"jilid":          row["santri_jilid"],
		}
		delete(row, "santri_nama")
		delete(row, "santri_panggilan")
		delete(row, "santri_foto_url")
		delete(row, "santri_jilid")
	}
	jsonData(w, list)
}

// guruPegangSantri menjawab: apakah guru ini berhak atas murid tersebut?
//
// Dua jalur sah, sama seperti pada kontak wali: menjadi wali kelasnya
// (`classes.id_guru`) atau mengajar di kelasnya menurut `jadwal_pelajaran`.
// Keanggotaan kelas ikut diperiksa supaya roster dan `current_class_id` yang
// sempat berbeda tidak membuat guru kehilangan muridnya sendiri.
func (h *AcademicHandler) guruPegangSantri(ctx context.Context, guruID, santriID string) (bool, error) {
	var ada bool
	err := h.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM santri s
			WHERE s.id = $2 AND (
				s.current_class_id IN (SELECT id FROM classes WHERE id_guru = $1)
				OR s.current_class_id IN (SELECT class_id FROM jadwal_pelajaran WHERE guru_id = $1)
			)
		) OR EXISTS (
			SELECT 1 FROM class_memberships cm
			WHERE cm.santri_id = $2 AND cm.status = 'active' AND (
				cm.class_id IN (SELECT id FROM classes WHERE id_guru = $1)
				OR cm.class_id IN (SELECT class_id FROM jadwal_pelajaran WHERE guru_id = $1)
			)
		)
	`, guruID, santriID).Scan(&ada)
	return ada, err
}

// catatAudit menuliskan satu baris riwayat. Kegagalannya TIDAK membatalkan aksi
// utama — setoran yang sudah tersimpan tidak boleh dianggap gagal hanya karena
// catatannya meleset — tetapi tetap dicatat ke log server agar tidak membisu.
func (h *AcademicHandler) catatAudit(ctx context.Context, submissionID, aksi, aktorID, aktorRole, statusLama, statusBaru string, dataLama any) {
	var aktor any
	if aktorID != "" {
		aktor = aktorID
	}
	var lama, baru any
	if statusLama != "" {
		lama = statusLama
	}
	if statusBaru != "" {
		baru = statusBaru
	}
	if _, err := h.db.Exec(ctx, `
		INSERT INTO murojaah_audit
		  (submission_id, aksi, aktor_id, aktor_role, status_lama, status_baru, data_lama)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, submissionID, aksi, aktor, aktorRole, lama, baru, dataLama); err != nil {
		log.Printf("catatAudit murojaah (%s %s): %v", aksi, submissionID, err)
	}
}

// murojahBaris mengambil pemilik dan status sebuah setoran, plus salinan penuh
// barisnya untuk disimpan ke audit sebelum diubah atau dihapus.
func (h *AcademicHandler) murojahBaris(ctx context.Context, id string) (santriID, status string, snapshot []byte, err error) {
	err = h.db.QueryRow(ctx, `
		SELECT santri_id, status, to_jsonb(ms) FROM murojaah_submissions ms WHERE id = $1
	`, id).Scan(&santriID, &status, &snapshot)
	return
}

// pastikanBolehMurojah menjaga tulis pada satu setoran: back-office bebas, guru
// hanya untuk muridnya sendiri, selain itu ditolak.
func (h *AcademicHandler) pastikanBolehMurojah(ctx context.Context, santriID string) (string, int) {
	role := middleware.RoleFromCtx(ctx)
	user := middleware.UserIDFromCtx(ctx)

	if middleware.CanManage(role) {
		return "", 0
	}
	if role != "guru" || user == "" {
		return "hanya guru pengampu, admin, atau tata usaha yang dapat mengelola setoran", http.StatusForbidden
	}
	boleh, err := h.guruPegangSantri(ctx, user, santriID)
	if err != nil {
		return "gagal memeriksa kelas murid", http.StatusInternalServerError
	}
	if !boleh {
		return "murid ini bukan murid di kelas yang Anda pegang", http.StatusForbidden
	}
	return "", 0
}

func (h *AcademicHandler) SubmitMurojah(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	role := middleware.RoleFromCtx(ctx)
	userID := middleware.UserIDFromCtx(ctx)

	var body struct {
		SantriID      string  `json:"santri_id"`
		TargetGuruID  *string `json:"target_guru_id"`
		Type          string  `json:"type"`
		Content       string  `json:"content"`
		RecordingPath *string `json:"recording_path"`
		Status        string  `json:"status"`
		Feedback      *string `json:"feedback"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	// A santri can only submit for themselves.
	if role == "santri" {
		body.SantriID = userID
	}
	if body.SantriID == "" {
		jsonError(w, "santri_id wajib diisi", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(body.Content) == "" {
		jsonError(w, "content wajib diisi", http.StatusBadRequest)
		return
	}

	// Guru mencatatkan setoran atas nama murid — hanya boleh untuk murid di kelas
	// yang dipegangnya. Tanpa ini seorang guru dapat mencatatkan penilaian pada
	// murid mana pun cukup dengan mengetahui id-nya.
	if role != "santri" {
		if msg, code := h.pastikanBolehMurojah(ctx, body.SantriID); msg != "" {
			jsonError(w, msg, code)
			return
		}
	}

	// Setoran yang dicatat guru sudah dinilai di tempat, jadi statusnya boleh
	// langsung terisi. Murid selalu masuk sebagai 'menunggu'.
	status := "menunggu"
	if role != "santri" && body.Status != "" {
		switch body.Status {
		case "menunggu", "direview", "diterima", "perlu_perbaikan":
			status = body.Status
		default:
			jsonError(w, "status murojaah tidak valid", http.StatusBadRequest)
			return
		}
	}

	// Guru yang mencatat sekaligus menjadi penilainya, kecuali klien menyebut lain.
	target := body.TargetGuruID
	if target == nil && role == "guru" && userID != "" {
		target = &userID
	}

	var reviewedAt any
	if status != "menunggu" {
		reviewedAt = "now"
	}

	var id string
	err := h.db.QueryRow(ctx, `
		INSERT INTO murojaah_submissions
		  (santri_id, target_guru_id, type, content, recording_path, status, feedback,
		   submitted_at, reviewed_at, created_by, updated_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, now(),
		        CASE WHEN $8::text = 'now' THEN now() ELSE NULL END, $9, $9)
		RETURNING id
	`, body.SantriID, target, body.Type, body.Content,
		body.RecordingPath, status, body.Feedback, reviewedAt, userID).Scan(&id)
	if err != nil {
		jsonError(w, "gagal menyimpan murojaah: "+err.Error(), http.StatusBadRequest)
		return
	}

	h.catatAudit(ctx, id, "buat", userID, role, "", status, nil)

	w.WriteHeader(http.StatusCreated)
	jsonData(w, map[string]any{"id": id})
}

// DELETE /api/academic/murojah/{id}
func (h *AcademicHandler) DeleteMurojah(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	santriID, status, snapshot, err := h.murojahBaris(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "murojaah tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca murojaah", http.StatusInternalServerError)
		return
	}
	if msg, code := h.pastikanBolehMurojah(ctx, santriID); msg != "" {
		jsonError(w, msg, code)
		return
	}

	ct, err := h.db.Exec(ctx, "DELETE FROM murojaah_submissions WHERE id = $1", id)
	if err != nil {
		jsonError(w, "gagal menghapus murojaah", http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		jsonError(w, "murojaah tidak ditemukan", http.StatusNotFound)
		return
	}

	// Dicatat SETELAH baris benar-benar hilang, dengan salinan penuhnya, supaya
	// penghapusan tetap dapat ditelusuri dan dipulihkan bila keliru.
	h.catatAudit(ctx, id, "hapus",
		middleware.UserIDFromCtx(ctx), middleware.RoleFromCtx(ctx),
		status, "", snapshot)

	jsonData(w, map[string]any{"id": id})
}

func (h *AcademicHandler) ReviewMurojah(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Status   string  `json:"status"`
		Feedback *string `json:"feedback"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	switch body.Status {
	case "menunggu", "direview", "diterima", "perlu_perbaikan":
	case "":
		body.Status = "diterima"
	default:
		jsonError(w, "status murojaah tidak valid", http.StatusBadRequest)
		return
	}
	ctx := r.Context()
	reviewer := middleware.UserIDFromCtx(ctx)

	// Hak diperiksa terhadap murid pemilik baris, bukan terhadap kiriman klien.
	// Sebelum ini rutenya hanya menuntut peran "guru", sehingga guru mana pun
	// dapat menilai — bahkan menimpa — setoran murid kelas lain.
	santriID, statusLama, _, err := h.murojahBaris(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "murojaah tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca murojaah", http.StatusInternalServerError)
		return
	}
	if msg, code := h.pastikanBolehMurojah(ctx, santriID); msg != "" {
		jsonError(w, msg, code)
		return
	}

	ct, err := h.db.Exec(ctx, `
		UPDATE murojaah_submissions
		SET status = $2, feedback = $3, target_guru_id = COALESCE(target_guru_id, $4),
		    reviewed_at = now(), updated_by = $4
		WHERE id = $1
	`, id, body.Status, body.Feedback, reviewer)
	if err != nil {
		jsonError(w, "gagal menyimpan review murojaah", http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		jsonError(w, "murojaah tidak ditemukan", http.StatusNotFound)
		return
	}

	h.catatAudit(ctx, id, "ubah", reviewer, middleware.RoleFromCtx(ctx), statusLama, body.Status, nil)

	jsonData(w, map[string]any{"id": id, "status": body.Status})
}

// ---------- Jilid history ----------

func (h *AcademicHandler) ListJilidHistory(w http.ResponseWriter, r *http.Request) {
	santriID := chi.URLParam(r, "santri_id")
	if role := middleware.RoleFromCtx(r.Context()); role == "santri" &&
		middleware.UserIDFromCtx(r.Context()) != santriID {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id, santri_id, from_jilid, to_jilid, changed_by, changed_at
		FROM jilid_history
		WHERE santri_id = $1
		ORDER BY changed_at DESC
	`, santriID)
	if err != nil {
		jsonError(w, "gagal memuat riwayat jilid", http.StatusInternalServerError)
		return
	}
	out, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca riwayat jilid", http.StatusInternalServerError)
		return
	}
	jsonData(w, out)
}

// ListJilidHistoryBatch GET /api/academic/jilid-history?santri_ids=a,b,c
// Riwayat jilid untuk banyak santri sekaligus — dipakai panel performa kelas,
// yang butuh seluruh roster dan akan jadi N+1 kalau memanggil route per-santri.
// Setiap baris menyertakan objek `santri` bersarang karena itu bentuk yang
// dibaca UI (record.santri.nama_lengkap).
func (h *AcademicHandler) ListJilidHistoryBatch(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	role := middleware.RoleFromCtx(ctx)
	userID := middleware.UserIDFromCtx(ctx)

	ids := strings.TrimSpace(r.URL.Query().Get("santri_ids"))
	if ids == "" {
		jsonError(w, "santri_ids wajib diisi", http.StatusBadRequest)
		return
	}

	where := []string{}
	args := []any{}

	args = append(args, strings.Split(ids, ","))
	where = append(where, "jh.santri_id = ANY($"+itoa(len(args))+")")

	// Santri hanya boleh membaca riwayatnya sendiri, apa pun yang diminta.
	if role == "santri" {
		args = append(args, userID)
		where = append(where, "jh.santri_id = $"+itoa(len(args)))
	}
	// Guru dibatasi ke santri di kelas yang diampunya.
	if role == "guru" {
		args = append(args, userID)
		i := itoa(len(args))
		where = append(where, `(
			jh.santri_id IN (SELECT id FROM santri WHERE current_class_id IN
				(SELECT id FROM classes WHERE id_guru = $`+i+`))
			OR jh.santri_id IN (SELECT cm.santri_id FROM class_memberships cm
				JOIN classes c ON c.id = cm.class_id
				WHERE c.id_guru = $`+i+` AND cm.status = 'active')
		)`)
	}

	rows, err := h.db.Query(ctx, `
		SELECT jh.id, jh.santri_id, jh.from_jilid, jh.to_jilid,
		       jh.changed_by, jh.changed_at,
		       s.nama_lengkap AS santri_nama_lengkap,
		       s.foto_url     AS santri_foto_url,
		       s.avatar_path  AS santri_avatar_path
		FROM jilid_history jh
		LEFT JOIN santri s ON s.id = jh.santri_id
		WHERE `+strings.Join(where, " AND ")+`
		ORDER BY jh.changed_at DESC
	`, args...)
	if err != nil {
		jsonError(w, "gagal memuat riwayat jilid", http.StatusInternalServerError)
		return
	}
	out, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca riwayat jilid", http.StatusInternalServerError)
		return
	}

	// Bentuk ulang alias join yang flat menjadi objek `santri` bersarang.
	for _, row := range out {
		row["santri"] = map[string]any{
			"id":           row["santri_id"],
			"nama_lengkap": row["santri_nama_lengkap"],
			"foto_url":     row["santri_foto_url"],
			"avatar_path":  row["santri_avatar_path"],
		}
		delete(row, "santri_nama_lengkap")
		delete(row, "santri_foto_url")
		delete(row, "santri_avatar_path")
	}

	jsonData(w, out)
}

func (h *AcademicHandler) CreateJilidHistory(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SantriID  string  `json:"santri_id"`
		FromJilid *string `json:"from_jilid"`
		ToJilid   string  `json:"to_jilid"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.SantriID == "" || strings.TrimSpace(body.ToJilid) == "" {
		jsonError(w, "santri_id dan to_jilid wajib diisi", http.StatusBadRequest)
		return
	}
	// changed_by ALWAYS from the JWT, never from client input.
	changedBy := middleware.UserIDFromCtx(r.Context())

	if err := insertJilidHistory(r.Context(), h.db, body.SantriID,
		body.FromJilid, body.ToJilid, changedBy); err != nil {
		jsonError(w, "gagal menyimpan riwayat jilid", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonData(w, map[string]any{"santri_id": body.SantriID, "to_jilid": body.ToJilid})
}

// ---------- Character assessment ----------

func (h *AcademicHandler) ListCharacterItems(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT id, item_order, item_name, is_active
		FROM character_assessment_items
		WHERE is_active = true
		ORDER BY item_order
	`)
	if err != nil {
		jsonError(w, "gagal memuat item penilaian karakter", http.StatusInternalServerError)
		return
	}
	out, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca item penilaian karakter", http.StatusInternalServerError)
		return
	}
	jsonData(w, out)
}

// GET /api/academic/character/profile/{santri_id} — scores, strengths, and
// behaviour records in one response; the profile UI needs all three together.
func (h *AcademicHandler) CharacterProfile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	santriID := chi.URLParam(r, "santri_id")
	if role := middleware.RoleFromCtx(ctx); role == "santri" &&
		middleware.UserIDFromCtx(ctx) != santriID {
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	scores, err := h.collect(ctx, `
		SELECT id, santri_id, item_id, score, assessed_by, assessed_at
		FROM santri_character_scores
		WHERE santri_id = $1
		ORDER BY item_id
	`, santriID)
	if err != nil {
		jsonError(w, "gagal memuat skor karakter", http.StatusInternalServerError)
		return
	}

	strengths, err := h.collect(ctx, `
		SELECT santri_id, strength_key, selected_by, selected_at
		FROM santri_character_strengths
		WHERE santri_id = $1
		ORDER BY strength_key
	`, santriID)
	if err != nil {
		jsonError(w, "gagal memuat kekuatan karakter", http.StatusInternalServerError)
		return
	}

	behavior, err := h.collect(ctx, `
		SELECT id, santri_id, guru_id, incident_date, level, behavior,
		       follow_up, teacher_note, created_at
		FROM santri_behavior_records
		WHERE santri_id = $1
		ORDER BY incident_date DESC, created_at DESC
	`, santriID)
	if err != nil {
		jsonError(w, "gagal memuat catatan perilaku", http.StatusInternalServerError)
		return
	}

	jsonData(w, map[string]any{
		"scores": scores, "strengths": strengths, "behavior": behavior,
	})
}

func (h *AcademicHandler) UpsertCharacterScore(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SantriID string `json:"santri_id"`
		ItemID   int    `json:"item_id"`
		Score    int    `json:"score"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.SantriID == "" || body.ItemID == 0 {
		jsonError(w, "santri_id dan item_id wajib diisi", http.StatusBadRequest)
		return
	}
	if body.Score < 1 || body.Score > 4 {
		jsonError(w, "score harus antara 1 dan 4", http.StatusBadRequest)
		return
	}
	assessedBy := middleware.UserIDFromCtx(r.Context())

	var id string
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO santri_character_scores
		  (santri_id, item_id, score, assessed_by, assessed_at, created_by, updated_by)
		VALUES ($1, $2, $3, $4, now(), $4, $4)
		ON CONFLICT (santri_id, item_id) DO UPDATE
		SET score = EXCLUDED.score, assessed_by = EXCLUDED.assessed_by,
		    assessed_at = now(), updated_by = EXCLUDED.updated_by
		RETURNING id
	`, body.SantriID, body.ItemID, body.Score, assessedBy).Scan(&id)
	if err != nil {
		jsonError(w, "gagal menyimpan skor karakter: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonData(w, map[string]any{"id": id, "score": body.Score})
}

// POST /api/academic/character/strengths — toggles a single strength on or off.
// santri_character_strengths is keyed (santri_id, strength_key) with no id, so a
// deselect is a delete rather than a flag update.
func (h *AcademicHandler) SetCharacterStrength(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SantriID    string `json:"santri_id"`
		StrengthKey string `json:"strength_key"`
		Selected    bool   `json:"selected"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.SantriID == "" || strings.TrimSpace(body.StrengthKey) == "" {
		jsonError(w, "santri_id dan strength_key wajib diisi", http.StatusBadRequest)
		return
	}
	selectedBy := middleware.UserIDFromCtx(r.Context())

	var err error
	if body.Selected {
		_, err = h.db.Exec(r.Context(), `
			INSERT INTO santri_character_strengths (santri_id, strength_key, selected_by, selected_at)
			VALUES ($1, $2, $3, now())
			ON CONFLICT (santri_id, strength_key) DO UPDATE
			SET selected_by = EXCLUDED.selected_by, selected_at = now()
		`, body.SantriID, body.StrengthKey, selectedBy)
	} else {
		_, err = h.db.Exec(r.Context(), `
			DELETE FROM santri_character_strengths
			WHERE santri_id = $1 AND strength_key = $2
		`, body.SantriID, body.StrengthKey)
	}
	if err != nil {
		jsonError(w, "gagal menyimpan kekuatan karakter: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonData(w, map[string]any{
		"santri_id": body.SantriID, "strength_key": body.StrengthKey, "selected": body.Selected,
	})
}

var behaviorEditable = map[string]bool{
	"santri_id": true, "guru_id": true, "incident_date": true, "level": true,
	"behavior": true, "follow_up": true, "teacher_note": true,
}

func (h *AcademicHandler) RecordBehavior(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if asString(body["santri_id"]) == "" {
		jsonError(w, "santri_id wajib diisi", http.StatusBadRequest)
		return
	}
	if strings.TrimSpace(asString(body["behavior"])) == "" ||
		strings.TrimSpace(asString(body["follow_up"])) == "" {
		jsonError(w, "bentuk perilaku dan tindak lanjut wajib diisi", http.StatusBadRequest)
		return
	}
	switch asString(body["level"]) {
	case "Ringan", "Sedang", "Berat":
	default:
		jsonError(w, "tingkat pelanggaran harus Ringan, Sedang, atau Berat", http.StatusBadRequest)
		return
	}
	// guru_id is the acting teacher, taken from the JWT.
	body["guru_id"] = middleware.UserIDFromCtx(r.Context())

	item, err := insertRow(r.Context(), h.db, "santri_behavior_records", body, behaviorEditable)
	if err != nil {
		jsonError(w, "gagal menyimpan catatan perilaku: "+err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonData(w, item)
}

func (h *AcademicHandler) UpdateBehavior(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	delete(body, "santri_id") // never move a record to another santri
	body["guru_id"] = middleware.UserIDFromCtx(r.Context())

	item, err := updateRow(r.Context(), h.db, "santri_behavior_records", id, body, behaviorEditable)
	if err != nil {
		if errors.Is(err, errNoFields) {
			jsonError(w, "tidak ada field yang bisa diperbarui", http.StatusBadRequest)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "catatan perilaku tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal memperbarui catatan perilaku: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonData(w, item)
}

// ---------- Notes ----------

var noteEditable = map[string]bool{
	"santri_id": true, "guru_id": true, "note": true, "visibility": true,
}

// GET /api/academic/notes?santri_id=...
func (h *AcademicHandler) ListNotes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	santriID := r.URL.Query().Get("santri_id")
	if santriID == "" {
		jsonError(w, "santri_id wajib diisi", http.StatusBadRequest)
		return
	}
	role := middleware.RoleFromCtx(ctx)
	if role == "santri" {
		// Santri notes are staff-facing; don't expose them to the santri.
		jsonError(w, "forbidden", http.StatusForbidden)
		return
	}

	q := `SELECT id, santri_id, guru_id, note, visibility, created_at, updated_at
	      FROM santri_notes WHERE santri_id = $1`
	if !middleware.IsAdmin(role) {
		q += " AND visibility <> 'admin_only'"
	}
	q += " ORDER BY created_at DESC"

	rows, err := h.db.Query(ctx, q, santriID)
	if err != nil {
		jsonError(w, "gagal memuat catatan santri", http.StatusInternalServerError)
		return
	}
	out, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca catatan santri", http.StatusInternalServerError)
		return
	}
	jsonData(w, out)
}

func (h *AcademicHandler) AddNote(w http.ResponseWriter, r *http.Request) {
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if asString(body["santri_id"]) == "" || strings.TrimSpace(asString(body["note"])) == "" {
		jsonError(w, "santri_id dan note wajib diisi", http.StatusBadRequest)
		return
	}
	body["guru_id"] = middleware.UserIDFromCtx(r.Context())

	item, err := insertRow(r.Context(), h.db, "santri_notes", body, noteEditable)
	if err != nil {
		jsonError(w, "gagal menyimpan catatan santri: "+err.Error(), http.StatusBadRequest)
		return
	}
	w.WriteHeader(http.StatusCreated)
	jsonData(w, item)
}

func (h *AcademicHandler) UpdateNote(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	delete(body, "santri_id")
	body["guru_id"] = middleware.UserIDFromCtx(r.Context())

	item, err := updateRow(r.Context(), h.db, "santri_notes", id, body, noteEditable)
	if err != nil {
		if errors.Is(err, errNoFields) {
			jsonError(w, "tidak ada field yang bisa diperbarui", http.StatusBadRequest)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "catatan tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal memperbarui catatan: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonData(w, item)
}

// ---------- helpers lokal ----------

// collect runs a single-argument query and returns the rows as maps.
func (h *AcademicHandler) collect(ctx context.Context, q string, arg any) ([]map[string]any, error) {
	rows, err := h.db.Query(ctx, q, arg)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, rowToMap)
}

// jsonData membungkus payload dalam {"data": ...}.
func jsonData(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"data": v})
}

// itoa mengonversi int kecil ke string untuk nomor parameter placeholder.
func itoa(i int) string {
	if i == 0 {
		return "0"
	}
	neg := i < 0
	if neg {
		i = -i
	}
	var buf [20]byte
	pos := len(buf)
	for i > 0 {
		pos--
		buf[pos] = byte('0' + i%10)
		i /= 10
	}
	if neg {
		pos--
		buf[pos] = '-'
	}
	return string(buf[pos:])
}
