# Hasil Persiapan Deployment Frontend Staging Vercel

> Arsip alur kerja yang telah disanitasi. Semua target online lama telah dihapus; dokumen ini bukan bukti deployment LPQ Al-Fath Maulana dan tidak boleh dijalankan sebelum staging baru disetujui.

Tanggal: 2026-06-25

## Ringkasan

Frontend LPQ Al-Fath Maulana sudah dipreflight untuk deployment staging Vercel, tetapi deployment belum dijalankan karena repository lokal belum memiliki remote GitHub.

Backend staging tetap tidak disentuh.

Target backend staging:

- Project Ref: `[PROJECT REF LAMA DIHAPUS]`
- URL: `https://PROJECT_REF_STAGING_BARU.supabase.co`
- Status backend: E2E API/RLS/Storage lulus `25/25`

## Preflight Repository

Hasil pemeriksaan:

- `git status --short`: bersih sebelum perubahan konfigurasi Vercel;
- commit terakhir benar: `71f0ba5 test: validate Supabase staging environment`;
- branch saat ini: `master`;
- `git remote -v`: kosong, belum ada remote GitHub;
- `npm run build`: lulus dan menghasilkan output `dist/`;
- `.env.staging.local`: ignored Git;
- `dist/`: ignored Git.

Karena remote GitHub belum ada, proses push dan deployment Vercel otomatis dihentikan sesuai instruksi.

## Audit Vite dan Vercel

Konfigurasi proyek:

- Framework: Vite + React;
- Build command: `npm run build`;
- Output directory: `dist`;
- Router: `BrowserRouter` dari `react-router-dom`;
- route SPA penting:
  - `/login`;
  - `/dashboard`;
  - `/berita`;
  - `/pengumuman`;
  - `/profil`.

Karena aplikasi memakai `BrowserRouter`, direct-open atau refresh route di Vercel membutuhkan SPA fallback.

File konfigurasi yang ditambahkan:

- `vercel.json`

Isi konfigurasi:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

Konfigurasi ini mencegah route seperti `/dashboard`, `/login`, `/berita`, `/pengumuman`, dan `/profil` menjadi 404 saat dibuka langsung di Vercel.

## Environment Variable Vercel

Environment variable staging yang harus dipasang di Vercel:

```text
VITE_SUPABASE_URL=https://PROJECT_REF_STAGING_BARU.supabase.co
VITE_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY_STAGING>
VITE_ENABLE_EDGE_FUNCTIONS=true
VITE_ENABLE_DEFERRED_FEATURES=false
```

Catatan keamanan:

- gunakan publishable key staging, bukan secret key;
- jangan memasukkan service-role key ke Vercel frontend;
- jangan memasukkan database password;
- jangan memasukkan access token Supabase;
- nilai publishable key tidak dicetak penuh di laporan ini.

## Remote dan Branch

Branch lokal:

- `master`

Remote Git:

- belum ada remote GitHub.

Karena remote kosong, belum ada push dan belum ada project Vercel yang dibuat.

Langkah manual yang diperlukan:

1. Buat atau pilih repository GitHub yang benar untuk proyek ini.
2. Tambahkan remote GitHub ke repository lokal.
3. Verifikasi `git remote -v` mengarah ke repository yang benar.
4. Commit konfigurasi Vercel jika belum dikomit.
5. Push branch ke GitHub.
6. Import repository tersebut ke Vercel sebagai project staging.

## Pengaturan Vercel Dashboard

Jika deploy dilakukan lewat Vercel Dashboard:

- Project name: `lpq-al-fath-maulana-staging`;
- Framework Preset: Vite;
- Build Command: `npm run build`;
- Output Directory: `dist`;
- Environment: masukkan empat variable staging di atas.

Jangan memakai nama project atau domain production.

## Supabase Auth URL Configuration

Setelah URL Vercel staging tersedia, tambahkan URL tersebut ke:

Supabase Staging -> Authentication -> URL Configuration

Atur:

- Site URL: URL frontend staging;
- Redirect URLs:
  - URL frontend staging;
  - URL frontend staging dengan wildcard route bila diperlukan;
  - `http://localhost:3000` tetap dipertahankan untuk development lokal.

Contoh URL staging yang diharapkan:

```text
https://deployment-belum-diisi.invalid
```

## Smoke Test Online

Smoke test frontend online belum dijalankan karena deployment belum tersedia.

Checklist smoke test setelah URL staging tersedia:

- halaman home terbuka;
- login admin;
- login guru;
- login pentashih;
- login santri;
- refresh mempertahankan session;
- direct-open `/dashboard`;
- berita dan pengumuman tampil;
- Data Master terbuka;
- Absensi RFID berjalan;
- pembayaran berjalan;
- pengeluaran berjalan;
- avatar tampil;
- logout berhasil;
- fitur deferred tetap nonaktif.

Network request yang diharapkan hanya menuju:

- domain Vercel staging;
- `https://PROJECT_REF_STAGING_BARU.supabase.co`.

Tidak boleh ada request ke localhost atau project Supabase lain.

## Hasil Saat Ini

Status:

- build frontend lokal lulus;
- SPA fallback untuk Vercel sudah disiapkan;
- backend staging tidak disentuh;
- production tidak disentuh;
- database lama tidak disentuh;
- frontend belum dideploy;
- URL frontend staging belum tersedia.

Blocker:

- repository belum memiliki remote GitHub, sehingga push dan import Vercel belum bisa dilakukan dengan aman.

Rekomendasi langkah berikutnya:

1. Tambahkan remote GitHub yang benar.
2. Commit `vercel.json` dan laporan ini bila sudah direview.
3. Push branch ke GitHub.
4. Import ke Vercel sebagai project staging.
5. Pasang environment variable staging.
6. Jalankan smoke test online.

## Stabilization Pass Frontend Staging

Tanggal: 2026-06-25

Status:

- bug `media_player_settings` tetap terjaga: fitur media player masih gated oleh `VITE_ENABLE_DEFERRED_FEATURES=false`;
- bug simpan logo website tidak diubah ulang dan tetap divalidasi oleh test regresi;
- tidak ada perubahan migration, RLS, Edge Function, backend staging, production, atau database lama;
- perubahan hanya pada frontend runtime, helper, test regresi, dan laporan ini.

### Masalah dan Perbaikan

1. Upload avatar santri gagal.
   - Akar penyebab: pemanggilan signed upload memakai `supabase.functions.invoke()` sehingga detail header/session kurang eksplisit pada runtime Vercel.
   - Perbaikan: `storageAdapters` sekarang mengambil session aktif, mengirim `Authorization: Bearer <user session>` dan `apikey` publishable ke `generate-signed-upload-url`, lalu menampilkan error aman dari Edge Function atau Storage.
   - Persistensi: setelah upload berhasil, admin update hanya field `avatar_path` pada record santri dan list memuat ulang avatar dari path Storage.

2. Edit data santri tidak tersimpan atau kembali kosong.
   - Akar penyebab: form mengirim payload penuh sehingga nilai kosong dapat menimpa field lama dan hasil update tidak memverifikasi row yang berubah.
   - Perbaikan: edit santri memakai `pickChangedSantriProfileFields()`, hanya field berubah yang dikirim, dan update wajib mengembalikan `id`. Jika tidak ada row berubah, UI tidak menampilkan sukses palsu.

3. Logika keterlambatan absensi belum sesuai aturan 15 menit.
   - Akar penyebab: status `Terlambat` dihitung segera setelah waktu mulai sesi.
   - Perbaikan: `AttendanceStatusLogic.js` menjadi sumber kebenaran dengan timezone `Asia/Jakarta` dan grace period 15 menit. Tepat pada menit ke-15 masih `Hadir`/Tepat Waktu; menit ke-16 menjadi `Terlambat`.

4. Bukti pembayaran gagal dibuat dari data tersimpan.
   - Akar penyebab: modal bukti pembayaran bergantung pada object pembayaran dari state tabel.
   - Perbaikan: saat modal dibuka, record pembayaran lengkap dimuat ulang dari tabel `payments` menggunakan `PAYMENT_DETAIL_SELECT`. Bukti memuat identitas LPQ, nama santri, Nomor Induk, periode, nominal, tanggal, metode, dan transaction ID dengan fallback aman.

5. Rekap absensi belum konsisten dengan status terlambat.
   - Akar penyebab: beberapa komponen membentuk timestamp sesi sendiri.
   - Perbaikan: rekap admin, rekap santri, dan modal edit waktu memakai helper keterlambatan yang sama. Edit waktu manual menyimpan ulang `status` yang dihitung dari timestamp baru.

6. Data profil santri tidak tampil pada TV Display.
   - Akar penyebab: TV Display masih memakai mapping legacy `id_kelas` dan order kelas `order`, sedangkan schema final memakai `current_class_id` dan `sort_order`.
   - Perbaikan: TV Display membaca kolom final, memetakan `current_class_id` ke kebutuhan UI lama, resolve avatar dari `avatar_path`, dan fallback aman saat data kosong.

