import apiClient, { publicFetch } from '@/lib/apiClient';

export const progressStatusToComplete = (status) => status === 'lulus';
export const completeToProgressStatus = (complete) => (complete ? 'lulus' : 'proses');

export const DEVELOPMENT_SCORE_OPTIONS = [
    { score: 1, code: 'BB', label: 'Belum Berkembang', tone: 'slate' },
    { score: 2, code: 'MB', label: 'Mulai Berkembang', tone: 'amber' },
    { score: 3, code: 'BSH', label: 'Berkembang Sesuai Harapan', tone: 'sky' },
    { score: 4, code: 'SB', label: 'Sangat Berkembang', tone: 'emerald' }
];

export const CHARACTER_STRENGTH_OPTIONS = [
    'Disiplin', 'Jujur', 'Mandiri', 'Percaya Diri', 'Bertanggung Jawab',
    'Sopan Santun', 'Peduli', 'Rajin Beribadah', 'Semangat Belajar',
    "Gemar Membaca Al-Qur'an"
];

export const VIOLATION_LEVELS = {
    Ringan: { examples: 'Terlambat, lupa membawa buku, tidak memakai ID Card, atau bercanda saat belajar', followUp: 'Nasihat dan pengingat dari guru' },
    Sedang: { examples: 'Mengganggu teman berulang kali, tidak sopan kepada guru, atau tidak mengerjakan hafalan berulang', followUp: 'Pembinaan, pencatatan, dan pemberitahuan kepada orang tua' },
    Berat: { examples: 'Berkelahi, merusak fasilitas, membawa barang berbahaya, atau tindakan yang membahayakan', followUp: 'Pertemuan dengan orang tua, pembinaan intensif, dan keputusan kepala sekolah' }
};

export const getDevelopmentScoreMeta = (score) => (
    DEVELOPMENT_SCORE_OPTIONS.find((item) => item.score === Number(score)) || DEVELOPMENT_SCORE_OPTIONS[0]
);

export const groupHafalanItemsByJilid = (items = []) => {
    const groups = Object.fromEntries([1, 2, 3, 4, 5, 6].map((jilid) => [jilid, []]));
    items.forEach((item) => {
        const normalizedJilid = String(item?.jilid || '1').replace(/^jilid\s*/i, '').trim();
        if (groups[normalizedJilid]) groups[normalizedJilid].push(item);
    });
    return groups;
};

export const JUZ_TAHFIZH_TARGETS = ['Juz 1', 'Juz 2', 'Juz 28', 'Juz 29', 'Juz 30'];

// Hafalan punya dua bentuk: bertahap per kelas 1-6, dan tahfizh Al-Qur'an per juz.
// Lingkupnya ditentukan oleh JENIS materinya, bukan oleh status murid — setiap
// murid boleh mengambil keduanya. Sebelumnya lingkup diturunkan dari
// santri.kategori, sehingga murid non-PTPT tidak pernah bisa punya hafalan juz
// dan sebaliknya.
//
// Nilai 'TPQ' dan 'PTPT' TIDAK diubah karena tersimpan di kolom
// hafalan_items.program_scope. Hanya labelnya yang diterjemahkan di UI, sama
// seperti perlakuan pada peran 'Pentashih'.
export const HAFALAN_SCOPE_PER_KELAS = 'TPQ';
export const HAFALAN_SCOPE_PER_JUZ = 'PTPT';

export const getHafalanScopeForCategory = (category) => (
    String(category || '').trim().toLowerCase() === 'tahfizh' ? HAFALAN_SCOPE_PER_JUZ : HAFALAN_SCOPE_PER_KELAS
);

export const groupHafalanItemsByTarget = (items = [], targets = JUZ_TAHFIZH_TARGETS) => (
    Object.fromEntries(targets.map((target) => [target, items.filter((item) => String(item?.jilid || '').trim() === target)]))
);

