# Phase 1 Implementation Result

## Ringkasan

Fase 1 sudah diimplementasikan secara minimal untuk memutus hard-code Supabase lama dari runtime frontend, menambahkan konfigurasi berbasis environment variable, membersihkan mock login santri, memberi guard pada Edge Function, menyembunyikan fitur tertunda, dan memperbarui branding runtime ke nama publik:

**LPQ Al-Fath Maulana**

Tidak ada restore database, migration SQL, deployment, pembuatan project Supabase baru, atau penggunaan service-role key.

## File Dibuat

- `.env.example`
- `src/lib/featureFlags.js`
- `docs/10-phase-1-implementation-plan.md`
- `docs/11-phase-1-implementation-result.md`

## File Diubah

- `.gitignore`
- `index.html`
- `lib/customSupabaseClient.js`
- `src/lib/customSupabaseClient.js`
- `src/contexts/SupabaseAuthContext.jsx`
- `src/pages/LoginPage.jsx`
- `src/App.jsx`
- `src/components/Navbar.jsx`
- `src/components/dashboard/AdminDashboard.jsx`
- `src/components/dashboard/GuruDashboard.jsx`
- `src/pages/DigitalAttendancePage.jsx`
- `src/components/dashboard/admin/GuruManagement.jsx`
- `src/components/dashboard/admin/SantriManagement.jsx`
- `src/components/dashboard/admin/SantriDewasaManagement.jsx`
- `src/components/dashboard/admin/BackupRestoreManagement.jsx`
- `src/pages/TvDisplayPage.jsx`
- `src/pages/QuizHafalanPage.jsx`
- `src/pages/GatchaGamePage.jsx`
- `src/pages/TopScorePage.jsx`
- `src/pages/GalleryPage.jsx`
- `src/components/dashboard/admin/JilidChangeModal.jsx`
- `src/components/dashboard/admin/TvDisplaySettings.jsx`
- `src/components/dashboard/admin/MMQScheduleForm.jsx`
- `src/components/dashboard/admin/PaymentSystem.jsx`
- `src/components/dashboard/admin/PaymentProofModal.jsx`
- `src/verify_mmq_policies.js`
- `public/llms.txt`
- `package-lock.json` tersentuh oleh `npm install` untuk verifikasi dependency.

## Perubahan Utama

### Environment

- `.env.example` berisi template:
  - `VITE_SUPABASE_URL=`
  - `VITE_SUPABASE_ANON_KEY=`
  - `VITE_ENABLE_EDGE_FUNCTIONS=false`
  - `VITE_ENABLE_DEFERRED_FEATURES=false`
- `.gitignore` tetap mengabaikan `.env` dan `.env.*`, tetapi mengizinkan `.env.example`.

### Supabase Client

- `src/lib/customSupabaseClient.js` menjadi client resmi.
- URL dan anon key hanya dibaca dari `import.meta.env`.
- Export lama dipertahankan: default, `customSupabaseClient`, dan `supabase`.
- Ditambahkan `isSupabaseConfigured`.
- Jika env kosong, client stub tidak mengirim request backend dan tidak crash saat module di-import.
- `lib/customSupabaseClient.js` hanya re-export dari client resmi.

### Auth

- `mock_santri_session` dihapus dari AuthContext.
- Login santri tidak lagi membandingkan password dari tabel `santri`.
- Login email admin/guru tetap lewat Supabase Auth.
- Login santri sementara hanya lewat RPC `signin_with_username`.
- Jika Supabase belum dikonfigurasi, login mengembalikan pesan konfigurasi yang jelas.
- Flow “Daftar Akun Guru” dan pemanggilan `manage-user` di halaman login dihapus.

### Edge Function Guards

- `manage-user` pada manajemen guru diberi guard.
- `generate-signed-upload-url` pada upload foto santri diberi guard.
- `backup-database` dan `restore-database` diberi guard.
- Saat `VITE_ENABLE_EDGE_FUNCTIONS=false`, aksi terkait tidak mengirim request dan menampilkan:

> Fitur ini akan diaktifkan setelah Supabase baru dan Edge Function tersedia.

### Deferred Features

Saat `VITE_ENABLE_DEFERRED_FEATURES=false`, fitur berikut disembunyikan atau diarahkan ke halaman “fitur belum diaktifkan”:

- forum
- game/gatcha
- quiz
- top score
- random name
- music player
- backup/restore UI
- konfigurasi game

