package handler

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// MMQHandler menangani jadwal, absensi, dan notulensi Musyawarah Muhafiz Quran.
type MMQHandler struct {
	db *pgxpool.Pool
}

func NewMMQHandler(db *pgxpool.Pool) *MMQHandler {
	return &MMQHandler{db: db}
}

// Routes mengembalikan router chi untuk /api/mmq.
// Diasumsikan sudah berada di belakang middleware.RequireAuth di main.go.
func (h *MMQHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// MMQ is the teachers' own forum: schedules, meeting attendance, and minutes.
	// Nothing here is santri-facing, but the reads were open to any authenticated
	// caller — so a santri could pull staff attendance records and the full text
	// of every meeting's notulensi. Staff-only across the board; writes stay
	// narrower still.
	r.Use(middleware.RequireRole(middleware.StaffRoles...))

	// Jadwal
	r.Get("/schedules", h.ListSchedules)
	r.Get("/schedules/by-day/{day}", h.SchedulesByDay)

	// Absensi
	r.With(middleware.RequireRole("admin", "guru")).Post("/attendance", h.CreateAttendance)
	r.With(middleware.RequireRole("admin", "guru")).Put("/attendance/{id}", h.UpdateAttendance)
	r.Get("/attendance", h.ListAttendance)

	// Notulensi
	r.With(middleware.RequireRole("admin", "guru")).Post("/notulensi", h.CreateNotulensi)
	r.Get("/notulensi", h.ListNotulensi)

	return r
}

// ---------- Jadwal ----------

func (h *MMQHandler) ListSchedules(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(r.Context(), `
		SELECT `+mmqScheduleCols+`
		FROM mmq_schedule
		WHERE is_active = true
		ORDER BY day_of_week, start_time
	`)
	if err != nil {
		jsonError(w, "gagal memuat jadwal MMQ", http.StatusInternalServerError)
		return
	}
	out, err := scanMMQSchedules(rows)
	if err != nil {
		jsonError(w, "gagal membaca data", http.StatusInternalServerError)
		return
	}
	jsonData(w, out)
}

func (h *MMQHandler) SchedulesByDay(w http.ResponseWriter, r *http.Request) {
	day := chi.URLParam(r, "day")
	rows, err := h.db.Query(r.Context(), `
		SELECT `+mmqScheduleCols+`
		FROM mmq_schedule
		WHERE day_of_week = $1 AND is_active = true
		ORDER BY start_time
	`, day)
	if err != nil {
		jsonError(w, "gagal memuat jadwal", http.StatusInternalServerError)
		return
	}
	out, err := scanMMQSchedules(rows)
	if err != nil {
		jsonError(w, "gagal membaca data", http.StatusInternalServerError)
		return
	}
	jsonData(w, out)
}

// mmqScheduleCols mengikuti kolom nyata public.mmq_schedule
// (20260624001000_mmq_core.sql). Tabel ini TIDAK punya kolom description.
const mmqScheduleCols = `id::text, day_of_week, start_time::text, end_time::text, location, is_active`

// scanMMQSchedules membaca hasil mmqScheduleCols. day_of_week, start_time,
// end_time, dan location semuanya nullable di skema, jadi dibaca sebagai pointer.
func scanMMQSchedules(rows pgx.Rows) ([]map[string]any, error) {
	defer rows.Close()
	out := []map[string]any{}
	for rows.Next() {
		var id string
		var location, startTime, endTime *string
		var dayOfWeek *int
		var isActive bool
		if err := rows.Scan(&id, &dayOfWeek, &startTime, &endTime, &location, &isActive); err != nil {
			return nil, err
		}
		out = append(out, map[string]any{
			"id": id, "day_of_week": dayOfWeek, "start_time": startTime,
			"end_time": endTime, "location": location, "is_active": isActive,
		})
	}
	return out, rows.Err()
}

// ---------- Absensi ----------

