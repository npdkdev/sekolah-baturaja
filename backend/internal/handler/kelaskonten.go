package handler

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// KelasKontenHandler melayani materi, tugas, dan pengumuman kelas.
//
// Dua aturan yang menentukan seluruh berkas ini:
//
//  1. Guru hanya boleh menulis untuk kelas yang benar-benar diajarnya menurut
//     `jadwal_pelajaran`. Bila kontennya menyebut mata pelajaran, ia harus
//     mengampu mata pelajaran itu di kelas tersebut; bila tidak (pengumuman
//     kelas), cukup mengampu apa pun di kelas itu.
//  2. Murid hanya melihat yang SUDAH TERBIT dan hanya untuk kelasnya sendiri.
//     Draf tidak pernah bocor.
type KelasKontenHandler struct {
	db *pgxpool.Pool
}

func NewKelasKontenHandler(db *pgxpool.Pool) *KelasKontenHandler {
	return &KelasKontenHandler{db: db}
}

func (h *KelasKontenHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Cakupan bergantung pada baris yang disentuh, jadi tiap handler memeriksa
	// haknya sendiri; tidak bisa diputuskan di lapisan router.
	r.Get("/", h.List)
	r.Post("/", h.Create)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.Delete)

	return r
}

const kelasKontenCols = `
	k.id, k.jenis, k.judul, k.isi,
	k.class_id, k.mata_pelajaran_id, k.periode_id, k.guru_id,
	k.status, k.tanggal_publikasi, k.batas_pengumpulan,
	k.lampiran_url, k.lampiran_nama,
	k.created_at, k.updated_at,
	c.nama_kelas AS nama_kelas,
	m.nama       AS mata_pelajaran_nama,
	g.nama       AS guru_nama
`

const kelasKontenFrom = `
	FROM kelas_konten k
	JOIN classes c        ON c.id = k.class_id
	LEFT JOIN mata_pelajaran m ON m.id = k.mata_pelajaran_id
	LEFT JOIN guru g      ON g.id = k.guru_id
`

type kelasKontenInput struct {
	Jenis            string  `json:"jenis"`
	Judul            string  `json:"judul"`
	Isi              *string `json:"isi"`
	ClassID          string  `json:"class_id"`
	MataPelajaranID  *string `json:"mata_pelajaran_id"`
	PeriodeID        *string `json:"periode_id"`
	Status           string  `json:"status"`
	TanggalPublikasi *string `json:"tanggal_publikasi"`
	BatasPengumpulan *string `json:"batas_pengumpulan"`
	LampiranURL      *string `json:"lampiran_url"`
	LampiranNama     *string `json:"lampiran_nama"`
}

var kelasKontenJenis = map[string]bool{"materi": true, "tugas": true, "pengumuman": true}
var kelasKontenStatus = map[string]bool{"draft": true, "published": true, "archived": true}

// guruPegangKelas menjawab: apakah guru ini mengajar di kelas tersebut?
// Bila mapelID kosong, cukup mengampu mata pelajaran apa pun di kelas itu —
// itulah yang membuat pengumuman kelas mungkin tanpa menyebut mata pelajaran.
func (h *KelasKontenHandler) guruPegangKelas(ctx context.Context, guruID, classID string, mapelID *string) (bool, error) {
	query := `
		SELECT EXISTS (
			SELECT 1 FROM jadwal_pelajaran
			WHERE guru_id = $1 AND class_id = $2
	`
	args := []any{guruID, classID}
	if mapelID != nil && *mapelID != "" {
		query += " AND mata_pelajaran_id = $3"
		args = append(args, *mapelID)
	}
	query += ")"

	var ada bool
	err := h.db.QueryRow(ctx, query, args...).Scan(&ada)
	return ada, err
}

