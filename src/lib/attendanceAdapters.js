import apiClient from '@/lib/apiClient';
import { fetchCalendarMonthSettings } from '@/lib/academicAdapters';
import {
    groupCalendarEventsByDate,
    normalizeCalendarMonthSettingsByYear,
} from '@/lib/calendarUtils';
import {
    evaluateAttendanceWindow,
    getJakartaDateString,
    getJakartaTimeString,
    normalizeAttendanceSessionName,
} from '@/utils/AttendanceStatusLogic';

const ACTIVE_STATUS = new Set(['aktif', 'active']);
const EXPLICIT_ABSENT_STATUSES = new Set(['tidak hadir', 'alpha', 'ghaib', 'absen']);

export const normalizeRfidTag = (value) => String(value || '').trim();

export const isActiveSantri = (status) => ACTIVE_STATUS.has(String(status || '').trim().toLowerCase());

export const isExplicitAbsentAttendance = (status) => (
    EXPLICIT_ABSENT_STATUSES.has(String(status || '').trim().toLowerCase())
);

export const getLocalDateString = (date = new Date()) => getJakartaDateString(date);

export const getLocalTimeString = (date = new Date()) => getJakartaTimeString(date);

export const getSantriSession = (santri, fallback = 'Pagi') => (
    normalizeAttendanceSessionName(santri?.sesi_mengaji || santri?.class?.sesi || fallback)
);

export const buildSantriAttendancePayload = ({ santri, timestamp = new Date(), status = null, attendedSession = null }) => {
    const attendanceDate = getLocalDateString(timestamp);
    const sesi = getSantriSession(santri);
    const checkInTimestamp = timestamp.toISOString();
    const windowState = evaluateAttendanceWindow({ timestamp, dateStr: attendanceDate, sesi });

    return {
        user_id: santri.id,
        role: 'santri',
        attendance_date: attendanceDate,
        check_in_time: getLocalTimeString(timestamp),
        check_in_timestamp: checkInTimestamp,
        class_id: santri.current_class_id,
        sesi,
        attended_session: normalizeAttendanceSessionName(attendedSession) || sesi,
        status: status || windowState.status || 'Terlambat',
        source: 'rfid',
    };
};

export const getSantriAttendanceSuccessMessage = ({ assignedSession, attendedSession }) => {
    const registered = normalizeAttendanceSessionName(assignedSession);
    const actual = normalizeAttendanceSessionName(attendedSession) || registered;

    if (registered && actual && registered !== actual) {
        return `Absensi sesi ${actual} berhasil. Kehadiran tercatat untuk sesi ${registered}.`;
    }

    return `Absensi sesi ${actual || registered || 'belajar'} berhasil.`;
};

export const getAttendanceErrorMessage = (error) => {
    const message = String(error?.message || '');
    if (
        error?.code === '23505'
        || message.includes('attendance_user_date_sesi_unique')
        || message.includes('attendance_santri_first_daily_unique')
    ) {
        return 'Absensi murid hari ini sudah tercatat.';
    }
    if (error?.code === '42501' || message.toLowerCase().includes('row-level security')) {
        return 'Anda tidak memiliki akses untuk mencatat absensi ini.';
    }
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        return 'Server absensi tidak dapat dihubungi. Periksa koneksi lalu coba lagi.';
    }
    return message || 'Absensi gagal dicatat.';
};

// --- Query functions ---

export const createAttendance = async (payload) => {
    return apiClient.post('/api/attendance', payload);
};

export const updateAttendance = async (id, payload) => {
    return apiClient.put(`/api/attendance/${id}`, payload);
};

// Clearing check-in time and stamping the correction columns needs a dedicated
// route: the generic update endpoint takes only non-empty scalars, so it cannot
// express "set these back to NULL". corrected_by is taken from the JWT server
// side rather than the request body.
export const markAttendanceAbsent = async (id, correctionReason) => {
    return apiClient.put(`/api/attendance/${id}/absent`, {
        correction_reason: correctionReason || undefined,
    });
};