export const getAcademicErrorMessage = (error) => {
    const message = String(error?.message || error || '');
    if (message.includes('row-level security') || error?.code === '42501') return 'Anda tidak memiliki akses untuk data akademik ini.';
    if (message.includes('academic_calendar_title_not_blank')) return 'Judul kalender wajib diisi.';
    if (message.includes('hafalan_items_name_not_blank')) return 'Nama item hafalan wajib diisi.';
    if (message.includes('hafalan_progress_status_check')) return 'Status hafalan tidak valid.';
    if (message.includes('score_check')) return 'Skor perkembangan harus berada pada nilai 1 sampai 4.';
    if (message.includes('santri_behavior_records_level_check')) return 'Tingkat pelanggaran tidak valid.';
    if (message.includes('murojaah_submissions_status_check')) return 'Status murojaah tidak valid.';
    return message || 'Operasi akademik gagal.';
};

// `view=full` returns whole rows instead of the bare holiday-date list the
// attendance consumers use. Only the calendar admin panel needs it — it has to
// edit and delete individual entries, and a date may now hold several.
export const fetchCalendarEvents = async ({ startDate, endDate }) => {
    const params = new URLSearchParams({ date_from: startDate, date_to: endDate, view: 'full' });
    const data = await apiClient.get(`/api/attendance/calendar?${params}`);
    return Array.isArray(data) ? data : [];
};

export const fetchCalendarMonthSettings = async (year) => {
    const params = new URLSearchParams({ year: String(year) });
    const data = await apiClient.get(`/api/attendance/calendar-settings?${params}`);
    return Array.isArray(data) ? data : [];
};

export const saveCalendarMonthSetting = async ({ year, month, saturdayIsHoliday }) => (
    apiClient.put(`/api/attendance/calendar-settings/${year}/${month}`, {
        saturday_is_holiday: Boolean(saturdayIsHoliday),
    })
);

export const deleteCalendarMonthSetting = async ({ year, month }) => {
    await apiClient.delete(`/api/attendance/calendar-settings/${year}/${month}`);
};

export const saveCalendarEvent = async ({ existingId, selectedDate, title, description, isHoliday, userId }) => {
    const cleanTitle = String(title || '').trim();
    const cleanDescription = String(description || '').trim();
    const payload = {
        date: selectedDate,
        title: cleanTitle || cleanDescription || (isHoliday ? 'Hari Libur' : 'Hari Masuk'),
        description: cleanDescription || null,
        is_holiday: Boolean(isHoliday),
        is_public: true,
        event_type: isHoliday ? 'holiday' : 'school_day',
        updated_by: userId || null,
        ...(!existingId && { created_by: userId || null }),
    };
    if (existingId) return apiClient.put(`/api/attendance/calendar/${existingId}`, payload);
    return apiClient.post('/api/attendance/calendar', payload);
};

export const deleteCalendarEvent = async (id) => {
    await apiClient.delete(`/api/attendance/calendar/${id}`);
};

// Kalender publik untuk situs sekolah — tanpa login, hanya event is_public.
// Berbeda dari fetchCalendarEvents (yang butuh JWT & mengembalikan metadata
// internal), ini memakai publicFetch dan hanya field aman untuk ditampilkan.
export const fetchPublicCalendar = async ({ startDate, endDate }) => {
    const params = new URLSearchParams({ date_from: startDate, date_to: endDate });
    const data = await publicFetch(`/api/public/calendar?${params}`);
    return Array.isArray(data) ? data : [];
};

export const fetchHafalanItems = async (category = null, programScope = null) => {
    const params = new URLSearchParams({ is_active: 'true' });
    if (category) params.set('category', category);
    if (programScope) params.set('program_scope', programScope);
    return apiClient.get(`/api/academic/items?${params}`);
};