### File yang Diubah

- `src/lib/storageAdapters.js`
- `src/lib/dataMasterAdapters.js`
- `src/lib/attendanceAdapters.js`
- `src/utils/AttendanceStatusLogic.js`
- `src/components/dashboard/admin/SantriManagement.jsx`
- `src/components/dashboard/admin/DigitalAttendance.jsx`
- `src/pages/DigitalAttendancePage.jsx`
- `src/components/dashboard/admin/AttendanceRecap.jsx`
- `src/components/dashboard/santri/SantriAbsensiRecap.jsx`
- `src/components/dashboard/shared/AttendanceDetailsModal.jsx`
- `src/components/dashboard/shared/AttendanceStatusIcon.jsx`
- `src/components/dashboard/admin/PaymentProofModal.jsx`
- `src/pages/TvDisplayPage.jsx`
- `scripts/test-frontend-staging-bugfixes.ps1`
- `docs/50-frontend-staging-deployment-result.md`

### Hasil Test

- `scripts/test-frontend-staging-bugfixes.ps1`: lulus `13/13`.
- `npm run build`: lulus.
- `git diff --check`: lulus.
- `scripts/validate-no-secrets.ps1`: lulus, tidak menemukan credential aktual.
- Runtime scan secret frontend JS/JSX/TS/TSX: tidak menemukan secret, service-role key, database password, atau publishable key hard-code.

Catatan:

- Scan luas terhadap repo masih menemukan istilah `access_token` dan `service-role` sebagai nama field, nama role, atau instruksi dokumentasi/script. Tidak ditemukan nilai secret yang dikomit.
- Build menghasilkan bundle besar seperti sebelumnya; belum dilakukan optimasi chunk pada stabilization pass ini.

### Retest Manual Staging

Setelah Vercel redeploy dari commit stabilization, uji:

- login admin, guru, pentashih, dan santri;
- admin upload avatar santri, refresh, dan login ulang;
- edit data santri lalu refresh;
- scan RFID sebelum/tepat 15 menit/sesudah 15 menit bila data waktu memungkinkan;
- edit waktu absensi dari rekap dan pastikan status berubah;
- buka bukti pembayaran dari transaksi tersimpan setelah refresh;
- buka TV Display dan pastikan profil santri, kelas, jilid, dan avatar tampil;
- pastikan media player tetap tidak aktif saat deferred features false;
- upload dan simpan logo website tetap berhasil.

## Stabilization Pass Lanjutan Berdasarkan Retest Manual

Tanggal: 2026-06-25

Status:

- tidak ada perubahan migration, RLS, Edge Function, backend staging, production, atau database lama;
- perbaikan tetap terbatas pada frontend runtime, helper, test regresi, dan laporan ini;
- bug media player deferred dan simpan logo website tidak diubah ulang.

### Masalah Tambahan dan Perbaikan

1. Upload avatar masih gagal dengan `NetworkError`.
   - Akar penyebab: browser Vercel masih dapat tersandung CORS/network ketika avatar dipaksa lewat Edge Function `generate-signed-upload-url`.
   - Perbaikan: `storageAdapters.uploadAvatar()` sekarang mencoba upload langsung ke bucket `avatars` terlebih dahulu memakai Supabase Storage client dan RLS Storage. Edge Function tetap tersedia sebagai fallback jika direct upload ditolak.
   - Dampak: avatar memakai path deterministik yang sama, file lama diganti dengan `upsert`, dan `avatar_path` tetap disimpan pada record santri.

2. Edit data santri tetap dianggap tidak ada perubahan.
   - Akar penyebab: form masih menampilkan field warisan seperti nama ayah/ibu, KK/NIK, tanggal masuk, link Qiroati, berkas, dan password edit, padahal field tersebut belum tersedia sebagai kolom aktif pada schema staging.
   - Perbaikan: field warisan tersebut dibuat nonaktif/berketerangan jelas, sedangkan pesan tidak ada perubahan sekarang menjelaskan field aktif yang benar-benar tersimpan.
   - Field aktif yang tersimpan: nama, jenis kelamin, tempat/tanggal lahir, HP wali, alamat, nomor induk, RFID, status, sesi, jilid, poin, dan avatar.

3. Status terlambat belum muncul untuk beberapa data rekap.
   - Akar penyebab: data santri dapat menyimpan sesi sebagai angka/string angka dari mapping lama, sedangkan helper keterlambatan sebelumnya hanya mengenali nama sesi.
   - Perbaikan: `AttendanceStatusLogic.js` menormalisasi sesi `0..4` ke nama sesi resmi sebelum menghitung jam mulai. Sesi sore bernilai `3` kini dihitung mulai `16:00`, batas `16:15` tetap tepat waktu, dan `16:16` menjadi `Terlambat`.

