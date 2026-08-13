# Hasil Integrasi Konten Publik Frontend

Tanggal: 2026-06-24

## Ringkasan

Integrasi konten publik sudah diarahkan ke schema Supabase lokal final:

- `website_content` untuk konten global seperti logo, hero, fasilitas, galeri, parenting, kontak, dan konfigurasi TV.
- `news` untuk berita.
- `announcements` untuk pengumuman.
- `feedbacks` untuk masukan publik.
- `website-assets` untuk aset gambar publik.

Tidak ada service-role di frontend, tidak ada perubahan RLS, dan tidak ada akses ke Supabase online atau database lama.

## File yang Berubah

- `src/lib/publicContentAdapters.js`
  - Adapter baru untuk membaca konten global, berita published, pengumuman published, CRUD admin berita/pengumuman, dan feedback publik.
  - Normalisasi field lama UI ke schema final, termasuk `content.body`, `cover_image_url`, `status`, `published_at`, `phone`, dan `message`.

- `src/pages/NewsPage.jsx`
  - Membaca tabel `news`, bukan `website_content` key `news`.
  - Hanya menampilkan berita `published`.

- `src/pages/NewsDetailPage.jsx`
  - Detail berita membaca `news` berdasarkan `slug` atau `id`.
  - Draft tidak tampil ke publik.

- `src/pages/AnnouncementPage.jsx`
  - Membaca tabel `announcements`, bukan `website_content` key `announcements`.
  - Hanya menampilkan pengumuman published yang masih aktif.

- `src/pages/AnnouncementDetailPage.jsx`
  - Detail pengumuman membaca `announcements` berdasarkan `slug` atau `id`.
  - Pengumuman kedaluwarsa tidak ditampilkan.

- `src/pages/HomePage.jsx`
  - Home mengambil berita ringkas dari tabel `news`.
  - Form masukan publik menulis ke `feedbacks.message` dan `feedbacks.phone`.
  - Konten global tetap memakai `website_content.is_public = true`.

- `src/pages/ContactPage.jsx`
  - Form kontak tidak lagi memakai `localStorage`.
  - Masukan publik dikirim ke tabel `feedbacks`.

- `src/components/dashboard/admin/ContentManagement.jsx`
  - Admin mengelola berita melalui tabel `news`.
  - Admin mengelola pengumuman melalui tabel `announcements`.
  - Berita/pengumuman tidak lagi disimpan sebagai array di `website_content`.
  - Admin dapat membaca dan menghapus feedback sesuai RLS.
  - Upload gambar konten tetap memakai `website-assets`.

## Hasil Test

- `npm run build`: lulus.
- Backend runner lokal: lulus `49/49`.
- Test konten publik lokal: lulus `13/13`.
- `git diff --check`: lulus, hanya warning line ending Git.
- `scripts/validate-no-secrets.ps1`: lulus.
- Scan service-role runtime React: bersih.
- Scan runtime berita/pengumuman terhadap `website_content`: bersih pada halaman berita dan pengumuman aktif.

## Test Konten Publik

Test lokal yang lulus:

- publik membaca konten global;
- publik membaca berita published;
- draft berita tidak tampil;
- publik membaca pengumuman published;
- admin membuat, mengubah, dan publish berita;
- admin membuat, mengubah, dan publish pengumuman;
- anon mengirim feedback;
- anon ditolak membaca daftar feedback;
- admin membaca feedback;
- TV Display config dapat dibaca tanpa crash;
- aset website publik dapat dibaca;
- halaman aman saat data kosong.

## Masalah Tersisa

- `website_content` masih digunakan untuk fitur global dan beberapa konten non-berita seperti parenting, galeri, fasilitas, video, dan konfigurasi TV; ini sesuai scope keputusan final.
- Beberapa fitur lama di luar scope, seperti forum, music, game, quiz, random name, top score, journey, dan backup/restore, tetap deferred.
- Hasil integrasi konten publik belum dikomit agar dapat diuji melalui browser terlebih dahulu.
