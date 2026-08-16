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

	// Record. Create stays open to every authenticated role because the handler
	// itself confines a santri to their own user_id; Update cannot make that
	// distinction — it addresses a row by id — so it is staff-only. Without this
	// guard any santri could rewrite anyone's attendance: status, date, class,
	// even which user the row belongs to.
	r.Post("/", h.Create)
	r.With(middleware.RequireRole("admin", "guru")).Put("/{id}", h.Update)
	r.With(middleware.RequireRole("admin", "guru")).Put("/{id}/absent", h.MarkAbsent)

	// Fetch
	r.Get("/", h.List)
	r.Get("/today", h.Today)
	r.Get("/dates", h.Dates)
	r.Get("/count", h.Count)
	r.Get("/recap", h.Recap)

	// Calendar. Reads are open — every dashboard renders the school calendar —
	// but writes come only from CalendarManagement in the admin panel. Previously
	// unguarded, so any santri could declare a school holiday, which feeds the
	// attendance "effective days" calculation and therefore every recap.
	r.Get("/calendar", h.Calendar)
	r.With(middleware.RequireRole("admin")).Post("/calendar", h.CreateCalendar)

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
	UserID           string  `json:"user_id"`
	Role             string  `json:"role"`
	AttendanceDate   string  `json:"attendance_date"`
	CheckInTime      *string `json:"check_in_time"`
	CheckInTimestamp *string `json:"check_in_timestamp"`
	ClassID          *string `json:"class_id"`
	Sesi             string  `json:"sesi"`
	AttendedSession  *string `json:"attended_session"`
	Status           string  `json:"status"`
	Source           string  `json:"source"`
}

type attendanceRow struct {
	ID               string  `json:"id"`
	UserID           string  `json:"user_id"`
	Role             string  `json:"role"`
	AttendanceDate   string  `json:"attendance_date"`
	CheckInTime      *string `json:"check_in_time"`
	CheckInTimestamp *string `json:"check_in_timestamp"`
	ClassID          *string `json:"class_id"`
	Sesi             *string `json:"sesi"`
	AttendedSession  *string `json:"attended_session"`
	Status           *string `json:"status"`
	Source           *string `json:"source"`
	CreatedAt        *string `json:"created_at"`
}

const attendanceSelectCols = `
	id::text,
	user_id::text,
	role,
	attendance_date::text,
	check_in_time::text,
	check_in_timestamp::text,
	class_id::text,
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

	if in.UserID == "" || in.AttendanceDate == "" || in.Sesi == "" {
		jsonError(w, "user_id, attendance_date, dan sesi wajib diisi", http.StatusBadRequest)
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

// isValidAppRole mencocokkan nilai dengan enum public.app_role
// (20260624000100_extensions_and_types.sql). Nilai di luar daftar ini akan
// ditolak Postgres saat cast ke enum.
func isValidAppRole(role string) bool {
	switch role {
	case "admin", "guru", "santri", "pentashih":
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
	err := h.db.QueryRow(ctx, `
		SELECT id::text FROM attendance
		WHERE user_id = $1 AND attendance_date = $2 AND sesi = $3
		LIMIT 1
	`, in.UserID, in.AttendanceDate, in.Sesi).Scan(&existing)
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
			class_id, sesi, attended_session, status, source
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
		RETURNING `+attendanceSelectCols+`
	`,
		in.UserID, in.Role, in.AttendanceDate, in.CheckInTime, in.CheckInTimestamp,
		in.ClassID, in.Sesi, in.AttendedSession, in.Status, in.Source,
	).Scan(
		&a.ID, &a.UserID, &a.Role, &a.AttendanceDate,
		&a.CheckInTime, &a.CheckInTimestamp, &a.ClassID,
		&a.Sesi, &a.AttendedSession, &a.Status, &a.Source, &a.CreatedAt,
	)
	if err != nil {
		// Tangani race pada unique constraint.
		if strings.Contains(err.Error(), "attendance_user_date_sesi_unique") {
			return nil, true, nil
		}
		return nil, false, err
	}
	return &a, false, nil
}

func (h *AttendanceHandler) Update(w http.ResponseWriter, r *http.Request) {
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

	// Scope a santri to their own rows before any client-supplied filter is
	// applied. Otherwise the user_id filter is optional and a santri could page
	// through the whole school's attendance history.
	if middleware.RoleFromCtx(r.Context()) == "santri" {
		self := middleware.UserIDFromCtx(r.Context())
		if self == "" {
			jsonError(w, "identitas pengguna tidak valid", http.StatusUnauthorized)
			return
		}
		add("user_id", self)
	} else if v := q.Get("user_id"); v != "" {
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

	rows, err := h.db.Query(r.Context(), `
		SELECT date::text
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
	if ctxRole == "admin" {
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

// incrementPoints menambah 1 poin santri. Best-effort, error di-swallow.
//
// Dulu ini mencoba RPC increment_santri_points lebih dulu. RPC itu memeriksa
// auth.uid(), yang selalu null di luar Supabase, jadi ia selalu melempar
// AUTHENTICATION_REQUIRED dan UPDATE di bawahnyalah yang sebenarnya berjalan
// sejak migrasi. Fungsinya sudah ikut hilang bersama skema era-Supabase.
func incrementPoints(ctx context.Context, santriID string, pool *pgxpool.Pool) {
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