// pastikanBolehKelas memutuskan hak tulis pada satu kelas + mata pelajaran.
func (h *KelasKontenHandler) pastikanBolehKelas(ctx context.Context, classID string, mapelID *string) (string, int) {
	role := middleware.RoleFromCtx(ctx)
	user := middleware.UserIDFromCtx(ctx)

	if middleware.CanManage(role) {
		return "", 0
	}
	if role != "guru" || user == "" {
		return "hanya guru pengampu, admin, atau tata usaha yang dapat mengelola konten kelas", http.StatusForbidden
	}

	boleh, err := h.guruPegangKelas(ctx, user, classID, mapelID)
	if err != nil {
		return "gagal memeriksa jadwal mengajar", http.StatusInternalServerError
	}
	if !boleh {
		return "Anda tidak mengajar di kelas tersebut", http.StatusForbidden
	}
	return "", 0
}

func (h *KelasKontenHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	where := make([]string, 0, 8)
	args := make([]any, 0, 8)
	idx := 1
	add := func(col, val string) {
		where = append(where, col+" = $"+strconv.Itoa(idx))
		args = append(args, val)
		idx++
	}

	if v := q.Get("class_id"); v != "" {
		add("k.class_id", v)
	}
	if v := q.Get("mata_pelajaran_id"); v != "" {
		add("k.mata_pelajaran_id", v)
	}
	if v := q.Get("periode_id"); v != "" {
		add("k.periode_id", v)
	}
	if v := q.Get("jenis"); v != "" {
		add("k.jenis", v)
	}
	if v := q.Get("status"); v != "" {
		add("k.status", v)
	}

	ctxUser := middleware.UserIDFromCtx(r.Context())
	ctxRole := middleware.RoleFromCtx(r.Context())

	switch {
	case middleware.CanManage(ctxRole):
		// Tanpa batas tambahan.

	case ctxRole == "guru" && ctxUser != "":
		// Guru melihat konten kelas yang diajarnya — termasuk drafnya sendiri.
		where = append(where, `EXISTS (
			SELECT 1 FROM jadwal_pelajaran j
			WHERE j.guru_id = $`+strconv.Itoa(idx)+` AND j.class_id = k.class_id
		)`)
		args = append(args, ctxUser)
		idx++

	case ctxUser != "":
		// Murid: hanya yang sudah terbit, hanya kelasnya sendiri. Dicocokkan lewat
		// keanggotaan kelas maupun current_class_id supaya keduanya sepakat.
		where = append(where, `k.status = 'published'`)
		where = append(where, `(
			EXISTS (
				SELECT 1 FROM class_memberships cm
				WHERE cm.santri_id = $`+strconv.Itoa(idx)+` AND cm.class_id = k.class_id AND cm.status = 'active'
			) OR EXISTS (
				SELECT 1 FROM santri s
				WHERE s.id = $`+strconv.Itoa(idx)+` AND s.current_class_id = k.class_id
			)
		)`)
		args = append(args, ctxUser)
		idx++

	default:
		jsonError(w, "sesi tidak valid", http.StatusUnauthorized)
		return
	}

	page, limit := parsePagination(q)
	offset := (page - 1) * limit

	query := "SELECT " + kelasKontenCols + kelasKontenFrom
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	// Yang terbit diurut menurut tanggal publikasi; draf belum punya tanggal itu,
	// jadi created_at jadi jaringnya supaya draf baru tidak tenggelam.
	query += " ORDER BY COALESCE(k.tanggal_publikasi, k.created_at) DESC"
	query += " LIMIT $" + strconv.Itoa(idx) + " OFFSET $" + strconv.Itoa(idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil konten kelas", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca konten kelas", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{
		"data": items,
		"meta": map[string]int{"page": page, "limit": limit},
	})
}

func validasiKelasKonten(in *kelasKontenInput, wajibJenis bool) string {
	if wajibJenis {
		if !kelasKontenJenis[in.Jenis] {
			return "jenis harus salah satu dari: materi, tugas, pengumuman"
		}
		if in.ClassID == "" {
			return "kelas tujuan wajib diisi"
		}
		if strings.TrimSpace(in.Judul) == "" {
			return "judul wajib diisi"
		}
	}
	if in.Status != "" && !kelasKontenStatus[in.Status] {
		return "status harus salah satu dari: draft, published, archived"
	}
	// Cerminan CHECK di basis data; ditolak lebih awal supaya pesannya jelas.
	if in.BatasPengumpulan != nil && *in.BatasPengumpulan != "" && in.Jenis != "" && in.Jenis != "tugas" {
		return "batas pengumpulan hanya berlaku untuk tugas"
	}
	return ""
}