export const createHafalanItem = async ({ category, itemName, jilid, itemOrder, programScope = HAFALAN_SCOPE_PER_KELAS }) => {
    await apiClient.post('/api/academic/items', {
        program_scope: programScope,
        category,
        item_name: String(itemName || '').trim(),
        jilid: String(jilid || ''),
        item_order: itemOrder,
        is_active: true,
    });
};

export const updateHafalanItem = async (id, updates) => {
    await apiClient.put(`/api/academic/items/${id}`, {
        ...updates,
        ...(updates.jilid !== undefined && { jilid: String(updates.jilid) }),
    });
};

export const deactivateHafalanItem = async (id) => {
    await apiClient.put(`/api/academic/items/${id}`, { is_active: false });
};

export const fetchClassesWithActiveSantriForTeacher = async (guruId) => {
    const params = new URLSearchParams({ is_active: 'true', id_guru: guruId, include_santri: 'true' });
    return apiClient.get(`/api/classes?${params}`);
};

export const fetchHafalanProgress = async (santriIds = null) => {
    if (Array.isArray(santriIds) && santriIds.length > 0) {
        const params = new URLSearchParams({ santri_ids: santriIds.join(',') });
        return apiClient.get(`/api/academic/progress?${params}`);
    }
    return apiClient.get('/api/academic/progress');
};

export const buildProgressMap = (progressRows) => {
    const map = {};
    (progressRows || []).forEach((row) => {
        const key = row.item_id ? `${row.santri_id}-${row.item_id}` : `${row.santri_id}-${row.category}-${row.item_name}`;
        map[key] = progressStatusToComplete(row.status);
    });
    return map;
};

export const buildHafalanScoreMap = (progressRows) => {
    const map = {};
    (progressRows || []).forEach((row) => {
        const key = row.item_id ? `${row.santri_id}-${row.item_id}` : `${row.santri_id}-${row.category}-${row.item_name}`;
        map[key] = Number(row.score || (row.status === 'lulus' ? 4 : 1));
    });
    return map;
};

export const upsertHafalanProgress = async ({ santriId, item, score, userId }) => {
    const normalizedScore = Number(score);
    if (!Number.isInteger(normalizedScore) || normalizedScore < 1 || normalizedScore > 4) throw new Error('Skor hafalan harus berupa angka 1 sampai 4.');
    await apiClient.post('/api/academic/progress', {
        santri_id: santriId,
        item_id: item?.id || null,
        category: item.category,
        item_name: item.item_name,
        score: normalizedScore,
        status: normalizedScore === 4 ? 'lulus' : 'proses',
        assessed_by: userId || null,
        assessed_at: new Date().toISOString(),
    });
};

export const fetchCharacterAssessmentItems = async () => {
    return apiClient.get('/api/academic/character/items');
};

export const fetchSantriCharacterScores = async (santriId) => {
    const profile = await apiClient.get(`/api/academic/character/profile/${santriId}`);
    return profile?.scores || [];
};

export const upsertSantriCharacterScore = async ({ santriId, itemId, score, userId }) => {
    const normalizedScore = Number(score);
    if (!Number.isInteger(normalizedScore) || normalizedScore < 1 || normalizedScore > 4) throw new Error('Skor karakter harus berupa angka 1 sampai 4.');
    await apiClient.post('/api/academic/character/scores', {
        santri_id: santriId,
        item_id: itemId,
        score: normalizedScore,
        assessed_by: userId || null,
        assessed_at: new Date().toISOString(),
    });
};

export const fetchSantriCharacterStrengths = async (santriId) => {
    const profile = await apiClient.get(`/api/academic/character/profile/${santriId}`);
    return profile?.strengths || [];
};

export const setSantriCharacterStrength = async ({ santriId, strengthKey, selected, userId }) => {
    await apiClient.post('/api/academic/character/strengths', {
        santri_id: santriId,
        strength_key: strengthKey,
        selected,
        selected_by: userId || null,
        selected_at: new Date().toISOString(),
    });
};