TV Display tetap dipertahankan.

### Branding dan Asset

- Runtime UI memakai nama publik baru.
- Favicon dan title di `index.html` memakai `/logo.png` dan nama publik.
- URL asset Storage Supabase lama di runtime diganti dengan `/logo.png`.
- Branding LPQ Al-Fath Maulana dibersihkan dari file runtime aktif.

## Hasil Static Scan

Perintah scan dijalankan pada `src`, `lib`, `public`, `index.html`, dan `dist`, dengan file `.md` dan `.sql` dikecualikan untuk arsip/dokumentasi.

Hasil:

- Domain Supabase lama: tidak ditemukan.
- Key lama / `sb_publishable`: tidak ditemukan.
- `mock_santri_session`: tidak ditemukan.
- Branding `Al-Fath`, `Al Fath`, `alfath`, `ALFATH`: tidak ditemukan di runtime.
- URL asset Storage lama: tidak ditemukan.
- `service-role` / `SERVICE_ROLE`: tidak ditemukan.

## Hasil Install dan Build

### `npm install`

Berhasil.

Catatan:

- npm melaporkan 18 vulnerability dependency: 1 low, 6 moderate, 10 high, 1 critical.
- Belum dilakukan `npm audit fix` karena itu bisa mengubah dependency lebih luas dan bukan bagian Fase 1.
- Ada warning PowerShell profile tentang module `Microsoft.WinGet.CommandNotFound`; tidak menghentikan install.

### `npm run build`

Perintah mengembalikan exit code 0, tetapi tidak membentuk folder `dist` pada percobaan pertama. Untuk memastikan build benar-benar berjalan, Vite build dijalankan langsung:

```bash
npx vite build
```

Hasil: berhasil.

Output utama:

- 2936 modules transformed.
- `dist/index.html` dibuat.
- bundle utama `assets/index-CCC7P9RD.js` sekitar 2703 kB.
- Vite memberi warning ukuran chunk besar, tetapi build tetap sukses.

## Pemeriksaan Lokal

- Tanpa `.env.local`, client Supabase masuk mode tidak terkonfigurasi dan tidak memakai URL lama.
- Halaman publik dapat memakai fallback lokal `/logo.png`.
- Login santri tidak membuat mock session.
- Pendaftaran guru mandiri tidak tersedia.
- Route fitur tertunda tidak merender halaman asli yang berisi request backend.
- TV Display masih tersedia.

Pemeriksaan browser lokal tidak dijalankan penuh karena fokus verifikasi tahap ini adalah static scan dan build. Build produksi berhasil dibuat di `dist`.

## Masalah yang Belum Terselesaikan

- Supabase baru belum dibuat, sehingga env produksi baru belum bisa diisi.
- RPC `signin_with_username` baru belum dibuat atau diverifikasi di project Supabase baru.
- Edge Function baru belum tersedia.
- RLS final untuk role admin, guru, santri, dan pentashih belum diterapkan.
- Dependency audit masih memiliki vulnerability dan perlu ditangani terpisah.
- `npm run build` pada Windows mengembalikan sukses tanpa membentuk `dist`; sementara ini `npx vite build` berhasil. Script build perlu dirapikan pada fase berikutnya.
- Folder ini tidak terdeteksi sebagai Git repository, sehingga diff Git tidak dapat diperiksa.

## Langkah Manual User

1. Jangan isi `.env.local` dengan credential Supabase lama.
2. Setelah project Supabase baru siap, buat `.env.local` lokal berisi:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_ENABLE_EDGE_FUNCTIONS=false`
   - `VITE_ENABLE_DEFERRED_FEATURES=false`
3. Jalankan `npx vite build` untuk build sementara jika `npm run build` belum dirapikan.
4. Jangan aktifkan Edge Function flag sebelum Edge Function baru tersedia.
5. Jangan aktifkan deferred features sebelum tabel/bucket/policy terkait siap di Supabase baru.

## Rekomendasi Tahap Berikutnya

1. Buat project Supabase baru kosong.
2. Rancang schema final baru, RLS final, dan mapping role.
3. Buat flow Supabase Auth untuk admin, guru, santri, dan pentashih.
4. Buat RPC `signin_with_username` versi baru yang tidak memakai password plaintext.
5. Buat Edge Function baru untuk manajemen user dan signed upload.
6. Baru setelah backend baru siap, isi `.env.local` dengan credential project baru dan uji fitur prioritas satu per satu.