func (h *KelasKontenHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in kelasKontenInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if msg := validasiKelasKonten(&in, true); msg != "" {
		jsonError(w, msg, http.StatusBadRequest)
		return
	}
	if msg, code := h.pastikanBolehKelas(r.Context(), in.ClassID, in.MataPelajaranID); msg != "" {
		jsonError(w, msg, code)
		return
	}

	status := in.Status
	if status == "" {
		status = "draft"
	}

	ctxUser := middleware.UserIDFromCtx(r.Context())
	ctxRole := middleware.RoleFromCtx(r.Context())
	var guruID any
	if ctxRole == "guru" && ctxUser != "" {
		guruID = ctxUser
	}
	var pencatat any
	if ctxUser != "" {
		pencatat = ctxUser
	}

	// Menerbitkan tanpa menyebut tanggal berarti terbit sekarang; kalau dibiarkan
	// kosong, murid tidak akan pernah melihatnya di urutan teratas.
	var tanggalTerbit any
	if in.TanggalPublikasi != nil && *in.TanggalPublikasi != "" {
		tanggalTerbit = *in.TanggalPublikasi
	} else if status == "published" {
		tanggalTerbit = "now()"
	}

	var id string
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO kelas_konten (
			jenis, judul, isi, class_id, mata_pelajaran_id, periode_id, guru_id,
			status, tanggal_publikasi, batas_pengumpulan, lampiran_url, lampiran_nama,
			created_by, updated_by
		) VALUES (
			$1, $2, $3, $4, NULLIF($5,'')::uuid, NULLIF($6,'')::uuid, $7,
			$8,
			CASE WHEN $9::text = 'now()' THEN now() ELSE NULLIF($9::text,'')::timestamptz END,
			NULLIF($10,'')::timestamptz, $11, $12, $13, $13
		)
		RETURNING id
	`,
		in.Jenis, strings.TrimSpace(in.Judul), in.Isi, in.ClassID,
		derefStr(in.MataPelajaranID), derefStr(in.PeriodeID), guruID,
		status, tanggalTerbit, derefStr(in.BatasPengumpulan),
		in.LampiranURL, in.LampiranNama, pencatat,
	).Scan(&id)
	if err != nil {
		jsonError(w, "gagal menyimpan konten kelas", http.StatusInternalServerError)
		return
	}

	item, err := h.ambilSatu(r.Context(), id)
	if err != nil {
		jsonError(w, "konten tersimpan tetapi gagal dibaca ulang", http.StatusInternalServerError)
		return
	}
	jsonCreated(w, item)
}

// derefStr mengubah *string nil menjadi string kosong, supaya NULLIF di query
// dapat mengubahnya kembali jadi NULL tanpa cabang tambahan di Go.
func derefStr(v *string) string {
	if v == nil {
		return ""
	}
	return *v
}

func (h *KelasKontenHandler) ambilSatu(ctx context.Context, id string) (map[string]any, error) {
	rows, err := h.db.Query(ctx, "SELECT "+kelasKontenCols+kelasKontenFrom+" WHERE k.id = $1", id)
	if err != nil {
		return nil, err
	}
	return pgx.CollectOneRow(rows, rowToMap)
}

// barisKelas mengambil kepemilikan sebuah konten, untuk memeriksa hak sebelum
// mengubah atau menghapus.
func (h *KelasKontenHandler) barisKelas(ctx context.Context, id string) (classID string, mapelID *string, jenis string, err error) {
	err = h.db.QueryRow(ctx, `
		SELECT class_id, mata_pelajaran_id, jenis FROM kelas_konten WHERE id = $1
	`, id).Scan(&classID, &mapelID, &jenis)
	return
}

func (h *KelasKontenHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	classID, mapelID, jenisTersimpan, err := h.barisKelas(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			jsonError(w, "konten tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca konten kelas", http.StatusInternalServerError)
		return
	}
	// Hak diperiksa terhadap baris yang ADA, bukan terhadap kiriman klien.
	if msg, code := h.pastikanBolehKelas(r.Context(), classID, mapelID); msg != "" {
		jsonError(w, msg, code)
		return
	}

	var in kelasKontenInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	// Jenis tidak ikut dikirim saat sunting parsial, jadi pakai yang tersimpan
	// agar aturan "batas pengumpulan hanya untuk tugas" tetap diuji benar.
	if in.Jenis == "" {
		in.Jenis = jenisTersimpan
	}
	if msg := validasiKelasKonten(&in, false); msg != "" {
		jsonError(w, msg, http.StatusBadRequest)
		return
	}

	set := make([]string, 0, 10)
	args := make([]any, 0, 12)
	idx := 1
	add := func(col string, val any) {
		set = append(set, col+" = $"+strconv.Itoa(idx))
		args = append(args, val)
		idx++
	}

	if strings.TrimSpace(in.Judul) != "" {
		add("judul", strings.TrimSpace(in.Judul))
	}
	if in.Isi != nil {
		add("isi", *in.Isi)
	}
	if in.Status != "" {
		add("status", in.Status)
		// Menerbitkan pertama kali menstempel tanggalnya bila belum ada.
		if in.Status == "published" && (in.TanggalPublikasi == nil || *in.TanggalPublikasi == "") {
			set = append(set, "tanggal_publikasi = COALESCE(tanggal_publikasi, now())")
		}
	}
	if in.TanggalPublikasi != nil {
		if *in.TanggalPublikasi == "" {
			add("tanggal_publikasi", nil)
		} else {
			add("tanggal_publikasi", *in.TanggalPublikasi)
		}
	}
	if in.BatasPengumpulan != nil {
		if *in.BatasPengumpulan == "" {
			add("batas_pengumpulan", nil)
		} else {
			add("batas_pengumpulan", *in.BatasPengumpulan)
		}
	}
	if in.LampiranURL != nil {
		add("lampiran_url", *in.LampiranURL)
	}
	if in.LampiranNama != nil {
		add("lampiran_nama", *in.LampiranNama)
	}

	// Memindahkan konten ke kelas lain memindahkan kepemilikannya — back-office saja.
	if in.ClassID != "" && in.ClassID != classID {
		if !middleware.CanManage(middleware.RoleFromCtx(r.Context())) {
			jsonError(w, "memindahkan konten ke kelas lain hanya dapat dilakukan admin atau tata usaha", http.StatusForbidden)
			return
		}
		add("class_id", in.ClassID)
	}

	if len(set) == 0 {
		jsonError(w, "tidak ada field untuk diperbarui", http.StatusBadRequest)
		return
	}
	if ctxUser := middleware.UserIDFromCtx(r.Context()); ctxUser != "" {
		add("updated_by", ctxUser)
	}

	args = append(args, id)
	query := "UPDATE kelas_konten SET " + strings.Join(set, ", ") +
		" WHERE id = $" + strconv.Itoa(idx)

	tag, err := h.db.Exec(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal memperbarui konten kelas", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "konten tidak ditemukan", http.StatusNotFound)
		return
	}

	item, err := h.ambilSatu(r.Context(), id)
	if err != nil {
		jsonError(w, "konten diperbarui tetapi gagal dibaca ulang", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": item})
}

func (h *KelasKontenHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	classID, mapelID, _, err := h.barisKelas(r.Context(), id)
	if err != nil {
		if err == pgx.ErrNoRows {
			jsonError(w, "konten tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca konten kelas", http.StatusInternalServerError)
		return
	}
	if msg, code := h.pastikanBolehKelas(r.Context(), classID, mapelID); msg != "" {
		jsonError(w, msg, code)
		return
	}

	tag, err := h.db.Exec(r.Context(), "DELETE FROM kelas_konten WHERE id = $1", id)
	if err != nil {
		jsonError(w, "gagal menghapus konten kelas", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "konten tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"data": map[string]string{"id": id}})
}
