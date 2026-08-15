package handler

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const (
	lessonEarlyCheckInAllowance = 30 * time.Minute
	lessonLateCheckInAllowance  = 60 * time.Minute
)

type attendanceRequestError struct {
	status  int
	message string
}

func (e *attendanceRequestError) Error() string { return e.message }

type guruLessonSchedule struct {
	ID              string
	ClassID         string
	MataPelajaranID string
	GuruID          string
	Hari            int
	JamMulai        string
	JamSelesai      string
	Sesi            string
	PeriodeMulai    string
	PeriodeSelesai  string
	ClassIsActive   bool
	MapelIsActive   bool
	GuruStatus      string
}

// validateGuruLessonAttendance is the server-side contract for the school
// digital attendance flow. It intentionally never reads mmq_schedule: the
// school schedule is the authority for teacher, class, subject, date, and
// check-in time.
func (h *AttendanceHandler) validateGuruLessonAttendance(
	ctx context.Context,
	in *attendanceInput,
	ctxRole string,
	ctxUser string,
) error {
	if in.JadwalPelajaranID == nil || strings.TrimSpace(*in.JadwalPelajaranID) == "" {
		return nil
	}

	if in.Role != "guru" {
		return &attendanceRequestError{status: 400, message: "jadwal pelajaran hanya dapat digunakan untuk absensi guru."}
	}
	if ctxRole == "guru" && in.UserID != ctxUser {
		return &attendanceRequestError{status: 403, message: "Guru hanya dapat mencatat absensi untuk dirinya sendiri."}
	}

	scheduleID := strings.TrimSpace(*in.JadwalPelajaranID)
	var schedule guruLessonSchedule
	err := h.db.QueryRow(ctx, `
		SELECT j.id::text,
		       j.class_id::text,
		       j.mata_pelajaran_id::text,
		       COALESCE(j.guru_id, c.id_guru, '00000000-0000-0000-0000-000000000000'::uuid)::text,
		       j.hari,
		       to_char(j.jam_mulai, 'HH24:MI'),
		       to_char(j.jam_selesai, 'HH24:MI'),
		       COALESCE(NULLIF(btrim(c.sesi), ''), ''),
		       COALESCE(to_char(p.tanggal_mulai, 'YYYY-MM-DD'), ''),
		       COALESCE(to_char(p.tanggal_selesai, 'YYYY-MM-DD'), ''),
		       c.is_active,
		       m.is_active,
		       COALESCE(g.status::text, '')
		FROM jadwal_pelajaran j
		JOIN periode_ajaran p ON p.id = j.periode_id
		JOIN classes c ON c.id = j.class_id
		JOIN mata_pelajaran m ON m.id = j.mata_pelajaran_id
		LEFT JOIN guru g ON g.id = COALESCE(j.guru_id, c.id_guru)
		WHERE j.id = $1::uuid
	`, scheduleID).Scan(
		&schedule.ID,
		&schedule.ClassID,
		&schedule.MataPelajaranID,
		&schedule.GuruID,
		&schedule.Hari,
		&schedule.JamMulai,
		&schedule.JamSelesai,
		&schedule.Sesi,
		&schedule.PeriodeMulai,
		&schedule.PeriodeSelesai,
		&schedule.ClassIsActive,
		&schedule.MapelIsActive,
		&schedule.GuruStatus,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return &attendanceRequestError{status: 404, message: "Jadwal pelajaran tidak ditemukan."}
		}
		if strings.Contains(strings.ToLower(err.Error()), "invalid input syntax for type uuid") {
			return &attendanceRequestError{status: 400, message: "ID jadwal pelajaran tidak valid."}
		}
		return &attendanceRequestError{status: 400, message: "Jadwal pelajaran tidak dapat divalidasi."}
	}

	if schedule.GuruID != in.UserID {
		return &attendanceRequestError{status: 403, message: "Jadwal pelajaran ini bukan tanggung jawab guru tersebut."}
	}
	if schedule.GuruStatus != "active" {
		return &attendanceRequestError{status: 403, message: "Guru tidak aktif sehingga absensi tidak dapat dicatat."}
	}
	if !schedule.ClassIsActive {
		return &attendanceRequestError{status: 400, message: "Kelas pada jadwal pelajaran sedang tidak aktif."}
	}
	if !schedule.MapelIsActive {
		return &attendanceRequestError{status: 400, message: "Mata pelajaran pada jadwal sedang tidak aktif."}
	}

	location, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		location = time.FixedZone("WIB", 7*60*60)
	}
	attendanceDate, err := time.ParseInLocation("2006-01-02", strings.TrimSpace(in.AttendanceDate), location)
	if err != nil {
		return &attendanceRequestError{status: 400, message: "Tanggal absensi harus berformat YYYY-MM-DD."}
	}
	if int(attendanceDate.Weekday()) != schedule.Hari {
		return &attendanceRequestError{status: 400, message: "Tanggal absensi tidak sesuai dengan hari jadwal pelajaran."}
	}
	if schedule.PeriodeMulai != "" && in.AttendanceDate < schedule.PeriodeMulai {
		return &attendanceRequestError{status: 400, message: "Tanggal absensi berada sebelum periode jadwal pelajaran."}
	}
	if schedule.PeriodeSelesai != "" && in.AttendanceDate > schedule.PeriodeSelesai {
		return &attendanceRequestError{status: 400, message: "Tanggal absensi berada setelah periode jadwal pelajaran."}
	}

	if in.CheckInTimestamp == nil || strings.TrimSpace(*in.CheckInTimestamp) == "" {
		return &attendanceRequestError{status: 400, message: "Waktu check-in wajib diisi untuk absensi guru berbasis jadwal."}
	}
	checkIn, err := time.Parse(time.RFC3339, strings.TrimSpace(*in.CheckInTimestamp))
	if err != nil {
		return &attendanceRequestError{status: 400, message: "Waktu check-in tidak valid."}
	}
	if checkIn.In(location).Format("2006-01-02") != in.AttendanceDate {
		return &attendanceRequestError{status: 400, message: "Tanggal dan waktu check-in tidak cocok."}
	}
	if in.CheckInTime != nil && strings.TrimSpace(*in.CheckInTime) != "" {
		clock := strings.TrimSpace(*in.CheckInTime)
		if len(clock) == 5 {
			clock += ":00"
		}
		if _, err := time.Parse("15:04:05", clock); err != nil {
			return &attendanceRequestError{status: 400, message: "Jam check-in tidak valid."}
		}
	}

	scheduleStart, err := time.ParseInLocation("2006-01-02 15:04", in.AttendanceDate+" "+schedule.JamMulai, location)
	if err != nil {
		return &attendanceRequestError{status: 400, message: "Jam mulai jadwal pelajaran tidak valid."}
	}
	scheduleEnd, err := time.ParseInLocation("2006-01-02 15:04", in.AttendanceDate+" "+schedule.JamSelesai, location)
	if err != nil || !scheduleEnd.After(scheduleStart) {
		return &attendanceRequestError{status: 400, message: "Rentang waktu jadwal pelajaran tidak valid."}
	}
	if checkIn.Before(scheduleStart.Add(-lessonEarlyCheckInAllowance)) {
		return &attendanceRequestError{status: 400, message: "Absensi belum dibuka untuk jadwal pelajaran ini."}
	}
	if checkIn.After(scheduleEnd.Add(lessonLateCheckInAllowance)) {
		return &attendanceRequestError{status: 400, message: "Waktu absensi untuk jadwal pelajaran ini sudah berakhir."}
	}

	// These values come from the schedule, never from a client-provided class or
	// subject. This keeps the payload compatible while making the identity
	// authoritative at the API boundary.
	in.JadwalPelajaranID = &schedule.ID
	in.MataPelajaranID = &schedule.MataPelajaranID
	in.ClassID = &schedule.ClassID
	if strings.TrimSpace(schedule.Sesi) != "" {
		in.Sesi = schedule.Sesi
	}
	if strings.TrimSpace(in.Sesi) == "" {
		in.Sesi = inferAttendanceSessionFromClock(schedule.JamMulai)
	}
	if in.AttendedSession == nil || strings.TrimSpace(*in.AttendedSession) == "" {
		in.AttendedSession = &in.Sesi
	}
	return nil
}

func inferAttendanceSessionFromClock(clock string) string {
	parts := strings.SplitN(clock, ":", 2)
	if len(parts) == 0 {
		return "Pagi"
	}
	hour := 0
	if _, err := fmt.Sscanf(parts[0], "%d", &hour); err != nil {
		return "Pagi"
	}
	switch {
	case hour < 12:
		return "Pagi"
	case hour < 15:
		return "Siang"
	case hour < 18:
		return "Sore"
	default:
		return "Malam"
	}
}