4. Simpan gambar bukti pembayaran masih gagal.
   - Akar penyebab: gambar logo remote dari Storage dapat membuat `html-to-image` gagal saat membuat canvas.
   - Perbaikan: logo bukti pembayaran dimuat dari `website_content.logoUrl`, lalu dikonversi menjadi data URL sebelum dipakai di receipt. Jika konversi gagal, receipt memakai fallback `/logo.png` dan error yang tampil lebih spesifik.

5. Logo bukti pembayaran belum mengikuti logo upload konten.
   - Perbaikan: `PaymentSystem` dan `PaymentProofModal` sama-sama memakai helper `fetchReceiptLogoDataUrl()` yang membaca `website_content.logoUrl`, sehingga logo bukti pembayaran mengikuti logo yang di-upload dari Content Management.

### Hasil Test Lanjutan

- `scripts/test-frontend-staging-bugfixes.ps1`: lulus `15/15`.
- `npm run build`: lulus.
- `git diff --check`: lulus.
- `scripts/validate-no-secrets.ps1`: lulus, tidak menemukan credential aktual.

### Retest Manual Setelah Redeploy Berikutnya

Uji ulang di Vercel staging:

- admin upload avatar santri, refresh halaman, dan login ulang;
- edit field aktif santri seperti alamat, HP wali, RFID, sesi, jilid, atau poin;
- cek rekap absensi santri dengan sesi numerik dan scan lebih dari 15 menit;
- buka dan simpan bukti pembayaran dari transaksi tersimpan;
- pastikan logo bukti pembayaran sama dengan logo yang di-upload di Content Management.

## Stabilization Pass Ketiga Berdasarkan Retest Manual

Tanggal: 2026-06-25

Status:

- perubahan frontend, migration additive, dan Edge Function source sudah disiapkan;
- production dan database lama tidak disentuh;
- secret, password, token, dan `.env` tidak ditambahkan ke Git;
- migration baru diperlukan sebelum retest penuh di staging karena beberapa field santri dan tabel media player memang belum ada di schema staging.

### Masalah dan Perbaikan

1. Field edit santri dan checklist berkas belum bisa diisi.
   - Akar penyebab: kolom seperti `nama_ayah`, `nama_ibu`, `tanggal_pendaftaran`, `no_kk`, `no_nik`, `berkas_foto`, `berkas_akta`, `berkas_kk`, `berkas_form`, dan `link_qiroati` belum ada di schema staging.
   - Perbaikan: migration additive `20260624002100_santri_legacy_fields_and_media_player.sql` menambahkan kolom tersebut tanpa menghapus data lama. UI edit santri kini memilih, mengubah, dan menyimpan field tersebut.

2. Login santri dengan Nama Panggilan gagal.
   - Akar penyebab: Edge Function `signin-with-nomor-induk` hanya mencari `auth_login_aliases.normalized_alias` dari Nomor Induk Qiroati.
   - Perbaikan: Edge Function tetap memakai Supabase Auth resmi, tetapi jika Nomor Induk tidak cocok, ia mencari `santri.nama_panggilan` yang aktif dan unik, lalu memakai mapping Auth internal santri tersebut. Tidak ada JWT custom dan tidak ada password plaintext.

3. Website terasa refresh saat kembali dari tab lain.
   - Akar penyebab: loading overlay selalu muncul pada mount dan footer toggle desktop memanggil `window.location.reload()`.
   - Perbaikan: loading awal hanya tampil sekali per session tab melalui `sessionStorage`, dan toggle desktop tidak lagi memaksa reload halaman.

4. Admin perlu mengubah status hadir/terlambat menjadi Tidak Hadir.
   - Perbaikan: modal detail absensi menambahkan aksi `Tandai Tidak Hadir` untuk admin/guru yang berwenang. Aksi ini mengosongkan timestamp kehadiran, menyimpan status `Tidak Hadir`, dan mencatat koreksi tanpa melemahkan RLS.

5. Santri scan RFID lebih dari sekali.
   - Akar penyebab: scan ulang santri ditampilkan sebagai warning, bukan kartu profil sukses.
   - Perbaikan: scan ulang santri tetap menampilkan profile card dan pesan bahwa santri sudah tercatat; waktu hadir pertama tidak diubah.

