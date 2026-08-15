import apiClient from '@/lib/apiClient';

/**
 * Materi, tugas, dan pengumuman kelas.
 *
 * Sengaja terpisah dari `announcements`, yang memasok situs publik dan punya
 * kebijakan baca anonim. Konten kelas tidak boleh muncul di halaman Berita.
 *
 * Hak akses diputuskan backend (`kelaskonten.go`) dengan bertanya ke
 * `jadwal_pelajaran` pada tiap permintaan. Penyaringan di UI hanya kenyamanan.
 */

export const JENIS_KONTEN = [
    { value: 'materi', label: 'Materi' },
    { value: 'tugas', label: 'Tugas' },
    { value: 'pengumuman', label: 'Pengumuman' },
];

export const STATUS_KONTEN = [
    { value: 'draft', label: 'Draf' },
    { value: 'published', label: 'Terbit' },
    { value: 'archived', label: 'Arsip' },
];

export const getJenisLabel = (value) => (
    JENIS_KONTEN.find((item) => item.value === value)?.label || value || '-'
);

export const getStatusLabel = (value) => (
    STATUS_KONTEN.find((item) => item.value === value)?.label || value || '-'
);

export const getKelasKontenErrorMessage = (error) => {
    const message = String(error?.error || error?.message || error || '').trim();
    if (!message) return 'Operasi konten kelas gagal.';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        return 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.';
    }
    return message;
};

/**
 * Batas pengumpulan hanya bermakna untuk tugas — basis data menolak sisanya
 * lewat CHECK, jadi UI memakai aturan yang sama supaya pesannya muncul lebih awal.
 */
export const bolehPunyaBatas = (jenis) => jenis === 'tugas';

/** `datetime-local` memakai "YYYY-MM-DDTHH:mm" tanpa zona; server menyimpan timestamptz. */
export const toInputDateTime = (value) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const formatTanggal = (value) => {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
};

const buildQuery = ({ classId, mataPelajaranId, periodeId, jenis, status, limit } = {}) => {
    const params = new URLSearchParams();
    if (classId) params.set('class_id', classId);
    if (mataPelajaranId) params.set('mata_pelajaran_id', mataPelajaranId);
    if (periodeId) params.set('periode_id', periodeId);
    if (jenis) params.set('jenis', jenis);
    if (status) params.set('status', status);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    return qs ? `?${qs}` : '';
};

export const fetchKelasKonten = async (filters = {}) => {
    const data = await apiClient.get(`/api/kelas-konten${buildQuery(filters)}`);
    return data || [];
};

export const createKelasKonten = async ({
    jenis, judul, isi, classId, mataPelajaranId, periodeId,
    status, tanggalPublikasi, batasPengumpulan, lampiranUrl, lampiranNama,
}) => apiClient.post('/api/kelas-konten', {
    jenis,
    judul: String(judul || '').trim(),
    isi: isi ? String(isi) : null,
    class_id: classId,
    mata_pelajaran_id: mataPelajaranId || null,
    periode_id: periodeId || null,
    status: status || 'draft',
    tanggal_publikasi: tanggalPublikasi || null,
    // Kirim hanya bila jenisnya memang tugas, agar CHECK di basis data tidak
    // tersandung nilai yang tidak relevan.
    batas_pengumpulan: bolehPunyaBatas(jenis) && batasPengumpulan ? batasPengumpulan : null,
    lampiran_url: lampiranUrl ? String(lampiranUrl).trim() : null,
    lampiran_nama: lampiranNama ? String(lampiranNama).trim() : null,
});

/** Partial update — hanya field yang benar-benar diubah yang dikirim. */
export const updateKelasKonten = async (id, updates = {}) => {
    const payload = {};
    if (updates.judul !== undefined) payload.judul = String(updates.judul || '').trim();
    if (updates.isi !== undefined) payload.isi = updates.isi ? String(updates.isi) : '';
    if (updates.status !== undefined) payload.status = updates.status;
    if (updates.tanggalPublikasi !== undefined) payload.tanggal_publikasi = updates.tanggalPublikasi || '';
    if (updates.batasPengumpulan !== undefined) payload.batas_pengumpulan = updates.batasPengumpulan || '';
    if (updates.lampiranUrl !== undefined) payload.lampiran_url = updates.lampiranUrl ? String(updates.lampiranUrl).trim() : '';
    if (updates.lampiranNama !== undefined) payload.lampiran_nama = updates.lampiranNama ? String(updates.lampiranNama).trim() : '';
    return apiClient.put(`/api/kelas-konten/${id}`, payload);
};

export const terbitkanKelasKonten = async (id) => updateKelasKonten(id, { status: 'published' });
export const sembunyikanKelasKonten = async (id) => updateKelasKonten(id, { status: 'draft' });

export const deleteKelasKonten = async (id) => {
    await apiClient.delete(`/api/kelas-konten/${id}`);
};
