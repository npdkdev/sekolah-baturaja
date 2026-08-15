package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// NilaiHandler melayani nilai asesmen mata pelajaran.
//
// Aturan hak akses yang menentukan seluruh berkas ini: seorang guru hanya boleh
// menyentuh nilai pada kombinasi (kelas, mata pelajaran, periode) yang benar-benar
// diajarnya. Kebenaran itu hanya ada di satu tempat, `jadwal_pelajaran`, dan
// selalu ditanya ulang ke sana — tidak pernah disalin ke tabel `nilai`, supaya
// hak akses ikut berubah begitu admin memindahkan jadwal.
type NilaiHandler struct {
	db *pgxpool.Pool
}

func NewNilaiHandler(db *pgxpool.Pool) *NilaiHandler {
	return &NilaiHandler{db: db}
}

func (h *NilaiHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Setiap handler memeriksa haknya sendiri: cakupan guru bergantung pada baris
	// yang disentuh, jadi tidak bisa diputuskan di lapisan router.
	r.Get("/", h.List)
	r.Get("/summary", h.Summary)
	r.Post("/", h.Create)
	r.Put("/{id}", h.Update)
	r.Delete("/{id}", h.Delete)

	return r
}

const nilaiSelectCols = `
	n.id, n.santri_id, n.class_id, n.mata_pelajaran_id, n.periode_id, n.guru_id,
	n.jenis_asesmen, n.skor, n.catatan, n.tanggal_asesmen,
	n.created_at, n.updated_at,
	s.nama_lengkap AS santri_nama,
	c.nama_kelas   AS nama_kelas,
	m.nama         AS mata_pelajaran_nama,
	g.nama         AS guru_nama
`

const nilaiFrom = `
	FROM nilai n
	JOIN santri s          ON s.id = n.santri_id
	JOIN classes c         ON c.id = n.class_id
	JOIN mata_pelajaran m  ON m.id = n.mata_pelajaran_id
	LEFT JOIN guru g       ON g.id = n.guru_id
`

type nilaiInput struct {
	SantriID        string   `json:"santri_id"`
	ClassID         string   `json:"class_id"`
	MataPelajaranID string   `json:"mata_pelajaran_id"`
	PeriodeID       string   `json:"periode_id"`
	JenisAsesmen    string   `json:"jenis_asesmen"`
	Skor            *float64 `json:"skor"`
	Catatan         *string  `json:"catatan"`
	TanggalAsesmen  string   `json:"tanggal_asesmen"`
}