6. Avatar santri tidak muncul pada kartu absensi digital.
   - Akar penyebab: query absensi digital hanya mengambil `foto_url`, belum mengambil `avatar_path`.
   - Perbaikan: absensi digital membaca `avatar_path` dan memakai `resolveAvatarUrl()` seperti Data Master, sehingga avatar dari Storage muncul pada profile card setelah scan.

7. Media player perlu aktif kembali di absensi digital.
   - Akar penyebab: media player masih diperlakukan sebagai fitur deferred dan query-nya dimatikan ketika `VITE_ENABLE_DEFERRED_FEATURES=false`.
   - Perbaikan: media player dipulihkan khusus untuk absensi digital dengan tabel `music_files`, `media_player_settings`, dan bucket `music-files`. Fitur deferred lain seperti forum, game, quiz, random, dan top score tetap gated.

8. Card Santri Aktif di dashboard admin tidak menghitung data aktif.
   - Akar penyebab: query statistik hanya mencari `status = active`, sedangkan data santri staging memakai `Aktif`.
   - Perbaikan: query statistik kini menghitung status `Aktif` dan `active`.

9. Gambar bukti pembayaran masih gagal tersimpan atau logo tidak muncul.
   - Perbaikan: generator bukti pembayaran menunggu seluruh gambar di receipt selesai load sebelum membuat PNG. Logo tetap berasal dari `website_content.logoUrl` dan fallback lokal tetap tersedia.

### File Berubah

- `supabase/migrations/20260624002100_santri_legacy_fields_and_media_player.sql`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/manage-user/index.ts`
- `supabase/functions/signin-with-nomor-induk/index.ts`
- `src/lib/dataMasterAdapters.js`
- `src/lib/publicContentAdapters.js`
- `src/hooks/useMediaPlayer.js`
- `src/utils/verifyDatabaseSchema.js`
- `src/App.jsx`
- `src/components/Footer.jsx`
- `src/components/dashboard/AdminDashboard.jsx`
- `src/components/dashboard/admin/DigitalAttendance.jsx`
- `src/components/dashboard/admin/MediaPlayerSettings.jsx`
- `src/components/dashboard/admin/PaymentProofModal.jsx`
- `src/components/dashboard/admin/PaymentSystem.jsx`
- `src/components/dashboard/admin/SantriManagement.jsx`
- `src/components/dashboard/shared/AttendanceDetailsModal.jsx`
- `src/contexts/SupabaseAuthContext.jsx`
- `src/pages/DigitalAttendancePage.jsx`
- `src/pages/LoginPage.jsx`
- `scripts/test-frontend-staging-bugfixes.ps1`
- `scripts/validate-migration-order.ps1`
- `docs/50-frontend-staging-deployment-result.md`

### Hasil Test

- `scripts/test-frontend-staging-bugfixes.ps1`: lulus `21/21`.
- `scripts/validate-migration-order.ps1`: lulus.
- `npm run build`: lulus.
- `git diff --check`: lulus.
- `scripts/validate-no-secrets.ps1`: lulus, tidak menemukan credential aktual.

### Langkah Manual Wajib Sebelum Retest Staging

Karena perubahan ini menambah migration dan Edge Function source, jalankan dari PowerShell user yang memiliki akses Supabase staging:

```powershell
supabase db push
supabase functions deploy signin-with-nomor-induk
supabase functions deploy manage-user
supabase functions deploy generate-signed-upload-url
supabase functions deploy reset-user-password
```

Catatan:

- jangan gunakan `--include-seed`;
- jangan jalankan `db reset --linked`;
- jangan deploy ke production;
- jangan memasukkan service-role key ke frontend atau Vercel.

### Retest Manual Setelah Backend Staging dan Vercel Redeploy

- edit dan simpan seluruh field santri, termasuk nama ayah/ibu, tanggal masuk, KK/NIK, link Qiroati, dan checklist berkas;
- login santri memakai Nama Panggilan sebagai username dan password bootstrap;
- pindah tab browser lalu kembali, pastikan halaman tidak kehilangan progress karena reload aplikasi;
- ubah absensi `Hadir` atau `Terlambat` menjadi `Tidak Hadir` dari rekap;
- scan RFID santri dua kali, pastikan card tetap muncul dan waktu pertama tidak berubah;
- pastikan avatar santri tampil pada card absensi digital;
- upload/putar media player di absensi digital;
- cek card `Santri Aktif` di dashboard admin;
- simpan gambar bukti pembayaran dan pastikan logo mengikuti logo website yang di-upload di Content Management.
