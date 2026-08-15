import apiClient from '@/lib/apiClient';

/**
 * Nilai asesmen mata pelajaran.
 *
 * Hak akses tidak diputuskan di sini. Backend (`nilai.go`) menanyakan
 * `jadwal_pelajaran` untuk setiap tulis dan setiap baca, jadi guru yang mencoba
 * menyentuh mata pelajaran yang tidak diampunya akan ditolak 403 walau tombolnya
 * berhasil ditekan. Penyaringan di UI hanya untuk kenyamanan, bukan penjagaan.
 */

// Jenis asesmen yang lazim di SD. Bebas diisi sendiri — daftar ini hanya
// mempercepat pengisian, tidak membatasi, karena kolomnya teks bebas.
export const JENIS_ASESMEN_UMUM = [
    'Ulangan Harian',
    'Tugas',
    'Praktik',
    'Proyek',
    'Penilaian Tengah Semester',
    'Penilaian Akhir Semester',
];

export const SKOR_MIN = 0;
export const SKOR_MAKS = 100;

export const getNilaiErrorMessage = (error) => {
    const message = String(error?.error || error?.message || error || '').trim();
    if (!message) return 'Operasi nilai gagal.';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        return 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.';
    }
    return message;
};

/** Validasi skor sebelum dikirim; backend memeriksa ulang rentang yang sama. */
export const isSkorValid = (value) => {
    if (value === '' || value === null || value === undefined) return false;
    const angka = Number(value);
    return Number.isFinite(angka) && angka >= SKOR_MIN && angka <= SKOR_MAKS;
};

export const formatSkor = (value) => {
    const angka = Number(value);
    if (!Number.isFinite(angka)) return '-';
    // Skor tersimpan numeric(5,2); tampilkan bulat bila memang bulat.
    return Number.isInteger(angka) ? String(angka) : angka.toFixed(2).replace(/0$/, '');
};

const buildQuery = ({ santriId, classId, mataPelajaranId, periodeId, jenisAsesmen, limit } = {}) => {
    const params = new URLSearchParams();
    if (santriId) params.set('santri_id', santriId);
    if (classId) params.set('class_id', classId);
    if (mataPelajaranId) params.set('mata_pelajaran_id', mataPelajaranId);
    if (periodeId) params.set('periode_id', periodeId);
    if (jenisAsesmen) params.set('jenis_asesmen', jenisAsesmen);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return qs ? `?${qs}` : '';
};

export const fetchNilaiList = async (filters = {}) => {
    const data = await apiClient.get(`/api/nilai${buildQuery(filters)}`);
    return data || [];
};

export const fetchNilaiSummary = async (filters = {}) => {
    const data = await apiClient.get(`/api/nilai/summary${buildQuery(filters)}`);
    return data || [];
};

export const createNilai = async ({
    santriId, classId, mataPelajaranId, periodeId,
    jenisAsesmen, skor, catatan, tanggalAsesmen,
}) => apiClient.post('/api/nilai', {
    santri_id: santriId,
    class_id: classId,
    mata_pelajaran_id: mataPelajaranId,
    periode_id: periodeId,
    jenis_asesmen: String(jenisAsesmen || '').trim(),
    skor: Number(skor),
    catatan: catatan ? String(catatan) : null,
    ...(tanggalAsesmen ? { tanggal_asesmen: tanggalAsesmen } : {}),
});

/** Partial update — hanya field yang benar-benar diubah yang dikirim. */
export const updateNilai = async (id, updates = {}) => {
    const payload = {};
    if (updates.skor !== undefined && updates.skor !== '') payload.skor = Number(updates.skor);
    if (updates.jenisAsesmen !== undefined) payload.jenis_asesmen = String(updates.jenisAsesmen || '').trim();
    if (updates.catatan !== undefined) payload.catatan = updates.catatan ? String(updates.catatan) : null;
    if (updates.tanggalAsesmen) payload.tanggal_asesmen = updates.tanggalAsesmen;
    return apiClient.put(`/api/nilai/${id}`, payload);
};

export const deleteNilai = async (id) => {
    await apiClient.delete(`/api/nilai/${id}`);
};
