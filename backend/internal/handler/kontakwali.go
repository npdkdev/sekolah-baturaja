package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// KontakWaliHandler menyajikan kontak wali murid untuk keperluan komunikasi guru.
//
// Endpoint tersendiri, bukan menumpang `/api/santri`, karena dua alasan:
//
//  1. Cakupan guru di `santri.List` bersandar pada `classes.id_guru` — wali kelas
//     saja. Guru mata pelajaran yang mengajar lewat `jadwal_pelajaran` tidak
//     termasuk, padahal ia juga perlu menghubungi wali muridnya. Melebarkan
//     cakupan di sana akan mengubah perilaku Data Murid yang tidak berkaitan.
//  2. Kontak wali adalah data pribadi. Endpoint ini hanya mengembalikan kolom
//     yang benar-benar dipakai untuk menghubungi — bukan seluruh baris murid.
//
// Tidak ada kredensial WhatsApp yang disimpan dan tidak ada integrasi luar yang
// dipanggil. Backend hanya menyerahkan nomornya; tautan `wa.me` dirakit di
// peramban guru saat tombolnya ditekan.
type KontakWaliHandler struct {
	db *pgxpool.Pool
}

func NewKontakWaliHandler(db *pgxpool.Pool) *KontakWaliHandler {
	return &KontakWaliHandler{db: db}
}

func (h *KontakWaliHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/", h.List)
	return r
}

// GET /api/kontak-wali
func (h *KontakWaliHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	role := middleware.RoleFromCtx(r.Context())
	userID := middleware.UserIDFromCtx(r.Context())

	where := []string{"s.deleted_at IS NULL"}
	args := make([]any, 0, 6)
	idx := 1

	if v := strings.TrimSpace(q.Get("class_id")); v != "" {
		where = append(where, "s.current_class_id = $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}
	if v := strings.TrimSpace(q.Get("search")); v != "" {
		where = append(where, "s.nama_lengkap ILIKE $"+strconv.Itoa(idx))
		args = append(args, "%"+v+"%")
		idx++
	}
	// Murid nonaktif tidak dihubungi lewat panel ini; wali mereka bukan lagi
	// tanggung jawab guru kelas berjalan.
	where = append(where, "(s.status IS NULL OR s.status ILIKE 'aktif' OR s.status ILIKE 'active')")

	switch {
	case middleware.CanManage(role):
		// Akses penuh.

	case role == "guru":
		if userID == "" {
			jsonError(w, "sesi tidak valid", http.StatusUnauthorized)
			return
		}
		// Dua jalur sah seorang guru sampai ke satu murid: menjadi wali kelasnya,
		// atau mengajar di kelas itu menurut jadwal. Keduanya diterima; di luar itu
		// tidak.
		where = append(where, `(
			s.current_class_id IN (SELECT id FROM classes WHERE id_guru = $`+strconv.Itoa(idx)+`)
			OR s.current_class_id IN (SELECT class_id FROM jadwal_pelajaran WHERE guru_id = $`+strconv.Itoa(idx)+`)
			OR s.id IN (
				SELECT cm.santri_id FROM class_memberships cm
				WHERE cm.status = 'active' AND (
					cm.class_id IN (SELECT id FROM classes WHERE id_guru = $`+strconv.Itoa(idx)+`)
					OR cm.class_id IN (SELECT class_id FROM jadwal_pelajaran WHERE guru_id = $`+strconv.Itoa(idx)+`)
				)
			)
		)`)
		args = append(args, userID)
		idx++

	default:
		// Murid dan peran lain tidak punya urusan dengan daftar kontak wali.
		jsonError(w, "hanya guru, admin, atau tata usaha yang dapat membuka kontak wali", http.StatusForbidden)
		return
	}

	page, limit := parsePagination(q)
	offset := (page - 1) * limit

	query := `
		SELECT
			s.id, s.nama_lengkap, s.current_class_id,
			s.no_hp_ortu, s.nama_ayah, s.nama_ibu,
			c.nama_kelas
		FROM santri s
		LEFT JOIN classes c ON c.id = s.current_class_id
		WHERE ` + strings.Join(where, " AND ") + `
		ORDER BY c.nama_kelas NULLS LAST, s.nama_lengkap
		LIMIT $` + strconv.Itoa(idx) + ` OFFSET $` + strconv.Itoa(idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil kontak wali", http.StatusInternalServerError)
		return
	}
	items, err := pgx.CollectRows(rows, rowToMap)
	if err != nil {
		jsonError(w, "gagal membaca kontak wali", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{
		"data": items,
		"meta": map[string]int{"page": page, "limit": limit},
	})
}