// guruMengajar menjawab satu pertanyaan: apakah guru ini benar-benar memegang
// kombinasi kelas + mata pelajaran + periode tersebut menurut jadwal?
func (h *NilaiHandler) guruMengajar(ctx context.Context, guruID, classID, mapelID, periodeID string) (bool, error) {
	var ada bool
	err := h.db.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM jadwal_pelajaran
			WHERE guru_id = $1 AND class_id = $2 AND mata_pelajaran_id = $3 AND periode_id = $4
		)
	`, guruID, classID, mapelID, periodeID).Scan(&ada)
	return ada, err
}

// nilaiScope menambahkan syarat WHERE sesuai peran pemanggil. Mengembalikan
// klausa kosong untuk peran back-office.
func nilaiScope(ctxRole, ctxUser string, idx *int, args *[]any) (string, bool) {
	if middleware.CanManage(ctxRole) {
		return "", true
	}
	if ctxUser == "" {
		return "", false
	}

	if ctxRole == "guru" {
		clause := `EXISTS (
			SELECT 1 FROM jadwal_pelajaran j
			WHERE j.guru_id = $` + strconv.Itoa(*idx) + `
			  AND j.class_id = n.class_id
			  AND j.mata_pelajaran_id = n.mata_pelajaran_id
			  AND j.periode_id = n.periode_id
		)`
		*args = append(*args, ctxUser)
		*idx++
		return clause, true
	}

	// Murid — dan peran lain yang tidak dikenali — hanya boleh melihat nilainya
	// sendiri. Default paling sempit, bukan paling longgar.
	clause := "n.santri_id = $" + strconv.Itoa(*idx)
	*args = append(*args, ctxUser)
	*idx++
	return clause, true
}

func (h *NilaiHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	where := make([]string, 0, 8)
	args := make([]any, 0, 8)
	idx := 1
	add := func(col, val string) {
		where = append(where, col+" = $"+strconv.Itoa(idx))
		args = append(args, val)
		idx++
	}

	if v := q.Get("santri_id"); v != "" {
		add("n.santri_id", v)
	}
	if v := q.Get("class_id"); v != "" {
		add("n.class_id", v)
	}
	if v := q.Get("mata_pelajaran_id"); v != "" {
		add("n.mata_pelajaran_id", v)
	}
	if v := q.Get("periode_id"); v != "" {
		add("n.periode_id", v)
	}
	if v := q.Get("jenis_asesmen"); v != "" {
		add("n.jenis_asesmen", v)
	}

	ctxUser := middleware.UserIDFromCtx(r.Context())
	ctxRole := middleware.RoleFromCtx(r.Context())
	scope, ok := nilaiScope(ctxRole, ctxUser, &idx, &args)
	if !ok {
		jsonError(w, "sesi tidak valid", http.StatusUnauthorized)
		return
	}
	if scope != "" {
		where = append(where, scope)
	}

	page, limit := parsePagination(q)
	offset := (page - 1) * limit

	query := "SELECT " + nilaiSelectCols + nilaiFrom
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY n.tanggal_asesmen DESC, n.created_at DESC"
	query += " LIMIT $" + strconv.Itoa(idx) + " OFFSET $" + strconv.Itoa(idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil nilai", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca nilai", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{
		"data": items,
		"meta": map[string]int{"page": page, "limit": limit},
	})
}

// Summary merangkum nilai per mata pelajaran: cacah, rata-rata, terendah,
// tertinggi. Dihitung di database supaya angkanya tetap benar walau daftar
// nilainya dipenggal halaman.
func (h *NilaiHandler) Summary(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	where := make([]string, 0, 6)
	args := make([]any, 0, 6)
	idx := 1
	add := func(col, val string) {
		where = append(where, col+" = $"+strconv.Itoa(idx))
		args = append(args, val)
		idx++
	}

	if v := q.Get("class_id"); v != "" {
		add("n.class_id", v)
	}
	if v := q.Get("mata_pelajaran_id"); v != "" {
		add("n.mata_pelajaran_id", v)
	}
	if v := q.Get("periode_id"); v != "" {
		add("n.periode_id", v)
	}
	if v := q.Get("santri_id"); v != "" {
		add("n.santri_id", v)
	}

	ctxUser := middleware.UserIDFromCtx(r.Context())
	ctxRole := middleware.RoleFromCtx(r.Context())
	scope, ok := nilaiScope(ctxRole, ctxUser, &idx, &args)
	if !ok {
		jsonError(w, "sesi tidak valid", http.StatusUnauthorized)
		return
	}
	if scope != "" {
		where = append(where, scope)
	}

	query := `
		SELECT
			n.mata_pelajaran_id,
			m.nama AS mata_pelajaran_nama,
			n.class_id,
			c.nama_kelas,
			count(*)          AS jumlah,
			round(avg(n.skor), 2) AS rata_rata,
			min(n.skor)       AS terendah,
			max(n.skor)       AS tertinggi
		FROM nilai n
		JOIN mata_pelajaran m ON m.id = n.mata_pelajaran_id
		JOIN classes c        ON c.id = n.class_id
	`
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += `
		GROUP BY n.mata_pelajaran_id, m.nama, n.class_id, c.nama_kelas
		ORDER BY m.nama, c.nama_kelas
	`

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil ringkasan nilai", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca ringkasan nilai", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": items})
}

// pastikanBoleh memutuskan apakah pemanggil boleh menulis pada kombinasi ini.
// Mengembalikan pesan dan kode HTTP bila ditolak.
func (h *NilaiHandler) pastikanBoleh(ctx context.Context, classID, mapelID, periodeID string) (string, int) {
	ctxRole := middleware.RoleFromCtx(ctx)
	ctxUser := middleware.UserIDFromCtx(ctx)

	if middleware.CanManage(ctxRole) {
		return "", 0
	}
	if ctxRole != "guru" || ctxUser == "" {
		return "hanya guru pengampu, admin, atau tata usaha yang dapat mengelola nilai", http.StatusForbidden
	}

	boleh, err := h.guruMengajar(ctx, ctxUser, classID, mapelID, periodeID)
	if err != nil {
		return "gagal memeriksa jadwal mengajar", http.StatusInternalServerError
	}
	if !boleh {
		return "Anda tidak mengampu mata pelajaran ini di kelas tersebut pada periode berjalan", http.StatusForbidden
	}
	return "", 0
}

func validasiNilai(in *nilaiInput) string {
	if in.SantriID == "" || in.ClassID == "" || in.MataPelajaranID == "" || in.PeriodeID == "" {
		return "murid, kelas, mata pelajaran, dan periode wajib diisi"
	}
	if strings.TrimSpace(in.JenisAsesmen) == "" {
		return "jenis asesmen wajib diisi"
	}
	if in.Skor == nil {
		return "skor wajib diisi"
	}
	if *in.Skor < 0 || *in.Skor > 100 {
		return "skor harus berada di rentang 0 sampai 100"
	}
	return ""
}

func (h *NilaiHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in nilaiInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if msg := validasiNilai(&in); msg != "" {
		jsonError(w, msg, http.StatusBadRequest)
		return
	}
	if msg, code := h.pastikanBoleh(r.Context(), in.ClassID, in.MataPelajaranID, in.PeriodeID); msg != "" {
		jsonError(w, msg, code)
		return
	}

	// Murid harus benar-benar terdaftar di kelas itu — tanpa ini nilai bisa
	// nyasar ke murid kelas lain hanya karena id-nya diketahui.
	var terdaftar bool
	if err := h.db.QueryRow(r.Context(), `
		SELECT EXISTS (
			SELECT 1 FROM class_memberships
			WHERE santri_id = $1 AND class_id = $2 AND status = 'active'
		) OR EXISTS (
			SELECT 1 FROM santri WHERE id = $1 AND current_class_id = $2
		)
	`, in.SantriID, in.ClassID).Scan(&terdaftar); err != nil {
		jsonError(w, "gagal memeriksa keanggotaan kelas", http.StatusInternalServerError)
		return
	}
	if !terdaftar {
		jsonError(w, "murid tidak terdaftar di kelas tersebut", http.StatusBadRequest)
		return
	}

	ctxUser := middleware.UserIDFromCtx(r.Context())
	ctxRole := middleware.RoleFromCtx(r.Context())

	// Guru yang mencatat jadi pemilik barisnya. Admin boleh mencatatkan atas nama
	// guru pengampu, jadi biarkan kosong bila bukan guru.
	var guruID any
	if ctxRole == "guru" && ctxUser != "" {
		guruID = ctxUser
	}
	var pencatat any
	if ctxUser != "" {
		pencatat = ctxUser
	}

	tanggal := strings.TrimSpace(in.TanggalAsesmen)
	var tanggalArg any
	if tanggal != "" {
		if !isValidISODate(tanggal) {
			jsonError(w, "tanggal asesmen tidak valid", http.StatusBadRequest)
			return
		}
		tanggalArg = tanggal
	}

	row := h.db.QueryRow(r.Context(), `
		INSERT INTO nilai (
			santri_id, class_id, mata_pelajaran_id, periode_id, guru_id,
			jenis_asesmen, skor, catatan, tanggal_asesmen, created_by, updated_by
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, COALESCE($9::date, CURRENT_DATE), $10, $10
		)
		RETURNING id
	`, in.SantriID, in.ClassID, in.MataPelajaranID, in.PeriodeID, guruID,
		strings.TrimSpace(in.JenisAsesmen), *in.Skor, in.Catatan, tanggalArg, pencatat)

	var id string
	if err := row.Scan(&id); err != nil {
		jsonError(w, "gagal menyimpan nilai", http.StatusInternalServerError)
		return
	}

	item, err := h.ambilSatu(r.Context(), id)
	if err != nil {
		jsonError(w, "nilai tersimpan tetapi gagal dibaca ulang", http.StatusInternalServerError)
		return
	}
	jsonCreated(w, item)
}

func (h *NilaiHandler) ambilSatu(ctx context.Context, id string) (map[string]any, error) {
	rows, err := h.db.Query(ctx, "SELECT "+nilaiSelectCols+nilaiFrom+" WHERE n.id = $1", id)
	if err != nil {
		return nil, err
	}
	return pgx.CollectOneRow(rows, rowToMap)
}

// baris mengambil kombinasi kepemilikan sebuah nilai, dipakai untuk memeriksa
// hak sebelum mengubah atau menghapus.
func (h *NilaiHandler) baris(ctx context.Context, id string) (classID, mapelID, periodeID string, err error) {
	err = h.db.QueryRow(ctx, `
		SELECT class_id, mata_pelajaran_id, periode_id FROM nilai WHERE id = $1
	`, id).Scan(&classID, &mapelID, &periodeID)
	return
}

func (h *NilaiHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	classID, mapelID, periodeID, err := h.baris(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "nilai tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca nilai", http.StatusInternalServerError)
		return
	}
	// Hak diperiksa terhadap baris yang ADA, bukan terhadap kiriman klien.
	if msg, code := h.pastikanBoleh(r.Context(), classID, mapelID, periodeID); msg != "" {
		jsonError(w, msg, code)
		return
	}

	var in nilaiInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	set := make([]string, 0, 6)
	args := make([]any, 0, 8)
	idx := 1
	add := func(col string, val any) {
		set = append(set, col+" = $"+strconv.Itoa(idx))
		args = append(args, val)
		idx++
	}

	if in.Skor != nil {
		if *in.Skor < 0 || *in.Skor > 100 {
			jsonError(w, "skor harus berada di rentang 0 sampai 100", http.StatusBadRequest)
			return
		}
		add("skor", *in.Skor)
	}
	if strings.TrimSpace(in.JenisAsesmen) != "" {
		add("jenis_asesmen", strings.TrimSpace(in.JenisAsesmen))
	}
	if in.Catatan != nil {
		add("catatan", *in.Catatan)
	}
	if v := strings.TrimSpace(in.TanggalAsesmen); v != "" {
		if !isValidISODate(v) {
			jsonError(w, "tanggal asesmen tidak valid", http.StatusBadRequest)
			return
		}
		add("tanggal_asesmen", v)
	}

	// Memindahkan nilai ke kelas atau mata pelajaran lain berarti memindahkan
	// kepemilikannya. Hanya back-office yang boleh, dan tujuannya diperiksa juga.
	if in.ClassID != "" || in.MataPelajaranID != "" || in.PeriodeID != "" {
		if !middleware.CanManage(middleware.RoleFromCtx(r.Context())) {
			jsonError(w, "memindahkan nilai ke kelas atau mata pelajaran lain hanya dapat dilakukan admin atau tata usaha", http.StatusForbidden)
			return
		}
		if in.ClassID != "" {
			add("class_id", in.ClassID)
		}
		if in.MataPelajaranID != "" {
			add("mata_pelajaran_id", in.MataPelajaranID)
		}
		if in.PeriodeID != "" {
			add("periode_id", in.PeriodeID)
		}
	}

	if len(set) == 0 {
		jsonError(w, "tidak ada field untuk diperbarui", http.StatusBadRequest)
		return
	}

	if ctxUser := middleware.UserIDFromCtx(r.Context()); ctxUser != "" {
		add("updated_by", ctxUser)
	}

	args = append(args, id)
	query := "UPDATE nilai SET " + strings.Join(set, ", ") +
		" WHERE id = $" + strconv.Itoa(idx)

	tag, err := h.db.Exec(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal memperbarui nilai", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "nilai tidak ditemukan", http.StatusNotFound)
		return
	}

	item, err := h.ambilSatu(r.Context(), id)
	if err != nil {
		jsonError(w, "nilai diperbarui tetapi gagal dibaca ulang", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": item})
}

func (h *NilaiHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	classID, mapelID, periodeID, err := h.baris(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "nilai tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal membaca nilai", http.StatusInternalServerError)
		return
	}
	if msg, code := h.pastikanBoleh(r.Context(), classID, mapelID, periodeID); msg != "" {
		jsonError(w, msg, code)
		return
	}

	tag, err := h.db.Exec(r.Context(), "DELETE FROM nilai WHERE id = $1", id)
	if err != nil {
		jsonError(w, "gagal menghapus nilai", http.StatusInternalServerError)
		return
	}
	if tag.RowsAffected() == 0 {
		jsonError(w, "nilai tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonOK(w, map[string]any{"data": map[string]string{"id": id}})
}