func (h *MMQHandler) CreateAttendance(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ScheduleID     string `json:"schedule_id"`
		AttendanceDate string `json:"attendance_date"`
		Status         string `json:"status"`
		Notes          string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.ScheduleID == "" || body.AttendanceDate == "" {
		jsonError(w, "schedule_id dan attendance_date wajib diisi", http.StatusBadRequest)
		return
	}
	// guru_id SELALU dari JWT.
	guruID := middleware.UserIDFromCtx(r.Context())

	// Cek duplikat: satu guru satu jadwal satu tanggal.
	var existing string
	err := h.db.QueryRow(r.Context(), `
		SELECT id FROM mmq_attendance
		WHERE schedule_id = $1 AND guru_id = $2 AND attendance_date = $3
		LIMIT 1
	`, body.ScheduleID, guruID, body.AttendanceDate).Scan(&existing)
	if err == nil {
		// Sudah ada — kembalikan id yang ada tanpa error.
		jsonData(w, map[string]any{"id": existing, "duplicate": true})
		return
	}

	var id string
	err = h.db.QueryRow(r.Context(), `
		INSERT INTO mmq_attendance (schedule_id, guru_id, attendance_date, status, notes)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, body.ScheduleID, guruID, body.AttendanceDate, body.Status, body.Notes).Scan(&id)
	if err != nil {
		jsonError(w, "gagal menyimpan absensi", http.StatusInternalServerError)
		return
	}
	jsonData(w, map[string]any{"id": id})
}

func (h *MMQHandler) UpdateAttendance(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		CheckInTimestamp *string `json:"check_in_timestamp"`
		Status           *string `json:"status"`
		Notes            *string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	sets := []string{}
	args := []any{}
	i := 1
	if body.CheckInTimestamp != nil {
		sets = append(sets, "check_in_timestamp = $"+itoa(i))
		args = append(args, *body.CheckInTimestamp)
		i++
	}
	if body.Status != nil {
		sets = append(sets, "status = $"+itoa(i))
		args = append(args, *body.Status)
		i++
	}
	if body.Notes != nil {
		sets = append(sets, "notes = $"+itoa(i))
		args = append(args, *body.Notes)
		i++
	}
	if len(sets) == 0 {
		jsonError(w, "tidak ada field untuk diperbarui", http.StatusBadRequest)
		return
	}
	args = append(args, id)
	q := "UPDATE mmq_attendance SET " + strings.Join(sets, ", ") + " WHERE id = $" + itoa(i)

	if _, err := h.db.Exec(r.Context(), q, args...); err != nil {
		jsonError(w, "gagal memperbarui absensi", http.StatusInternalServerError)
		return
	}
	jsonData(w, map[string]any{"id": id})
}

func (h *MMQHandler) ListAttendance(w http.ResponseWriter, r *http.Request) {
	q := `
		SELECT id, schedule_id, guru_id, attendance_date, check_in_timestamp, status, notes
		FROM mmq_attendance
		WHERE 1=1
	`
	args := []any{}
	i := 1

	if v := r.URL.Query().Get("schedule_id"); v != "" {
		q += " AND schedule_id = $" + itoa(i)
		args = append(args, v)
		i++
	}
	if v := r.URL.Query().Get("guru_id"); v != "" {
		q += " AND guru_id = $" + itoa(i)
		args = append(args, v)
		i++
	}
	if v := r.URL.Query().Get("date_from"); v != "" {
		q += " AND attendance_date >= $" + itoa(i)
		args = append(args, v)
		i++
	}
	if v := r.URL.Query().Get("date_to"); v != "" {
		q += " AND attendance_date <= $" + itoa(i)
		args = append(args, v)
		i++
	}
	q += " ORDER BY attendance_date DESC, schedule_id"

	rows, err := h.db.Query(r.Context(), q, args...)
	if err != nil {
		jsonError(w, "gagal memuat absensi", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id, scheduleID, guruID string
		var status, notes *string
		var attendanceDate, checkIn any
		if err := rows.Scan(&id, &scheduleID, &guruID, &attendanceDate, &checkIn, &status, &notes); err != nil {
			jsonError(w, "gagal membaca data", http.StatusInternalServerError)
			return
		}
		out = append(out, map[string]any{
			"id": id, "schedule_id": scheduleID, "guru_id": guruID,
			"attendance_date": attendanceDate, "check_in_timestamp": checkIn,
			"status": status, "notes": notes,
		})
	}
	jsonData(w, out)
}

// ---------- Notulensi ----------

func (h *MMQHandler) CreateNotulensi(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ScheduleID string  `json:"schedule_id"`
		Tanggal    string  `json:"tanggal"`
		Judul      string  `json:"judul"`
		Isi        *string `json:"isi"`
		NotulenID  *string `json:"notulen_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if body.ScheduleID == "" || body.Tanggal == "" {
		jsonError(w, "schedule_id dan tanggal wajib diisi", http.StatusBadRequest)
		return
	}
	// judul NOT NULL + mmq_notulensi_judul_not_blank.
	body.Judul = strings.TrimSpace(body.Judul)
	if body.Judul == "" {
		jsonError(w, "judul wajib diisi", http.StatusBadRequest)
		return
	}

	createdBy := middleware.UserIDFromCtx(r.Context())

	// Verifikasi bahwa guru yang login memiliki is_notulen=true jika bukan admin.
	role := middleware.RoleFromCtx(r.Context())
	if role != "admin" {
		var isNotulen bool
		err := h.db.QueryRow(r.Context(), `
			SELECT COALESCE(is_notulen, false) FROM guru WHERE id = $1
		`, createdBy).Scan(&isNotulen)
		if err != nil || !isNotulen {
			jsonError(w, "hanya notulen yang dapat membuat notulensi", http.StatusForbidden)
			return
		}
	}

	// notulen_id → guru(id), nullable. Bila klien tidak mengirimnya, pakai guru
	// yang login (id guru == auth.uid pada skema ini).
	notulenID := body.NotulenID
	if notulenID == nil && createdBy != "" {
		notulenID = &createdBy
	}

	var id string
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO mmq_notulensi (schedule_id, tanggal, judul, isi, notulen_id, created_by)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id::text
	`, body.ScheduleID, body.Tanggal, body.Judul, body.Isi, notulenID, createdBy).Scan(&id)
	if err != nil {
		jsonError(w, "gagal menyimpan notulensi", http.StatusInternalServerError)
		return
	}
	jsonData(w, map[string]any{"id": id})
}

func (h *MMQHandler) ListNotulensi(w http.ResponseWriter, r *http.Request) {
	// Kolom nyata mmq_notulensi: id, schedule_id, tanggal, judul, isi, notulen_id,
	// created_at, updated_at, created_by, updated_by. Nama notulen di-join dari guru
	// karena MmqSection.jsx membaca item.notulen?.nama.
	rows, err := h.db.Query(r.Context(), `
		SELECT n.id::text, n.schedule_id::text, n.tanggal::text, n.judul, n.isi,
		       n.notulen_id::text, n.created_by::text, g.nama
		FROM mmq_notulensi n
		LEFT JOIN guru g ON g.id = n.notulen_id
		ORDER BY n.tanggal DESC
	`)
	if err != nil {
		jsonError(w, "gagal memuat notulensi", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	out := []map[string]any{}
	for rows.Next() {
		var id, scheduleID, tanggal, judul string
		var isi, notulenID, createdBy, notulenNama *string
		if err := rows.Scan(&id, &scheduleID, &tanggal, &judul, &isi, &notulenID, &createdBy, &notulenNama); err != nil {
			jsonError(w, "gagal membaca data", http.StatusInternalServerError)
			return
		}
		var notulen any
		if notulenID != nil {
			notulen = map[string]any{"id": *notulenID, "nama": notulenNama}
		}
		out = append(out, map[string]any{
			"id": id, "schedule_id": scheduleID, "tanggal": tanggal,
			"judul": judul, "isi": isi, "notulen_id": notulenID,
			"notulen": notulen, "created_by": createdBy,
		})
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "gagal membaca data", http.StatusInternalServerError)
		return
	}
	jsonData(w, out)
}
