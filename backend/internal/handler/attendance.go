package handler

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"lpq-backend/internal/middleware"
)

// isValidISODate melaporkan apakah s berformat tanggal YYYY-MM-DD yang sah.
// Dipakai untuk menolak tanggal ngawur di endpoint kalender sebelum menyentuh
// kolom `date`, supaya galat muncul sebagai 400 yang jelas, bukan 500.
func isValidISODate(s string) bool {
	_, err := time.Parse("2006-01-02", s)
	return err == nil
}

// AttendanceHandler menangani domain absensi (santri & guru), kalender akademik,
// serta self check-in kiosk.
type AttendanceHandler struct {
	db *pgxpool.Pool
}

func NewAttendanceHandler(db *pgxpool.Pool) *AttendanceHandler {
	return &AttendanceHandler{db: db}
}

// Routes mengembalikan sub-router untuk di-mount di /api/attendance.
func (h *AttendanceHandler) Routes() chi.Router {
	r := chi.NewRouter()

	// Record. Create stays open to operational roles because the RFID kiosk runs
	// under whichever staff account opened it. Correcting an existing row is a
	// different act: only back-office roles may do it, enforced inside the
	// handlers so superadmin is covered too.
	r.Post("/", h.Create)
	r.Put("/{id}", h.Update)
	r.Put("/{id}/absent", h.MarkAbsent)

	// Fetch
	r.Get("/", h.List)
	r.Get("/today", h.Today)
	r.Get("/dates", h.Dates)
	r.Get("/count", h.Count)
	r.Get("/recap", h.Recap)

	// Calendar. Reads are open to any authenticated user (the attendance recap and
	// rapor generator both need the holiday list); writes are staff-only.
	r.Get("/calendar", h.Calendar)
	r.Get("/calendar-settings", h.CalendarMonthSettings)
	r.Group(func(r chi.Router) {
		r.Use(middleware.RequireRole("admin", "tata_usaha"))
		r.Put("/calendar-settings/{year}/{month}", h.UpsertCalendarMonthSetting)
		r.Delete("/calendar-settings/{year}/{month}", h.DeleteCalendarMonthSetting)
		r.Post("/calendar", h.CreateCalendar)
		r.Put("/calendar/{id}", h.UpdateCalendar)
		r.Delete("/calendar/{id}", h.DeleteCalendar)
	})

	// Stats
	r.Get("/guru-stats", h.GuruStats)
	r.Get("/santri-stats", h.SantriStats)

	// Kiosk self check-in
	r.Post("/self-checkin", h.SelfCheckin)

	return r
}

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type attendanceInput struct {
	UserID            string  `json:"user_id"`
	Role              string  `json:"role"`
	AttendanceDate    string  `json:"attendance_date"`
	CheckInTime       *string `json:"check_in_time"`
	CheckInTimestamp  *string `json:"check_in_timestamp"`
	ClassID           *string `json:"class_id"`
	JadwalPelajaranID *string `json:"jadwal_pelajaran_id"`
	MataPelajaranID   *string `json:"mata_pelajaran_id"`
	Sesi              string  `json:"sesi"`
	AttendedSession   *string `json:"attended_session"`
	Status            string  `json:"status"`
	Source            string  `json:"source"`
}

type attendanceRow struct {
	ID                string  `json:"id"`
	UserID            string  `json:"user_id"`
	Role              string  `json:"role"`
	AttendanceDate    string  `json:"attendance_date"`
	CheckInTime       *string `json:"check_in_time"`
	CheckInTimestamp  *string `json:"check_in_timestamp"`
	ClassID           *string `json:"class_id"`
	JadwalPelajaranID *string `json:"jadwal_pelajaran_id"`
	MataPelajaranID   *string `json:"mata_pelajaran_id"`
	Sesi              *string `json:"sesi"`
	AttendedSession   *string `json:"attended_session"`
	Status            *string `json:"status"`
	Source            *string `json:"source"`
	CreatedAt         *string `json:"created_at"`
}

const attendanceSelectCols = `
	id::text,
	user_id::text,
	role,
	attendance_date::text,
	check_in_time::text,
	check_in_timestamp::text,
	class_id::text,
	jadwal_pelajaran_id::text,
	mata_pelajaran_id::text,
	sesi,
	attended_session,
	status,
	source,
	created_at::text
`