export const fetchAttendance = async (filters = {}) => {
    const params = new URLSearchParams();
    if (filters.user_id) params.set('user_id', filters.user_id);
    if (filters.role) params.set('role', filters.role);
    if (filters.class_id) params.set('class_id', filters.class_id);
    if (Array.isArray(filters.class_ids) && filters.class_ids.length > 0) {
        params.set('class_ids', filters.class_ids.join(','));
    }
    if (filters.sesi) params.set('sesi', filters.sesi);
    if (Array.isArray(filters.sesi_in) && filters.sesi_in.length > 0) {
        params.set('sesi_in', filters.sesi_in.join(','));
    }
    if (filters.date) params.set('date', filters.date);
    if (filters.date_from) params.set('date_from', filters.date_from);
    if (filters.date_to) params.set('date_to', filters.date_to);
    if (filters.limit) params.set('limit', String(filters.limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await apiClient.get(`/api/attendance${qs}`);
    return data || [];
};

export const fetchTodayAttendance = async (classId) => {
    const params = new URLSearchParams();
    if (classId) params.set('class_id', classId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await apiClient.get(`/api/attendance/today${qs}`);
    return data || [];
};

export const fetchAttendanceDates = async (userId, limit) => {
    const params = new URLSearchParams();
    if (userId) params.set('user_id', userId);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await apiClient.get(`/api/attendance/dates${qs}`);
    return data || [];
};

export const fetchAttendanceCount = async (userId, currentMonth = false) => {
    const params = new URLSearchParams();
    if (userId) params.set('user_id', userId);
    if (currentMonth) params.set('current_month', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(`/api/attendance/count${qs}`);
};

export const fetchAttendanceRecap = async (userId, dateFrom, dateTo) => {
    const params = new URLSearchParams();
    if (userId) params.set('user_id', userId);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(`/api/attendance/recap${qs}`);
};

// The endpoint only returns holidays, as bare date strings. Callers read
// `.date` / `.is_holiday`, so shape the rows here instead of at each call site.
// Accepts either (from, to) or ({ startDate, endDate }) — both spellings are in use.
export const fetchCalendarEvents = async (dateFrom, dateTo) => {
    const from = typeof dateFrom === 'object' && dateFrom !== null
        ? (dateFrom.startDate || dateFrom.date_from)
        : dateFrom;
    const to = typeof dateFrom === 'object' && dateFrom !== null
        ? (dateFrom.endDate || dateFrom.date_to)
        : dateTo;

    const params = new URLSearchParams();
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await apiClient.get(`/api/attendance/calendar${qs}`);
    return (data || []).map((row) => (
        typeof row === 'string' ? { date: row, is_holiday: true } : row
    ));
};

export const fetchCalendarEventsFull = async (dateFrom, dateTo) => {
    const from = typeof dateFrom === 'object' && dateFrom !== null
        ? (dateFrom.startDate || dateFrom.date_from)
        : dateFrom;
    const to = typeof dateFrom === 'object' && dateFrom !== null
        ? (dateFrom.endDate || dateFrom.date_to)
        : dateTo;

    const params = new URLSearchParams();
    if (from) params.set('date_from', from);
    if (to) params.set('date_to', to);
    params.set('view', 'full');
    const data = await apiClient.get(`/api/attendance/calendar?${params}`);
    return Array.isArray(data) ? data : [];
};

const getCalendarYearsInRange = (startDate, endDate) => {
    const startYear = Number(String(startDate || '').slice(0, 4));
    const endYear = Number(String(endDate || '').slice(0, 4));
    if (!Number.isInteger(startYear) || !Number.isInteger(endYear) || startYear > endYear) return [];
    return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
};

// Shared source of truth for attendance reports. Full agenda rows are needed
// so a manual "Hari Masuk" can override an automatic weekend rule; monthly
// settings supply the Saturday policy for each year in the requested range.
export const fetchCalendarContext = async (dateFrom, dateTo) => {
    const from = typeof dateFrom === 'object' && dateFrom !== null
        ? (dateFrom.startDate || dateFrom.date_from)
        : dateFrom;
    const to = typeof dateFrom === 'object' && dateFrom !== null
        ? (dateFrom.endDate || dateFrom.date_to)
        : dateTo;
    const years = getCalendarYearsInRange(from, to);

    const [events, settingRows] = await Promise.all([
        fetchCalendarEventsFull(from, to).catch(() => []),
        Promise.all(years.map((year) => fetchCalendarMonthSettings(year).catch(() => [])))
            .then((rows) => rows.flat()),
    ]);

    return {
        events,
        eventsByDate: groupCalendarEventsByDate(events),
        monthSettingsByYear: normalizeCalendarMonthSettingsByYear(settingRows),
    };
};

export const selfCheckIn = async (payload) => {
    return apiClient.post('/api/attendance/self-checkin', payload);
};

export const fetchGuruAttendanceStats = async (dateFrom, dateTo) => {
    const params = new URLSearchParams();
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(`/api/attendance/guru-stats${qs}`);
};

export const fetchSantriAttendanceStats = async (guruId, dateFrom, dateTo) => {
    const params = new URLSearchParams();
    if (guruId) params.set('guru_id', guruId);
    if (dateFrom) params.set('date_from', dateFrom);
    if (dateTo) params.set('date_to', dateTo);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return apiClient.get(`/api/attendance/santri-stats${qs}`);
};
