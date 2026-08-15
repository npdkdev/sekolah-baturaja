import {
  buildJakartaTimestamp,
  determineAttendanceStatus,
  getJakartaDateString,
  getJakartaTimeString,
  normalizeAttendanceSessionName,
} from '@/utils/AttendanceStatusLogic';

// PostgreSQL accepts any hexadecimal UUID in the canonical 8-4-4-4-12 shape.
// Do not apply the RFC version/variant restriction that belonged to the old
// MMQ-only branch: legacy school schedule IDs may use another valid variant.
const SCHOOL_SCHEDULE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SESSION_BY_START_HOUR = [
  [12, 'Pagi'],
  [15, 'Siang'],
  [18, 'Sore'],
];

const toMinutes = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const getJakartaWeekday = (date) => {
  const dateString = getJakartaDateString(date);
  return new Date(`${dateString}T12:00:00+07:00`).getUTCDay();
};

const inferSessionFromStartTime = (startTime) => {
  const minutes = toMinutes(startTime);
  if (minutes === null) return null;
  const hour = Math.floor(minutes / 60);
  const match = SESSION_BY_START_HOUR.find(([until]) => hour < until);
  return match?.[1] || 'Malam';
};

export const isValidSchoolScheduleId = (value) => (
  SCHOOL_SCHEDULE_ID_PATTERN.test(String(value || '').trim())
);

export const getTeacherLessonSession = (schedule) => (
  normalizeAttendanceSessionName(schedule?.sesi)
  || inferSessionFromStartTime(schedule?.jam_mulai)
  || 'Pagi'
);

export const getTeacherLessonSchedulesForDate = (
  schedules = [],
  { guruId, date = new Date() } = {},
) => {
  if (!guruId) return [];
  const day = getJakartaWeekday(date);

  return (schedules || [])
    .filter((schedule) => (
      isValidSchoolScheduleId(schedule?.id)
      && String(schedule?.guru_id || '') === String(guruId)
      && Number(schedule?.hari) === day
      && schedule?.class_is_active !== false
      && schedule?.mapel_is_active !== false
    ))
    .sort((left, right) => (
      Number(right?.periode_is_active === true) - Number(left?.periode_is_active === true)
      || String(left?.jam_mulai || '').localeCompare(String(right?.jam_mulai || ''))
      || String(left?.nama_kelas || '').localeCompare(String(right?.nama_kelas || ''))
    ));
};

export const getTeacherLessonWindow = (schedule, date = new Date(), {
  earlyMinutes = 30,
  lateMinutes = 60,
} = {}) => {
  const dateString = getJakartaDateString(date);
  const day = getJakartaWeekday(date);
  const start = toMinutes(schedule?.jam_mulai);
  const end = toMinutes(schedule?.jam_selesai);
  const current = toMinutes(getJakartaTimeString(date));

  if (!isValidSchoolScheduleId(schedule?.id)) {
    return { canRecord: false, phase: 'invalid_schedule', message: 'Jadwal pelajaran tidak valid.' };
  }
  if (Number(schedule?.hari) !== day) {
    return { canRecord: false, phase: 'wrong_day', message: 'Tanggal tidak sesuai dengan hari jadwal pelajaran.' };
  }
  if (start === null || end === null || end <= start || current === null) {
    return { canRecord: false, phase: 'invalid_time', message: 'Waktu jadwal pelajaran tidak valid.' };
  }

  if (current < start - earlyMinutes) {
    return {
      canRecord: false,
      phase: 'too_early',
      message: `Absensi baru dapat dilakukan mulai ${String(schedule.jam_mulai).slice(0, 5)}.`,
    };
  }
  if (current > end + lateMinutes) {
    return {
      canRecord: false,
      phase: 'ended',
      message: `Waktu absensi jadwal ${String(schedule.jam_selesai).slice(0, 5)} sudah berakhir.`,
    };
  }

  const lessonStart = buildJakartaTimestamp(dateString, schedule.jam_mulai);
  return {
    canRecord: true,
    phase: current > start + 15 ? 'late' : 'on_time',
    status: determineAttendanceStatus(date.toISOString(), lessonStart),
    lessonStart,
    date: dateString,
  };
};

export const buildGuruLessonAttendancePayload = ({
  guruId,
  schedule,
  timestamp = new Date(),
  status = null,
}) => {
  const attendanceDate = getJakartaDateString(timestamp);
  const session = getTeacherLessonSession(schedule);
  const lessonStart = buildJakartaTimestamp(attendanceDate, schedule?.jam_mulai);

  return {
    user_id: guruId,
    role: 'guru',
    attendance_date: attendanceDate,
    check_in_time: getJakartaTimeString(timestamp),
    check_in_timestamp: timestamp.toISOString(),
    class_id: schedule?.class_id || null,
    jadwal_pelajaran_id: schedule?.id || null,
    mata_pelajaran_id: schedule?.mata_pelajaran_id || null,
    sesi: session,
    attended_session: session,
    status: status || determineAttendanceStatus(timestamp.toISOString(), lessonStart),
    source: 'rfid',
  };
};
