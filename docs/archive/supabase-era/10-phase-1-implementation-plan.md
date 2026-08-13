# Phase 1 Frontend Configuration Cleanup

## Tujuan

Fase 1 membersihkan konfigurasi frontend LPQ Al-Fath Maulana 2 agar source code tidak lagi terhubung secara tidak sengaja ke project Supabase produksi lama. Perubahan dibatasi pada konfigurasi runtime, guard fitur, pembersihan auth sementara, branding runtime, dan dokumentasi.

## Batasan

- Tidak mengubah database Supabase lama.
- Tidak melakukan restore database, migration SQL, deployment, atau pembuatan project Supabase baru.
- Tidak menggunakan service-role key.
- Tidak menghapus fitur permanen; fitur tertunda disembunyikan atau diberi guard.
- Tidak membuka data pribadi dari backup.

## Rencana File per File

### `.env.example`

- Tambahkan template env:
  - `VITE_SUPABASE_URL=`
  - `VITE_SUPABASE_ANON_KEY=`
  - `VITE_ENABLE_EDGE_FUNCTIONS=false`
  - `VITE_ENABLE_DEFERRED_FEATURES=false`

### `.gitignore`

- Pastikan `.env`, `.env.local`, dan `.env.*` tetap diabaikan.
- Allowlist `.env.example` agar tetap dapat dilacak Git.

### `src/lib/customSupabaseClient.js`

- Jadikan file ini satu-satunya Supabase client resmi.
- Ambil URL dan anon key hanya dari `import.meta.env`.
- Export `isSupabaseConfigured` dan pesan konfigurasi.
- Saat env kosong, gunakan client stub yang tidak mengirim request dan tidak crash saat import.
- Pertahankan export lama: default, `customSupabaseClient`, dan `supabase`.

### `lib/customSupabaseClient.js`

- Ubah menjadi re-export dari `src/lib/customSupabaseClient.js`.
- Hapus seluruh credential dan URL Supabase lama.

### `src/lib/featureFlags.js`

- Tambahkan flag `enableEdgeFunctions` dan `enableDeferredFeatures`.
- Flag hanya aktif jika nilai env persis `"true"`.
- Tambahkan pesan standar untuk fitur Edge Function yang belum aktif.

### `src/contexts/SupabaseAuthContext.jsx`

- Hapus `mock_santri_session`.
- Hapus fallback login yang membaca password dari tabel `santri`.
- Login email tetap memakai Supabase Auth.
- Login santri sementara hanya memakai RPC `signin_with_username`.
- Jika Supabase belum dikonfigurasi, kembalikan error yang jelas.

### `src/pages/LoginPage.jsx`

- Hapus flow pendaftaran guru mandiri.
- Hapus pemanggilan `manage-user` dari halaman login.
- Jangan membuka realtime channel logo jika Supabase belum dikonfigurasi.
- Perbarui teks login ke nama publik.

### Edge Function Guards

- `src/components/dashboard/admin/GuruManagement.jsx`: guard `manage-user`.
- `src/components/dashboard/admin/SantriManagement.jsx`: guard `generate-signed-upload-url`.
- `src/components/dashboard/admin/SantriDewasaManagement.jsx`: guard `generate-signed-upload-url`.
- `src/components/dashboard/admin/BackupRestoreManagement.jsx`: guard `backup-database` dan `restore-database`.

Saat `VITE_ENABLE_EDGE_FUNCTIONS=false`, aksi terkait tidak mengirim request dan menampilkan pesan:

> Fitur ini akan diaktifkan setelah Supabase baru dan Edge Function tersedia.

### Deferred Features

- `src/App.jsx`: route forum, game/gatcha/quiz, random name, dan top score diarahkan ke halaman fitur belum aktif saat flag mati.
- `src/components/dashboard/AdminDashboard.jsx`: sembunyikan tombol game/quiz/random dan tab backup/game config.
- `src/components/dashboard/GuruDashboard.jsx`: sembunyikan tombol game/quiz/random.
- `src/pages/DigitalAttendancePage.jsx`: sembunyikan tombol top score/random/game/quiz dan music player.

TV Display tetap aktif.

### Branding dan Asset Runtime

- Gunakan nama publik `LPQ Al-Fath Maulana`.
- Ganti favicon/title di `index.html`.
- Hapus URL asset Supabase lama dari source runtime dan gunakan `/logo.png`.
- Bersihkan branding LPQ Al-Fath Maulana dari file runtime aktif.

## Checklist Pengujian

- Static scan untuk domain Supabase lama, key lama, `mock_santri_session`, branding Al-Fath, dan URL Storage lama.
- `npm install`.
- `npm run build`.
- Pastikan tanpa `.env.local`, aplikasi tidak fallback ke Supabase lama.
- Pastikan halaman publik tetap memakai fallback lokal.
- Pastikan login santri tidak membuat mock session.
- Pastikan pendaftaran guru mandiri tidak tersedia.
- Pastikan fitur Edge Function tidak mengirim request saat flag false.
- Pastikan fitur deferred tidak aktif dan TV Display tetap dipertahankan.
