# 35 - Frontend Local Test Plan

## Status

Dokumen ini adalah rencana pengujian frontend ketika mulai dihubungkan ke Supabase lokal.

Fase 4A tidak menjalankan integrasi frontend. Test di bawah dijalankan pada Fase 4B dan setelahnya.

## Prasyarat

Backend lokal:

- migration 0001-0018 berhasil;
- bootstrap Auth dummy berhasil;
- seed dummy berhasil;
- smoke test lokal `22/22`;
- backend runner `40/40`;
- `supabase_vector` boleh tetap non-blocker selama core test lulus.

Frontend:

- `.env.example` tersedia.
- `.env.local` dibuat manual oleh user jika ingin menjalankan frontend ke Supabase lokal.
- `.env.local` tidak boleh dikomit.
- Tidak ada Supabase lama hard-code.

## Command Backend Sebelum Frontend

Jika stack lokal aktif:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local-backend-tests.ps1 -SupabaseUrl http://127.0.0.1:55321
```

Ekspektasi:

```text
SUMMARY passed=40 failed=0
```

Jika runner Fase 3B-3 belum dikomit, gunakan hasil lokal sebagai referensi tetapi jangan campur commit dengan Fase 4A.

## Command Frontend

Install dependency bila diperlukan:

```powershell
npm install
```

Build:

```powershell
npm run build
```

Dev server:

```powershell
npm run dev
```

Catatan:

- Jangan mencetak isi `.env.local`.
- Jangan menampilkan anon key, token, password, internal email penuh, atau signed URL.
- Jangan menjalankan `supabase link`.
- Jangan deploy.

## Test Tanpa `.env.local`

Tujuan:

- Memastikan frontend tetap aman jika belum dikonfigurasi.

Skenario:

- Buka halaman home.
- Buka login.
- Buka berita/pengumuman/fasilitas.
- Coba login.

Ekspektasi:

- Aplikasi tidak crash.
- Public page memakai fallback aman.
- Tidak ada request ke Supabase lama.
- Login menampilkan pesan Supabase belum dikonfigurasi.
- Tidak ada mock session.

## Test Dengan `.env.local` Lokal

Prasyarat:

- User mengisi `VITE_SUPABASE_URL` ke URL lokal.
- User mengisi `VITE_SUPABASE_ANON_KEY` dari local stack.
- `VITE_ENABLE_EDGE_FUNCTIONS=true` bila Edge Function local tersedia.
- `VITE_ENABLE_DEFERRED_FEATURES=false` untuk launch core.

Ekspektasi:

- Semua request menuju `127.0.0.1` atau `localhost`.
- Tidak ada request ke project Supabase lama.

## Test Auth

| Skenario | Ekspektasi |
|---|---|
| Login admin email/password | Berhasil, masuk dashboard admin. |
| Login guru email/password | Berhasil, masuk dashboard guru. |
| Login pentashih email/password | Berhasil, masuk dashboard pentashih. |
| Login santri Nomor Induk Qiroati/password | Berhasil via `signin-with-nomor-induk`. |
| Password salah | Error generik. |
| Nomor Induk salah | Error generik yang sama. |
| Refresh browser setelah login | Session tetap valid. |
| Logout | Session dan role hilang, kembali ke login. |
| Role tidak ada di `user_profiles` | UI menolak dengan pesan hubungi admin. |

Larangan:

- Jangan log password.
- Jangan log token/session penuh.
- Jangan tampilkan email internal santri.
- Jangan memakai `signin_with_username`.

## Test Route Guard

| Skenario | Ekspektasi |
|---|---|
| Anon buka `/dashboard` | Redirect ke `/login`. |
| Guru buka dashboard | Hanya dashboard guru. |
| Santri buka dashboard | Hanya dashboard santri. |
| Pentashih buka dashboard | Hanya dashboard pentashih. |
| Guru akses admin-only UI | Ditolak atau diarahkan. |
| Santri akses data orang lain | Ditolak oleh UI/RLS. |
| Route deferred dibuka saat flag false | Halaman fitur belum aktif, tanpa request backend fitur. |
| TV Display dibuka oleh role yang diizinkan | Tetap aktif. |

## Test Admin Core

Skenario:

- Admin melihat statistik santri, pemasukan, pengeluaran.
- Admin melihat data santri.
- Admin melihat data guru.
- Admin melihat kelas.
- Admin mengelola absensi.
- Admin mencatat pembayaran manual.
- Admin menghapus pembayaran.
- Admin mengelola pengeluaran.
- Admin mengelola kalender.
- Admin mengelola konten website.
- Admin mengelola TV Display.

Ekspektasi:

- Semua operasi admin inti berjalan sesuai RLS.
- Tidak ada service-role key di frontend.
- Edge Function dipakai hanya untuk operasi yang memang butuh server privilege.

## Test Guru

Skenario:

- Guru melihat santri kelasnya.
- Guru tidak melihat santri kelas lain.
- Guru mengelola absensi/koreksi untuk kelasnya.
- Guru melihat hafalan dan murojaah kelasnya.
- Guru melihat status pembayaran santri kelasnya.
- Guru mencoba membaca detail `payments`.

Ekspektasi:

- Data luar kelas ditolak.
- Guru hanya melihat `Lunas` atau `Belum Lunas`.
- Guru tidak melihat nominal, metode, catatan transaksi, atau transaction ID.
- Guru tidak membaca `expenses`.

## Test Santri/Wali

Skenario:

- Santri melihat profil sendiri.
- Santri melihat absensi sendiri.
- Santri melihat pembayaran sendiri.
- Santri melihat hafalan/murojaah sendiri.
- Santri upload/ganti/hapus avatar sendiri.
- Santri mencoba mengakses data santri lain.
- Santri mencoba upload avatar path orang lain.

Ekspektasi:

- Data sendiri berhasil.
- Data orang lain ditolak.
- Avatar sendiri berhasil pada path final.
- Avatar orang lain ditolak.

## Test Pentashih

Skenario:

- Pentashih melihat assignment kelas/MMQ.
- Pentashih melihat santri pada assignment.
- Pentashih mencoba melihat kelas/MMQ yang tidak ditugaskan.

Ekspektasi:

- Assignment sendiri berhasil.
- Di luar assignment ditolak.

## Test Public Content

Skenario:

- Home page membaca konten global.
- News page membaca `news` published.
- Announcement page membaca `announcements` published.
- Anon submit feedback.
- Anon mencoba membaca daftar feedback.

Ekspektasi:

- Konten published tampil.
- Draft/internal tidak tampil.
- Feedback insert berhasil.
- Feedback list tidak bisa dibaca anon.

## Test Storage

Skenario:

- Admin upload website asset.
- Public membaca website asset.
- Santri upload avatar sendiri.
- Guru upload avatar santri kelasnya.
- Guru upload avatar santri luar kelas.
- MIME invalid ditolak.
- Ukuran file invalid ditolak.

Ekspektasi:

- `website-assets` public read dan admin write.
- Avatar mengikuti path role/uid.
- Signed URL tidak dicetak penuh.
- File lama avatar diganti.

## Test Laporan

Skenario:

- Admin export laporan pembayaran Excel/PDF.
- Admin export laporan pengeluaran Excel/PDF.
- Guru export laporan kelas jika fitur disediakan.
- Santri export laporan sendiri jika fitur disediakan.

Ekspektasi:

- Admin dapat detail penuh.
- Guru tidak mendapat nominal/metode/catatan pembayaran.
- Santri hanya data sendiri.
- Tidak ada data pribadi tidak perlu di console.

## Static Scan Fase 4B

Jalankan setelah implementasi:

```powershell
rg "mock_santri_session" src
rg "signin_with_username" src
rg "service_role|SUPABASE_SERVICE_ROLE_KEY" src
rg "mmq_absensi|login_logs|music_files|media_player_settings|forum_topics|forum_replies" src
git diff --check
```

Ekspektasi:

- `mock_santri_session` tidak ada.
- `signin_with_username` tidak ada di runtime auth.
- Tidak ada service-role key di frontend.
- Object deferred/legacy tidak termount saat flag disabled.
- `git diff --check` lulus.

## Kriteria Selesai Integrasi Frontend Lokal

Integrasi frontend lokal dianggap siap lanjut staging plan jika:

- backend runner lulus;
- `npm run build` lulus;
- semua role dapat login;
- route guard berbasis role berjalan;
- santri login via Nomor Induk Qiroati dan Edge Function;
- guru hanya melihat scope kelasnya;
- guru hanya melihat status pembayaran;
- santri hanya melihat data sendiri;
- storage avatar sesuai policy;
- news dan announcements memakai tabel baru;
- fitur deferred tidak aktif;
- tidak ada secret atau `.env.local` di Git.