func scanAttendance(rows pgx.Rows) ([]attendanceRow, error) {
	defer rows.Close()
	out := make([]attendanceRow, 0)
	for rows.Next() {
		var a attendanceRow
		if err := rows.Scan(
			&a.ID, &a.UserID, &a.Role, &a.AttendanceDate,
			&a.CheckInTime, &a.CheckInTimestamp, &a.ClassID,
			&a.JadwalPelajaranID, &a.MataPelajaranID,
			&a.Sesi, &a.AttendedSession, &a.Status, &a.Source, &a.CreatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// -----------------------------------------------------------------------------
// Record: POST / dan PUT /{id}
// -----------------------------------------------------------------------------

func (h *AttendanceHandler) Create(w http.ResponseWriter, r *http.Request) {
	var in attendanceInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	ctxUser := middleware.UserIDFromCtx(r.Context())
	ctxRole := middleware.RoleFromCtx(r.Context())

	// Authz: admin & guru boleh isi untuk orang lain; santri hanya diri sendiri.
	if ctxRole == "santri" && in.UserID != ctxUser {
		jsonError(w, "santri hanya dapat mengisi absensi sendiri", http.StatusForbidden)
		return
	}

	if in.UserID == "" || in.AttendanceDate == "" {
		jsonError(w, "user_id dan attendance_date wajib diisi", http.StatusBadRequest)
		return
	}

	// role adalah enum app_role NOT NULL — string kosong bukan nilai enum yang sah,
	// jadi ambil dari konteks JWT bila klien tidak mengirimnya.
	if in.Role == "" {
		in.Role = ctxRole
	}
	if !isValidAppRole(in.Role) {
		jsonError(w, "role tidak valid", http.StatusBadRequest)
		return
	}

	if err := h.validateGuruLessonAttendance(r.Context(), &in, ctxRole, ctxUser); err != nil {
		var requestErr *attendanceRequestError
		if errors.As(err, &requestErr) {
			jsonError(w, requestErr.message, requestErr.status)
		} else {
			jsonError(w, "jadwal pelajaran tidak dapat divalidasi.", http.StatusBadRequest)
		}
		return
	}

	if strings.TrimSpace(in.Sesi) == "" {
		jsonError(w, "user_id, attendance_date, dan sesi wajib diisi", http.StatusBadRequest)
		return
	}

	applyAttendanceDefaults(&in)

	row, dup, err := h.insertAttendance(r.Context(), in)
	if err != nil {
		jsonError(w, "gagal menyimpan absensi", http.StatusInternalServerError)
		return
	}
	if dup {
		jsonError(w, "absensi untuk sesi ini sudah tercatat", http.StatusConflict)
		return
	}
	jsonCreated(w, row)
}

// isValidAppRole mencocokkan nilai dengan enum public.app_role. Nilai di luar
// daftar ini akan ditolak Postgres saat cast ke enum.
//
// Daftarnya HARUS memuat keenam nilai enum. Dua ditambahkan migrasi yang lebih
// baru — `tata_usaha` (20260805000100) dan `superadmin` (20260806000700) — dan
// keduanya sempat tertinggal di sini, sehingga absensi yang dicatat oleh kedua
// peran itu ditolak sebagai peran tidak sah. Menambah nilai enum baru berarti
// menambahkannya di sini juga.
func isValidAppRole(role string) bool {
	switch role {
	case "admin", "guru", "santri", "pentashih", "tata_usaha", "superadmin":
		return true
	}
	return false
}

// applyAttendanceDefaults mengisi kolom NOT NULL yang punya default di skema.
// Mengirim string kosong lewat parameter query TIDAK memicu default kolom dan
// justru menabrak attendance_status_not_blank / attendance_source_check, jadi
// default-nya harus dicerminkan di sini.
func applyAttendanceDefaults(in *attendanceInput) {
	if strings.TrimSpace(in.Status) == "" {
		in.Status = "Hadir" // default kolom attendance.status
	}
	if strings.TrimSpace(in.Source) == "" {
		in.Source = "manual" // salah satu nilai attendance_source_check
	}
}

// insertAttendance mengecek duplikat lalu insert. Mengembalikan (row, isDuplicate, err).
func (h *AttendanceHandler) insertAttendance(ctx context.Context, in attendanceInput) (*attendanceRow, bool, error) {
	// Jaring terakhir: pemanggil mana pun tidak boleh lolos dengan status/source kosong.
	applyAttendanceDefaults(&in)

	// Cek duplikat via constraint (user_id, attendance_date, sesi).
	var existing string
	var err error
	if in.JadwalPelajaranID != nil && strings.TrimSpace(*in.JadwalPelajaranID) != "" {
		err = h.db.QueryRow(ctx,
			"SELECT id::text FROM attendance WHERE user_id = $1 AND attendance_date = $2 AND (jadwal_pelajaran_id = $3 OR (jadwal_pelajaran_id IS NULL AND sesi = $4)) LIMIT 1",
			in.UserID, in.AttendanceDate, *in.JadwalPelajaranID, in.Sesi,
		).Scan(&existing)
	} else {
		err = h.db.QueryRow(ctx,
			"SELECT id::text FROM attendance WHERE user_id = $1 AND attendance_date = $2 AND jadwal_pelajaran_id IS NULL AND sesi = $3 LIMIT 1",
			in.UserID, in.AttendanceDate, in.Sesi,
		).Scan(&existing)
	}
	if err == nil {
		return nil, true, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return nil, false, err
	}

	var a attendanceRow
	err = h.db.QueryRow(ctx, `
		INSERT INTO attendance (
			user_id, role, attendance_date, check_in_time, check_in_timestamp,
			class_id, jadwal_pelajaran_id, mata_pelajaran_id, sesi, attended_session, status, source
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
		RETURNING `+attendanceSelectCols+`
	`,
		in.UserID, in.Role, in.AttendanceDate, in.CheckInTime, in.CheckInTimestamp,
		in.ClassID, in.JadwalPelajaranID, in.MataPelajaranID,
		in.Sesi, in.AttendedSession, in.Status, in.Source,
	).Scan(
		&a.ID, &a.UserID, &a.Role, &a.AttendanceDate,
		&a.CheckInTime, &a.CheckInTimestamp, &a.ClassID,
		&a.JadwalPelajaranID, &a.MataPelajaranID,
		&a.Sesi, &a.AttendedSession, &a.Status, &a.Source, &a.CreatedAt,
	)
	if err != nil {
		// Tangani race pada unique constraint.
		if strings.Contains(err.Error(), "duplicate key value violates unique constraint") ||
			strings.Contains(err.Error(), "attendance_legacy_user_date_sesi_unique") ||
			strings.Contains(err.Error(), "attendance_guru_schedule_unique") {
			return nil, true, nil
		}
		return nil, false, err
	}
	return &a, false, nil
}

func (h *AttendanceHandler) Update(w http.ResponseWriter, r *http.Request) {
	// Correcting a recorded check-in is a back-office act. Without this the route
	// was open to every authenticated user, so a santri could rewrite any row.
	if !middleware.CanManage(middleware.RoleFromCtx(r.Context())) {
		jsonError(w, "koreksi absensi hanya dapat dilakukan admin atau tata usaha", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	var in attendanceInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	// Partial update: hanya kolom yang dikirim (non-nil / non-empty) yang di-set.
	set := make([]string, 0, 10)
	args := make([]any, 0, 11)
	idx := 1

	add := func(col string, val any) {
		set = append(set, col+" = $"+strconv.Itoa(idx))
		args = append(args, val)
		idx++
	}

	if in.Role != "" {
		add("role", in.Role)
	}
	if in.AttendanceDate != "" {
		add("attendance_date", in.AttendanceDate)
	}
	if in.CheckInTime != nil {
		add("check_in_time", *in.CheckInTime)
	}
	if in.CheckInTimestamp != nil {
		add("check_in_timestamp", *in.CheckInTimestamp)
	}
	if in.ClassID != nil {
		add("class_id", *in.ClassID)
	}
	if in.Sesi != "" {
		add("sesi", in.Sesi)
	}
	if in.AttendedSession != nil {
		add("attended_session", *in.AttendedSession)
	}
	if in.Status != "" {
		add("status", in.Status)
	}
	if in.Source != "" {
		add("source", in.Source)
	}

	if len(set) == 0 {
		jsonError(w, "tidak ada field untuk diperbarui", http.StatusBadRequest)
		return
	}

	args = append(args, id)
	query := "UPDATE attendance SET " + strings.Join(set, ", ") +
		" WHERE id = $" + strconv.Itoa(idx) + " RETURNING " + attendanceSelectCols

	var a attendanceRow
	err := h.db.QueryRow(r.Context(), query, args...).Scan(
		&a.ID, &a.UserID, &a.Role, &a.AttendanceDate,
		&a.CheckInTime, &a.CheckInTimestamp, &a.ClassID,
		&a.JadwalPelajaranID, &a.MataPelajaranID,
		&a.Sesi, &a.AttendedSession, &a.Status, &a.Source, &a.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "absensi tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal memperbarui absensi", http.StatusInternalServerError)
		return
	}
	jsonOK(w, a)
}

// MarkAbsent PUT /{id}/absent — mengubah satu record menjadi "Tidak Hadir".
//
// Terpisah dari Update karena harus meng-set check_in_time dan
// check_in_timestamp ke NULL, sementara Update memakai aturan "field kosong =
// tidak diubah" sehingga tidak bisa mengirim NULL. corrected_by diambil dari
// JWT, bukan dari body, supaya jejak koreksi tidak bisa dipalsukan klien.
// attendance_correction_reason_required mewajibkan alasan non-blank ketika
// corrected_by terisi, jadi ada default bila klien tidak mengirimnya.
func (h *AttendanceHandler) MarkAbsent(w http.ResponseWriter, r *http.Request) {
	// Same rule as Update: guru used to hold this and could overturn a recorded
	// check-in from their own dashboard.
	if !middleware.CanManage(middleware.RoleFromCtx(r.Context())) {
		jsonError(w, "koreksi absensi hanya dapat dilakukan admin atau tata usaha", http.StatusForbidden)
		return
	}

	id := chi.URLParam(r, "id")
	if id == "" {
		jsonError(w, "id wajib diisi", http.StatusBadRequest)
		return
	}

	var body struct {
		CorrectionReason string `json:"correction_reason"`
	}
	// Body opsional — alasan default dipakai bila tidak dikirim.
	_ = json.NewDecoder(r.Body).Decode(&body)

	reason := strings.TrimSpace(body.CorrectionReason)
	if reason == "" {
		reason = "Ditandai tidak hadir dari rekap absensi."
	}

	correctedBy := middleware.UserIDFromCtx(r.Context())
	var correctedByArg any
	if correctedBy != "" {
		correctedByArg = correctedBy
	}

	var a attendanceRow
	err := h.db.QueryRow(r.Context(), `
		UPDATE attendance SET
			check_in_time      = NULL,
			check_in_timestamp = NULL,
			status             = 'Tidak Hadir',
			source             = 'correction',
			correction_reason  = $1,
			corrected_by       = $2,
			updated_at         = now()
		WHERE id = $3
		RETURNING `+attendanceSelectCols,
		reason, correctedByArg, id,
	).Scan(
		&a.ID, &a.UserID, &a.Role, &a.AttendanceDate,
		&a.CheckInTime, &a.CheckInTimestamp, &a.ClassID,
		&a.JadwalPelajaranID, &a.MataPelajaranID,
		&a.Sesi, &a.AttendedSession, &a.Status, &a.Source, &a.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "absensi tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal mengubah status absensi", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": a})
}

// -----------------------------------------------------------------------------
// Fetch: GET /, /today, /dates, /count, /recap
// -----------------------------------------------------------------------------

func (h *AttendanceHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	where := make([]string, 0, 8)
	args := make([]any, 0, 8)
	idx := 1
	add := func(clause string, val any) {
		where = append(where, clause+" = $"+strconv.Itoa(idx))
		args = append(args, val)
		idx++
	}

	if v := q.Get("user_id"); v != "" {
		add("user_id", v)
	}
	if v := q.Get("role"); v != "" {
		add("role", v)
	}
	if v := q.Get("class_id"); v != "" {
		add("class_id", v)
	}
	if v := strings.TrimSpace(q.Get("class_ids")); v != "" {
		where = append(where, "class_id = ANY($"+strconv.Itoa(idx)+")")
		args = append(args, strings.Split(v, ","))
		idx++
	}
	if v := q.Get("date"); v != "" {
		add("attendance_date", v)
	}
	if v := q.Get("sesi"); v != "" {
		add("sesi", v)
	}
	if v := strings.TrimSpace(q.Get("sesi_in")); v != "" {
		where = append(where, "sesi = ANY($"+strconv.Itoa(idx)+")")
		args = append(args, strings.Split(v, ","))
		idx++
	}
	if v := q.Get("date_from"); v != "" {
		where = append(where, "attendance_date >= $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}
	if v := q.Get("date_to"); v != "" {
		where = append(where, "attendance_date <= $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}

	// Scope by caller. Back-office roles see everything; anyone else is pinned to
	// their own rows, so a guru cannot read another guru's recap by passing an
	// arbitrary user_id. Guru still needs santri rows for their class roster, so
	// only guru-role rows are restricted for them.
	ctxUser := middleware.UserIDFromCtx(r.Context())
	ctxRole := middleware.RoleFromCtx(r.Context())
	if !middleware.CanManage(ctxRole) {
		if ctxUser == "" {
			jsonError(w, "sesi tidak valid", http.StatusUnauthorized)
			return
		}
		if ctxRole == "guru" {
			where = append(where, "(user_id = $"+strconv.Itoa(idx)+" OR role <> 'guru')")
		} else {
			where = append(where, "user_id = $"+strconv.Itoa(idx))
		}
		args = append(args, ctxUser)
		idx++
	}

	page, limit := parsePagination(q)
	offset := (page - 1) * limit

	query := "SELECT " + attendanceSelectCols + " FROM attendance"
	if len(where) > 0 {
		query += " WHERE " + strings.Join(where, " AND ")
	}
	query += " ORDER BY attendance_date DESC, check_in_timestamp DESC NULLS LAST"
	query += " LIMIT $" + strconv.Itoa(idx) + " OFFSET $" + strconv.Itoa(idx+1)
	args = append(args, limit, offset)

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil data absensi", http.StatusInternalServerError)
		return
	}
	list, err := scanAttendance(rows)
	if err != nil {
		jsonError(w, "gagal membaca data absensi", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{
		"data": list,
		"meta": map[string]int{"page": page, "limit": limit},
	})
}

func (h *AttendanceHandler) Today(w http.ResponseWriter, r *http.Request) {
	classID := r.URL.Query().Get("class_id")

	query := "SELECT " + attendanceSelectCols + " FROM attendance WHERE attendance_date = CURRENT_DATE"
	args := make([]any, 0, 1)
	if classID != "" {
		query += " AND class_id = $1"
		args = append(args, classID)
	}
	query += " ORDER BY check_in_timestamp DESC NULLS LAST"

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil absensi hari ini", http.StatusInternalServerError)
		return
	}
	list, err := scanAttendance(rows)
	if err != nil {
		jsonError(w, "gagal membaca absensi hari ini", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": list})
}

func (h *AttendanceHandler) Dates(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	userID := q.Get("user_id")
	if userID == "" {
		jsonError(w, "user_id wajib diisi", http.StatusBadRequest)
		return
	}
	limit := 100
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limit = n
		}
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT DISTINCT attendance_date::text
		FROM attendance
		WHERE user_id = $1
		ORDER BY attendance_date DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		jsonError(w, "gagal mengambil tanggal absensi", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	dates := make([]string, 0)
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			jsonError(w, "gagal membaca tanggal absensi", http.StatusInternalServerError)
			return
		}
		dates = append(dates, d)
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "gagal membaca tanggal absensi", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": dates})
}

func (h *AttendanceHandler) Count(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	userID := q.Get("user_id")
	if userID == "" {
		jsonError(w, "user_id wajib diisi", http.StatusBadRequest)
		return
	}

	// The month filter is current-month-only by construction (it compares
	// against CURRENT_DATE, it does not take a month number), so the param it
	// reads is current_month — which is what attendanceAdapters.js sends.
	// "month" stays accepted as a legacy alias for the same behaviour.
	query := "SELECT COUNT(*) FROM attendance WHERE user_id = $1"
	if q.Get("current_month") != "" || q.Get("month") != "" {
		query += " AND date_trunc('month', attendance_date) = date_trunc('month', CURRENT_DATE)"
	}

	var count int
	if err := h.db.QueryRow(r.Context(), query, userID).Scan(&count); err != nil {
		jsonError(w, "gagal menghitung absensi", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": map[string]int{"count": count}})
}

func (h *AttendanceHandler) Recap(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	userID := q.Get("user_id")
	if userID == "" {
		jsonError(w, "user_id wajib diisi", http.StatusBadRequest)
		return
	}

	where := []string{"user_id = $1"}
	args := []any{userID}
	idx := 2
	if v := q.Get("date_from"); v != "" {
		where = append(where, "attendance_date >= $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}
	if v := q.Get("date_to"); v != "" {
		where = append(where, "attendance_date <= $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}

	// Ambil detail baris untuk laporan.
	detailQuery := "SELECT " + attendanceSelectCols + " FROM attendance WHERE " +
		strings.Join(where, " AND ") + " ORDER BY attendance_date ASC"
	rows, err := h.db.Query(r.Context(), detailQuery, args...)
	if err != nil {
		jsonError(w, "gagal mengambil rekap absensi", http.StatusInternalServerError)
		return
	}
	list, err := scanAttendance(rows)
	if err != nil {
		jsonError(w, "gagal membaca rekap absensi", http.StatusInternalServerError)
		return
	}

	// Ringkasan per status.
	summaryQuery := "SELECT status, COUNT(*) FROM attendance WHERE " +
		strings.Join(where, " AND ") + " GROUP BY status"
	srows, err := h.db.Query(r.Context(), summaryQuery, args...)
	if err != nil {
		jsonError(w, "gagal mengambil ringkasan absensi", http.StatusInternalServerError)
		return
	}
	defer srows.Close()

	summary := map[string]int{}
	for srows.Next() {
		var status *string
		var n int
		if err := srows.Scan(&status, &n); err != nil {
			jsonError(w, "gagal membaca ringkasan absensi", http.StatusInternalServerError)
			return
		}
		key := "Unknown"
		if status != nil {
			key = *status
		}
		summary[key] = n
	}
	if err := srows.Err(); err != nil {
		jsonError(w, "gagal membaca ringkasan absensi", http.StatusInternalServerError)
		return
	}

	jsonOK(w, map[string]any{
		"data": map[string]any{
			"records": list,
			"summary": summary,
		},
	})
}

// -----------------------------------------------------------------------------
// Calendar: GET /calendar, POST /calendar
// -----------------------------------------------------------------------------

func (h *AttendanceHandler) Calendar(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from := q.Get("date_from")
	to := q.Get("date_to")
	if from == "" || to == "" {
		jsonError(w, "date_from dan date_to wajib diisi", http.StatusBadRequest)
		return
	}

	// Two shapes, deliberately. The default returns bare holiday dates because
	// every attendance consumer (rapor, rekap) only ever asks "is this day off?" —
	// keeping that payload small matters on a year-wide range.
	// `view=full` returns whole rows and is what the calendar admin panel needs
	// to list, edit and delete individual agenda entries.
	if q.Get("view") == "full" {
		h.calendarFull(w, r, from, to)
		return
	}

	// DISTINCT because a date may now carry several agenda entries; a duplicated
	// date would make any consumer counting holidays double-count them.
	rows, err := h.db.Query(r.Context(), `
		SELECT DISTINCT date::text
		FROM academic_calendar
		WHERE is_holiday = true AND date BETWEEN $1 AND $2
		ORDER BY date ASC
	`, from, to)
	if err != nil {
		jsonError(w, "gagal mengambil kalender akademik", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	dates := make([]string, 0)
	for rows.Next() {
		var d string
		if err := rows.Scan(&d); err != nil {
			jsonError(w, "gagal membaca kalender akademik", http.StatusInternalServerError)
			return
		}
		dates = append(dates, d)
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "gagal membaca kalender akademik", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": dates})
}

// CalendarMonthSettings GET /calendar-settings?year=2026 — aturan Sabtu per
// bulan. Bulan tanpa baris sengaja tidak dikembalikan agar klien dapat memakai
// perilaku bawaan lama (Sabtu dan Minggu libur otomatis).
func (h *AttendanceHandler) CalendarMonthSettings(w http.ResponseWriter, r *http.Request) {
	year, err := parseCalendarYear(r.URL.Query().Get("year"))
	if err != nil {
		jsonError(w, "year tidak valid", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT id::text, year, month, saturday_is_holiday
		FROM academic_calendar_month_settings
		WHERE year = $1
		ORDER BY month ASC
	`, year)
	if err != nil {
		jsonError(w, "gagal mengambil aturan kalender", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			id                string
			rowYear           int
			month             int16
			saturdayIsHoliday bool
		)
		if err := rows.Scan(&id, &rowYear, &month, &saturdayIsHoliday); err != nil {
			jsonError(w, "gagal membaca aturan kalender", http.StatusInternalServerError)
			return
		}
		items = append(items, map[string]any{
			"id":                  id,
			"year":                rowYear,
			"month":               month,
			"saturday_is_holiday": saturdayIsHoliday,
		})
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "gagal membaca aturan kalender", http.StatusInternalServerError)
		return
	}
	jsonData(w, items)
}

type calendarMonthSettingInput struct {
	SaturdayIsHoliday *bool `json:"saturday_is_holiday"`
}

func parseCalendarYear(value string) (int, error) {
	year, err := strconv.Atoi(value)
	if err != nil || year < 1 || year > 9999 {
		return 0, errors.New("year tidak valid")
	}
	return year, nil
}

func parseCalendarMonth(value string) (int16, error) {
	month, err := strconv.Atoi(value)
	if err != nil || month < 1 || month > 12 {
		return 0, errors.New("month tidak valid")
	}
	return int16(month), nil
}

// UpsertCalendarMonthSetting PUT /calendar-settings/{year}/{month} — membuat
// atau menyunting aturan Sabtu tanpa menyentuh agenda di academic_calendar.
func (h *AttendanceHandler) UpsertCalendarMonthSetting(w http.ResponseWriter, r *http.Request) {
	year, err := parseCalendarYear(chi.URLParam(r, "year"))
	if err != nil {
		jsonError(w, "year tidak valid", http.StatusBadRequest)
		return
	}
	month, err := parseCalendarMonth(chi.URLParam(r, "month"))
	if err != nil {
		jsonError(w, "month tidak valid", http.StatusBadRequest)
		return
	}

	var in calendarMonthSettingInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if in.SaturdayIsHoliday == nil {
		jsonError(w, "saturday_is_holiday wajib diisi", http.StatusBadRequest)
		return
	}

	var (
		id                string
		rowYear           int
		rowMonth          int16
		saturdayIsHoliday bool
	)
	actor := nullableUserID(r)
	err = h.db.QueryRow(r.Context(), `
		INSERT INTO academic_calendar_month_settings
			(year, month, saturday_is_holiday, created_by, updated_by)
		VALUES ($1, $2, $3, $4, $4)
		ON CONFLICT (year, month) DO UPDATE SET
			saturday_is_holiday = EXCLUDED.saturday_is_holiday,
			updated_by = EXCLUDED.updated_by
		RETURNING id::text, year, month, saturday_is_holiday
	`, year, month, *in.SaturdayIsHoliday, actor).Scan(
		&id, &rowYear, &rowMonth, &saturdayIsHoliday,
	)
	if err != nil {
		jsonError(w, "gagal menyimpan aturan kalender", http.StatusBadRequest)
		return
	}

	jsonData(w, map[string]any{
		"id":                  id,
		"year":                rowYear,
		"month":               rowMonth,
		"saturday_is_holiday": saturdayIsHoliday,
	})
}

// DeleteCalendarMonthSetting DELETE /calendar-settings/{year}/{month} —
// menghapus override bulan sehingga perilaku default lama kembali berlaku.
func (h *AttendanceHandler) DeleteCalendarMonthSetting(w http.ResponseWriter, r *http.Request) {
	year, err := parseCalendarYear(chi.URLParam(r, "year"))
	if err != nil {
		jsonError(w, "year tidak valid", http.StatusBadRequest)
		return
	}
	month, err := parseCalendarMonth(chi.URLParam(r, "month"))
	if err != nil {
		jsonError(w, "month tidak valid", http.StatusBadRequest)
		return
	}

	result, err := h.db.Exec(r.Context(), `
		DELETE FROM academic_calendar_month_settings
		WHERE year = $1 AND month = $2
	`, year, month)
	if err != nil {
		jsonError(w, "gagal mengembalikan aturan kalender", http.StatusInternalServerError)
		return
	}
	if result.RowsAffected() == 0 {
		jsonError(w, "aturan kalender belum tersedia", http.StatusNotFound)
		return
	}
	jsonData(w, map[string]any{
		"year":    year,
		"month":   month,
		"deleted": true,
	})
}

// PublicCalendar GET /api/public/calendar — agenda yang boleh tampil di website
// sekolah. Tanpa autentikasi: hanya mengembalikan baris is_public = true dan
// hanya field yang aman ditampilkan publik (tanpa metadata internal). Dipakai
// situs SDN Baturaja lewat publicFetch.
func (h *AttendanceHandler) PublicCalendar(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from := q.Get("date_from")
	to := q.Get("date_to")
	if from == "" || to == "" {
		jsonError(w, "date_from dan date_to wajib diisi", http.StatusBadRequest)
		return
	}
	if !isValidISODate(from) || !isValidISODate(to) {
		jsonError(w, "format tanggal tidak valid (harus YYYY-MM-DD)", http.StatusBadRequest)
		return
	}

	rows, err := h.db.Query(r.Context(), `
		SELECT date::text, title, description, is_holiday, event_type
		FROM academic_calendar
		WHERE is_public = true AND date BETWEEN $1 AND $2
		ORDER BY date ASC, created_at ASC
	`, from, to)
	if err != nil {
		jsonError(w, "gagal mengambil kalender akademik", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			date, title            string
			description, eventType *string
			isHoliday              bool
		)
		if err := rows.Scan(&date, &title, &description, &isHoliday, &eventType); err != nil {
			jsonError(w, "gagal membaca kalender akademik", http.StatusInternalServerError)
			return
		}
		items = append(items, map[string]any{
			"date":        date,
			"title":       title,
			"description": description,
			"is_holiday":  isHoliday,
			"event_type":  eventType,
		})
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "gagal membaca kalender akademik", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": items})
}

// calendarFull returns every agenda entry in the range, holidays and school
// days alike, ordered so that entries sharing a date keep a stable sequence.
func (h *AttendanceHandler) calendarFull(w http.ResponseWriter, r *http.Request, from, to string) {
	rows, err := h.db.Query(r.Context(), `
		SELECT id::text, date::text, title, description, is_holiday, is_public, event_type
		FROM academic_calendar
		WHERE date BETWEEN $1 AND $2
		ORDER BY date ASC, created_at ASC
	`, from, to)
	if err != nil {
		jsonError(w, "gagal mengambil kalender akademik", http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	items := make([]map[string]any, 0)
	for rows.Next() {
		var (
			id, date, title        string
			description, eventType *string
			isHoliday, isPublic    bool
		)
		if err := rows.Scan(&id, &date, &title, &description, &isHoliday, &isPublic, &eventType); err != nil {
			jsonError(w, "gagal membaca kalender akademik", http.StatusInternalServerError)
			return
		}
		items = append(items, map[string]any{
			"id":          id,
			"date":        date,
			"title":       title,
			"description": description,
			"is_holiday":  isHoliday,
			"is_public":   isPublic,
			"event_type":  eventType,
		})
	}
	if err := rows.Err(); err != nil {
		jsonError(w, "gagal membaca kalender akademik", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": items})
}

type calendarInput struct {
	Date        string  `json:"date"`
	Title       string  `json:"title"`
	IsHoliday   *bool   `json:"is_holiday"`
	IsPublic    *bool   `json:"is_public"`
	EventType   *string `json:"event_type"`
	Description *string `json:"description"`
}

func (h *AttendanceHandler) CreateCalendar(w http.ResponseWriter, r *http.Request) {
	var in calendarInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	if in.Date == "" {
		jsonError(w, "date wajib diisi", http.StatusBadRequest)
		return
	}
	if !isValidISODate(in.Date) {
		jsonError(w, "format tanggal tidak valid (harus YYYY-MM-DD)", http.StatusBadRequest)
		return
	}
	isHoliday := true
	if in.IsHoliday != nil {
		isHoliday = *in.IsHoliday
	}
	isPublic := true
	if in.IsPublic != nil {
		isPublic = *in.IsPublic
	}

	// title NOT NULL + academic_calendar_title_not_blank. Klien (saveCalendarEvent)
	// sudah mengirim title, tapi fallback tetap perlu agar constraint tidak pernah
	// ditabrak oleh pemanggil lain.
	title := strings.TrimSpace(in.Title)
	if title == "" {
		if in.Description != nil {
			title = strings.TrimSpace(*in.Description)
		}
		if title == "" {
			if isHoliday {
				title = "Hari Libur"
			} else {
				title = "Hari Masuk"
			}
		}
	}

	var (
		id          string
		date        string
		outTitle    string
		holiday     bool
		public      bool
		eventType   *string
		description *string
	)
	err := h.db.QueryRow(r.Context(), `
		INSERT INTO academic_calendar (date, title, description, is_holiday, is_public, event_type)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id::text, date::text, title, is_holiday, is_public, event_type, description
	`, in.Date, title, in.Description, isHoliday, isPublic, in.EventType,
	).Scan(&id, &date, &outTitle, &holiday, &public, &eventType, &description)
	if err != nil {
		jsonError(w, "gagal menyimpan kalender akademik", http.StatusInternalServerError)
		return
	}
	jsonCreated(w, map[string]any{
		"id":          id,
		"date":        date,
		"title":       outTitle,
		"is_holiday":  holiday,
		"is_public":   public,
		"event_type":  eventType,
		"description": description,
	})
}

// Columns a client may change on an existing agenda entry. `date` is included
// so a misdated event can be moved without deleting and re-creating it.
var calendarEditable = map[string]bool{
	"date": true, "title": true, "description": true,
	"is_holiday": true, "is_public": true, "event_type": true,
}

// PUT /api/attendance/calendar/{id}
func (h *AttendanceHandler) UpdateCalendar(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}
	// Tolak tanggal ngawur sebelum menyentuh DB — kalau tidak, muncul 400 generik
	// dari driver, bukan pesan yang jelas.
	if d, ok := body["date"]; ok {
		ds, isStr := d.(string)
		if !isStr || !isValidISODate(ds) {
			jsonError(w, "format tanggal tidak valid (harus YYYY-MM-DD)", http.StatusBadRequest)
			return
		}
	}
	// The client sends created_by/updated_by for parity with the insert path;
	// they are not in the allowlist and updateRow drops them silently.
	item, err := updateRow(r.Context(), h.db, "academic_calendar", id, body, calendarEditable)
	if err != nil {
		if errors.Is(err, errNoFields) {
			jsonError(w, "tidak ada field yang bisa diperbarui", http.StatusBadRequest)
			return
		}
		if errors.Is(err, pgx.ErrNoRows) {
			jsonError(w, "agenda tidak ditemukan", http.StatusNotFound)
			return
		}
		jsonError(w, "gagal memperbarui agenda: "+err.Error(), http.StatusBadRequest)
		return
	}
	jsonData(w, item)
}

// DELETE /api/attendance/calendar/{id} — hard delete. The table carries no
// deleted_at column and an agenda entry has no downstream references, so a
// soft delete would only leave rows the holiday query has to filter out.
func (h *AttendanceHandler) DeleteCalendar(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	ct, err := h.db.Exec(r.Context(), `DELETE FROM academic_calendar WHERE id = $1`, id)
	if err != nil {
		jsonError(w, "gagal menghapus agenda", http.StatusInternalServerError)
		return
	}
	if ct.RowsAffected() == 0 {
		jsonError(w, "agenda tidak ditemukan", http.StatusNotFound)
		return
	}
	jsonData(w, map[string]any{"id": id, "deleted": true})
}

// -----------------------------------------------------------------------------
// Stats: GET /guru-stats, GET /santri-stats
// -----------------------------------------------------------------------------

func (h *AttendanceHandler) GuruStats(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from := q.Get("date_from")
	to := q.Get("date_to")

	where := []string{"role = 'guru'"}
	args := make([]any, 0, 2)
	idx := 1
	if from != "" {
		where = append(where, "attendance_date >= $"+strconv.Itoa(idx))
		args = append(args, from)
		idx++
	}
	if to != "" {
		where = append(where, "attendance_date <= $"+strconv.Itoa(idx))
		args = append(args, to)
		idx++
	}

	query := "SELECT " + attendanceSelectCols + " FROM attendance WHERE " +
		strings.Join(where, " AND ") + " ORDER BY attendance_date DESC, user_id"
	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil statistik guru", http.StatusInternalServerError)
		return
	}
	list, err := scanAttendance(rows)
	if err != nil {
		jsonError(w, "gagal membaca statistik guru", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": list})
}

func (h *AttendanceHandler) SantriStats(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	from := q.Get("date_from")
	to := q.Get("date_to")

	// Tentukan guru: admin boleh lewat query param guru_id; guru pakai konteks sendiri.
	ctxUser := middleware.UserIDFromCtx(r.Context())
	ctxRole := middleware.RoleFromCtx(r.Context())
	guruID := ctxUser
	if middleware.CanManage(ctxRole) {
		if v := q.Get("guru_id"); v != "" {
			guruID = v
		}
	}

	where := []string{
		"a.role = 'santri'",
		// Batasi ke santri yang kelasnya diampu guru.
		"a.class_id IN (SELECT id FROM classes WHERE id_guru = $1)",
	}
	args := []any{guruID}
	idx := 2

	// Filter class_id opsional (untuk admin yang ingin kelas tertentu).
	if v := q.Get("class_id"); v != "" {
		where = append(where, "a.class_id = $"+strconv.Itoa(idx))
		args = append(args, v)
		idx++
	}
	if from != "" {
		where = append(where, "a.attendance_date >= $"+strconv.Itoa(idx))
		args = append(args, from)
		idx++
	}
	if to != "" {
		where = append(where, "a.attendance_date <= $"+strconv.Itoa(idx))
		args = append(args, to)
		idx++
	}

	query := `SELECT
		a.id::text, a.user_id::text, a.role, a.attendance_date::text,
		a.check_in_time::text, a.check_in_timestamp::text, a.class_id::text,
		a.jadwal_pelajaran_id::text, a.mata_pelajaran_id::text,
		a.sesi, a.attended_session, a.status, a.source, a.created_at::text
	FROM attendance a
	WHERE ` + strings.Join(where, " AND ") + `
	ORDER BY a.attendance_date DESC, a.user_id`

	rows, err := h.db.Query(r.Context(), query, args...)
	if err != nil {
		jsonError(w, "gagal mengambil statistik santri", http.StatusInternalServerError)
		return
	}
	list, err := scanAttendance(rows)
	if err != nil {
		jsonError(w, "gagal membaca statistik santri", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]any{"data": list})
}

// -----------------------------------------------------------------------------
// Kiosk self check-in: POST /self-checkin
// -----------------------------------------------------------------------------

func (h *AttendanceHandler) SelfCheckin(w http.ResponseWriter, r *http.Request) {
	var in attendanceInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		jsonError(w, "request tidak valid", http.StatusBadRequest)
		return
	}

	ctxUser := middleware.UserIDFromCtx(r.Context())

	// Enforce: hanya boleh check-in untuk diri sendiri.
	if in.UserID == "" {
		in.UserID = ctxUser
	}
	if in.UserID != ctxUser {
		jsonError(w, "hanya dapat check-in untuk diri sendiri", http.StatusForbidden)
		return
	}
	if in.Role == "" {
		in.Role = "santri"
	}
	if !isValidAppRole(in.Role) {
		jsonError(w, "role tidak valid", http.StatusBadRequest)
		return
	}
	// attendance_source_check hanya mengizinkan rfid|manual|correction|import.
	// Self check-in bukan pemindaian kartu, jadi dicatat sebagai "manual" —
	// applyAttendanceDefaults sudah memakai nilai itu sebagai default source.
	applyAttendanceDefaults(&in)
	if in.AttendanceDate == "" || in.Sesi == "" {
		jsonError(w, "attendance_date dan sesi wajib diisi", http.StatusBadRequest)
		return
	}

	row, dup, err := h.insertAttendance(r.Context(), in)
	if err != nil {
		jsonError(w, "gagal melakukan check-in", http.StatusInternalServerError)
		return
	}
	if dup {
		jsonOK(w, map[string]any{
			"success":            true,
			"message":            "Kamu sudah check-in untuk sesi ini",
			"already_checked_in": true,
		})
		return
	}

	// Tambah poin santri (best-effort — tidak menggagalkan check-in).
	incrementPoints(r.Context(), in.UserID, h.db)

	jsonCreated(w, map[string]any{
		"success":            true,
		"message":            "Check-in berhasil",
		"already_checked_in": false,
		"data":               row,
	})
}

// incrementPoints menambah 1 poin santri. Utamakan RPC increment_santri_points;
// jika gagal, fallback ke UPDATE langsung. Best-effort, error di-swallow.
func incrementPoints(ctx context.Context, santriID string, pool *pgxpool.Pool) {
	var newPoints int
	err := pool.QueryRow(ctx, `SELECT increment_santri_points($1, 1)`, santriID).Scan(&newPoints)
	if err == nil {
		return
	}
	// Fallback: update langsung kolom points.
	_, _ = pool.Exec(ctx, `UPDATE santri SET points = points + 1 WHERE id = $1`, santriID)
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

// maxPaginationLimit is the upper bound parsePagination will honour.
const maxPaginationLimit = 500

func parsePagination(q interface {
	Get(string) string
}) (page, limit int) {
	page = 1
	limit = 50
	if v := q.Get("page"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			page = n
		}
	}
	// A limit above the cap is clamped to the cap, not silently dropped back to
	// the default — an over-large request must never return FEWER rows than a
	// request for exactly the cap.
	if v := q.Get("limit"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			if n > maxPaginationLimit {
				n = maxPaginationLimit
			}
			limit = n
		}
	}
	return page, limit
}

func jsonCreated(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]any{"data": v})
}
