import apiClient from '@/lib/apiClient';

/**
 * Kontak wali murid untuk komunikasi guru.
 *
 * Tidak ada kredensial WhatsApp yang disimpan dan tidak ada layanan luar yang
 * dipanggil. Yang dibuat di sini hanya tautan `wa.me` — persis seperti mengetik
 * nomor di aplikasi WhatsApp sendiri. Pesannya terbuka di WhatsApp milik guru
 * dan **belum terkirim**; guru masih membaca dan menekan kirim sendiri.
 *
 * Nomor selalu berasal dari `santri.no_hp_ortu` di basis data. Tidak ada nomor
 * yang ditanam di kode.
 */

export const getKontakWaliErrorMessage = (error) => {
    const message = String(error?.error || error?.message || error || '').trim();
    if (!message) return 'Gagal memuat kontak wali.';
    if (message.includes('Failed to fetch') || message.includes('NetworkError')) {
        return 'Tidak dapat menghubungi server. Periksa koneksi lalu coba lagi.';
    }
    return message;
};

/**
 * Ubah nomor Indonesia ke bentuk yang diterima wa.me: hanya angka, berawalan 62.
 *
 * "0812-3456-7890" → "6281234567890"
 * "+62 812 3456"   → "62812 3456" → "628123456"
 *
 * Mengembalikan null bila nomornya tidak masuk akal, supaya UI dapat menandai
 * murid yang nomornya belum diisi alih-alih membuka tautan yang pasti gagal.
 */
export const normalizeNomorWa = (value) => {
    const digitsOnly = String(value || '').replace(/\D/g, '');
    if (!digitsOnly) return null;

    let nomor = digitsOnly;
    if (nomor.startsWith('62')) {
        // sudah berformat internasional
    } else if (nomor.startsWith('0')) {
        nomor = `62${nomor.slice(1)}`;
    } else if (nomor.startsWith('8')) {
        // Sebagian data tersimpan tanpa nol depan.
        nomor = `62${nomor}`;
    } else {
        return null;
    }

    // Nomor seluler Indonesia yang sah berkisar 10–15 digit setelah kode negara.
    if (nomor.length < 10 || nomor.length > 15) return null;
    return nomor;
};

export const punyaNomorWali = (row) => Boolean(normalizeNomorWa(row?.no_hp_ortu));

/** Sebutan wali yang paling masuk akal dari data yang ada. */
export const sebutanWali = (row) => {
    const ayah = String(row?.nama_ayah || '').trim();
    const ibu = String(row?.nama_ibu || '').trim();
    if (ayah) return ayah;
    if (ibu) return ibu;
    return 'Bapak/Ibu';
};

/**
 * Template pesan. Placeholder diganti saat tombol ditekan:
 * {wali} {murid} {kelas} {guru} {sekolah}
 *
 * Sengaja disimpan sebagai teks biasa, bukan tabel tersendiri — guru selalu
 * dapat menyunting isinya sebelum mengirim, jadi menyimpannya di basis data
 * hanya menambah beban tanpa menambah kegunaan.
 */
export const TEMPLATE_PESAN = [
    {
        key: 'perkenalan',
        label: 'Perkenalan wali kelas',
        isi: 'Assalamualaikum {wali}, saya {guru} dari {sekolah}, pengajar {murid} di {kelas}. '
            + 'Saya menghubungi untuk memperkenalkan diri dan membuka jalur komunikasi bila ada '
            + 'hal yang perlu disampaikan mengenai perkembangan belajar ananda. Terima kasih.',
    },
    {
        key: 'kehadiran',
        label: 'Konfirmasi ketidakhadiran',
        isi: 'Assalamualaikum {wali}, saya {guru} dari {sekolah}. Hari ini ananda {murid} '
            + 'dari {kelas} tidak hadir di sekolah. Mohon informasinya mengenai kondisi ananda. '
            + 'Terima kasih.',
    },
    {
        key: 'tugas',
        label: 'Pengingat tugas',
        isi: 'Assalamualaikum {wali}, saya {guru} dari {sekolah}. Mohon bantuannya mengingatkan '
            + 'ananda {murid} dari {kelas} untuk menyelesaikan tugas yang telah diberikan. '
            + 'Terima kasih atas kerja samanya.',
    },
    {
        key: 'apresiasi',
        label: 'Apresiasi perkembangan',
        isi: 'Assalamualaikum {wali}, saya {guru} dari {sekolah}. Saya ingin menyampaikan bahwa '
            + 'ananda {murid} dari {kelas} menunjukkan perkembangan yang baik di kelas. '
            + 'Terima kasih atas dukungan Bapak/Ibu di rumah.',
    },
    {
        key: 'undangan',
        label: 'Undangan pertemuan',
        isi: 'Assalamualaikum {wali}, saya {guru} dari {sekolah}. Saya ingin mengundang Bapak/Ibu '
            + 'untuk berdiskusi mengenai perkembangan belajar ananda {murid} dari {kelas}. '
            + 'Mohon informasikan waktu yang memungkinkan. Terima kasih.',
    },
];

export const isiTemplate = (template, { wali, murid, kelas, guru, sekolah }) => (
    String(template || '')
        .replaceAll('{wali}', wali || 'Bapak/Ibu')
        .replaceAll('{murid}', murid || 'ananda')
        .replaceAll('{kelas}', kelas || 'kelasnya')
        .replaceAll('{guru}', guru || 'guru kelas')
        .replaceAll('{sekolah}', sekolah || 'sekolah')
);

/** Tautan wa.me dengan pesan yang sudah terisi; pengiriman tetap manual. */
export const buatTautanWa = (nomor, pesan) => {
    const tujuan = normalizeNomorWa(nomor);
    if (!tujuan) return null;
    return `https://wa.me/${tujuan}?text=${encodeURIComponent(pesan || '')}`;
};

export const fetchKontakWali = async ({ classId, search, limit } = {}) => {
    const params = new URLSearchParams();
    if (classId) params.set('class_id', classId);
    if (search) params.set('search', search);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString() ? `?${params.toString()}` : '';
    const data = await apiClient.get(`/api/kontak-wali${qs}`);
    return data || [];
};