export const fetchSantriBehaviorRecords = async (santriId) => {
    const profile = await apiClient.get(`/api/academic/character/profile/${santriId}`);
    return profile?.behavior || [];
};

export const saveSantriBehaviorRecord = async ({ recordId, santriId, incidentDate, level, behavior, followUp, teacherNote, userId }) => {
    const payload = {
        incident_date: incidentDate,
        level,
        behavior: String(behavior || '').trim(),
        follow_up: String(followUp || '').trim(),
        teacher_note: String(teacherNote || '').trim() || null,
        santri_id: santriId,
        guru_id: userId || null,
    };
    if (!payload.behavior || !payload.follow_up) throw new Error('Bentuk perilaku dan tindak lanjut wajib diisi.');
    if (recordId) return apiClient.put(`/api/academic/character/behavior/${recordId}`, payload);
    return apiClient.post('/api/academic/character/behavior', payload);
};

export const fetchMurojaahSubmissions = async (santriId = null) => {
    const qs = santriId ? `?santri_id=${encodeURIComponent(santriId)}` : '';
    return apiClient.get(`/api/academic/murojah${qs}`);
};

export const createMurojaahSubmission = async ({ santriId, type, content, userId }) => {
    await apiClient.post('/api/academic/murojah', {
        santri_id: santriId,
        type,
        content,
        recording_path: null,
        status: 'menunggu',
        created_by: userId || null,
    });
};

/**
 * Setoran yang dicatat guru saat evaluasi tatap muka: sudah dinilai di tempat,
 * jadi statusnya langsung terisi alih-alih menunggu antrean penilaian.
 *
 * Backend hanya menerima ini untuk murid di kelas yang benar-benar dipegang guru
 * — dijaga `pastikanBolehMurojah` di `academic.go`, bukan sekadar oleh daftar
 * murid yang ditampilkan di layar.
 */
export const createManualMurojaahSubmission = async ({
    santriId, type, content, feedback, status = 'diterima',
}) => apiClient.post('/api/academic/murojah', {
    santri_id: santriId,
    type,
    content,
    recording_path: null,
    status,
    feedback: String(feedback || '').trim() || null,
});

export const deleteMurojaahSubmission = async (id) => {
    await apiClient.delete(`/api/academic/murojah/${id}`);
};

export const updateMurojaahReview = async ({ id, status = 'diterima', feedback, userId }) => {
    await apiClient.put(`/api/academic/murojah/${id}`, {
        status,
        feedback: String(feedback || '').trim() || null,
        target_guru_id: userId || null,
        reviewed_at: new Date().toISOString(),
    });
};

// Rows come back ordered by changed_at DESC, so index 0 is the latest change.
export const fetchJilidHistoryForSantri = async (santriId) => {
    if (!santriId) return [];
    const data = await apiClient.get(`/api/academic/jilid-history/${santriId}`);
    return data || [];
};

// Batch variant for whole-roster views. Each row carries a nested `santri`
// object rebuilt server-side, so callers can read row.santri.nama_lengkap.
// Also ordered changed_at DESC.
export const fetchJilidHistoryForSantriList = async (santriIds = []) => {
    const list = (santriIds || []).filter(Boolean);
    if (list.length === 0) return [];
    const params = new URLSearchParams({ santri_ids: list.join(',') });
    const data = await apiClient.get(`/api/academic/jilid-history?${params}`);
    return data || [];
};

export const fetchSantriNotes = async (santriId) => {
    return apiClient.get(`/api/academic/notes?santri_id=${santriId}`);
};

export const saveSantriNote = async ({ noteId, santriId, note, userId }) => {
    const payload = {
        note: String(note || '').trim(),
        visibility: 'internal',
        santri_id: santriId,
        guru_id: userId || null,
    };
    if (noteId) return apiClient.put(`/api/academic/notes/${noteId}`, payload);
    return apiClient.post('/api/academic/notes', payload);
};
