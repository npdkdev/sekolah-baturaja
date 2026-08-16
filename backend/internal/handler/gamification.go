package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// GamificationHandler menangani poin santri, leaderboard, dan konfigurasi game.
type GamificationHandler struct {
	db *pgxpool.Pool
}

func NewGamificationHandler(db *pgxpool.Pool) *GamificationHandler {
	return &GamificationHandler{db: db}
}

// Routes mengembalikan router chi untuk /api/gamification.
// Diasumsikan sudah berada di belakang middleware.RequireAuth di main.go.
func (h *GamificationHandler) Routes() chi.Router {
	r := chi.NewRouter()

	r.With(middleware.RequireRole("admin", "guru")).Post("/points", h.IncrementPoints)
	r.Get("/leaderboard", h.Leaderboard)

	// Config endpoints — beberapa publik, beberapa butuh auth (sudah di group RequireAuth).
	r.Get("/config/gatcha", h.ConfigGatcha)
	r.Get("/config/quiz", h.ConfigQuiz)
	r.Get("/config/level", h.ConfigLevel)

	return r
}

// ---------- Poin ----------

func (h *GamificationHandler) IncrementPoints(w http.ResponseWriter, r *http.Request) {
	var body struct {
		SantriID string `json:"santri_id"`
		Amount   *int   `json:"amount"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.SantriID == "" {
		jsonError(w, "santri_id wajib diisi", http.StatusBadRequest)
		return
	}

	amount := 1
	if body.Amount != nil {
		amount = *body.Amount
	}
	if amount <= 0 {
		jsonError(w, "amount harus lebih dari 0", http.StatusBadRequest)
		return
	}

	// RPC increment_santri_points sudah tidak ada: ia menolak setiap panggilan
	// karena auth.uid() selalu null di luar Supabase, sehingga cabang inilah
	// yang selalu dipakai. Otorisasi ditegakkan RequireRole di router.
	var newPoints int
	err := h.db.QueryRow(r.Context(), `
		UPDATE santri SET points = points + $1 WHERE id = $2
		RETURNING points
	`, amount, body.SantriID).Scan(&newPoints)
	if err != nil {
		jsonError(w, "gagal menambah poin", http.StatusInternalServerError)
		return
	}

	_ = middleware.RoleFromCtx(r.Context()) // sudah divalidasi oleh RequireRole
	jsonData(w, map[string]any{"santri_id": body.SantriID, "points": newPoints})
}

// ---------- Leaderboard ----------

func (h *GamificationHandler) Leaderboard(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT id, nama_lengkap, nama_panggilan, points, current_class_id
		FROM santri
		WHERE status = 'Aktif'
		ORDER BY points DESC
		LIMIT 50
	`)
	if err != nil {
		jsonError(w, "gagal memuat leaderboard", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	rank := 1
	for rows.Next() {
		var id, namaLengkap string
		var namaPanggilan, currentClassID *string
		var points int
		if err := rows.Scan(&id, &namaLengkap, &namaPanggilan, &points, &currentClassID); err != nil {
			jsonError(w, "gagal membaca data", http.StatusInternalServerError)
			return
		}
		out = append(out, map[string]any{
			"rank": rank, "id": id, "nama_lengkap": namaLengkap,
			"nama_panggilan": namaPanggilan, "points": points,
			"current_class_id": currentClassID,
		})
		rank++
	}
	jsonData(w, out)
}

// ---------- Config ----------

// fetchWebsiteContent mengambil satu baris dari tabel website_content berdasarkan key.
func (h *GamificationHandler) fetchWebsiteContent(r *http.Request, key string) (any, error) {
	var raw []byte
	err := h.db.QueryRow(r.Context(), `
		SELECT content FROM website_content WHERE key = $1 LIMIT 1
	`, key).Scan(&raw)
	if err != nil {
		return nil, err
	}
	var v any
	if err := json.Unmarshal(raw, &v); err != nil {
		// Kembalikan sebagai string jika bukan JSON.
		return string(raw), nil
	}
	return v, nil
}

func (h *GamificationHandler) ConfigGatcha(w http.ResponseWriter, r *http.Request) {
	v, err := h.fetchWebsiteContent(r, "gatcha_config")
	if err != nil {
		jsonError(w, "konfigurasi gatcha tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonData(w, v)
}

func (h *GamificationHandler) ConfigQuiz(w http.ResponseWriter, r *http.Request) {
	v, err := h.fetchWebsiteContent(r, "quiz_hafalan_config")
	if err != nil {
		jsonError(w, "konfigurasi quiz tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonData(w, v)
}

func (h *GamificationHandler) ConfigLevel(w http.ResponseWriter, r *http.Request) {
	v, err := h.fetchWebsiteContent(r, "level_config")
	if err != nil {
		jsonError(w, "konfigurasi level tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonData(w, v)
}
