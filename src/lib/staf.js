/**
 * staf.js — cara menampilkan seorang guru atau staf di halaman publik.
 *
 * Empat halaman publik menampilkan orang dari Data Guru: Profil (kartu guru),
 * Kontak (direktori), Berita (penulis artikel contoh), dan Prestasi (pendamping).
 * Sebelumnya masing-masing menulis nama karangan sendiri, lalu penerjemahan
 * peran dan pembuatan inisial disalin ulang di setiap halaman yang dibereskan.
 *
 * Data yang tersedia dibatasi `GET /api/content/teachers`: id, nama, jabatan,
 * foto_url, roles, jenis_kelamin. Tidak ada surel pribadi, tidak ada biografi —
 * jadi jangan menampilkan hal yang bukan bagian dari daftar itu.
 */

// Peran internal diterjemahkan ke sebutan yang dipahami orang tua murid.
// 'Pentashih' tetap dipakai sebagai nilai tersimpan; hanya labelnya berubah.
export const SEBUTAN_PERAN = {
  Pentashih: 'Wakil Kepala Sekolah',
  Pengajar: 'Guru',
  'Tata Usaha': 'Tata Usaha',
};

export const labelStafRole = (value) => String(value ?? '')
  .trim()
  .replace(/\bpentashih\b/gi, 'Wakil Kepala Sekolah');

/** Sebutan yang ditampilkan: jabatan bila ada, kalau tidak jatuh ke perannya. */
export const sebutanStaf = (guru) => {
  const jabatan = labelStafRole(guru?.jabatan);
  if (jabatan) return jabatan;
  const peran = (Array.isArray(guru?.roles) ? guru.roles : []).find(Boolean);
  return labelStafRole(SEBUTAN_PERAN[peran] || peran || 'Staf sekolah');
};

/**
 * Dua huruf awal untuk kotak inisial ketika guru belum mengunggah foto.
 *
 * Hanya kata berawal huruf kapital yang dipakai, supaya gelar dan kata sambung
 * ("Hj.", "bin", "S.Pd.") tidak ikut. Mengembalikan tanda pisah bila tidak ada
 * yang cocok, jadi kotaknya tidak pernah kosong.
 */
export const inisialNama = (nama) => String(nama || '')
  .split(/\s+/)
  .filter((kata) => /^[A-Z]/.test(kata))
  .slice(0, 2)
  .map((kata) => kata[0])
  .join('') || '—';

/**
 * Mengambil satu staf berdasarkan posisi, berputar bila daftarnya lebih pendek.
 *
 * Dipakai halaman yang menyandingkan isi contoh dengan orang sungguhan (penulis
 * berita, pendamping prestasi). Mengembalikan null bila daftar kosong, supaya
 * pemanggilnya bisa menahan diri alih-alih menampilkan nama kosong.
 */
export const stafKe = (daftar, indeks) => {
  if (!Array.isArray(daftar) || daftar.length === 0) return null;
  return daftar[indeks % daftar.length];
};
