# 37 - Frontend Auth Integration Result

## Ringkasan

Fase integrasi frontend inti dengan Supabase lokal sudah dikerjakan untuk area Auth, session recovery, role profile, route guard, dan pemilihan dashboard.

Tidak dilakukan:

- tidak membuat Supabase project online;
- tidak menjalankan `supabase link`;
- tidak menyentuh database lama;
- tidak memakai data asli;
- tidak deploy;
- tidak push;
- tidak commit otomatis;
- tidak mengubah migration atau melemahkan RLS.

## File yang Diubah

Frontend:

- `src/contexts/SupabaseAuthContext.jsx`
- `src/components/ProtectedRoute.jsx`
- `src/pages/DashboardPage.jsx`
- `src/pages/LoginPage.jsx`
- `src/App.jsx`
- `src/components/dashboard/admin/BackupRestoreManagement.jsx`
- `src/components/dashboard/SantriDashboard.jsx`
- `src/utils/verifyDataSources.js`

Dokumentasi:

- `docs/37-frontend-auth-integration-result.md`

File lokal tidak untuk commit:

- `.env.local`

## Konfigurasi Frontend Lokal

File `.env.local` dibuat untuk penggunaan lokal dan tetap di-ignore Git.

Isi yang dipakai:

- `VITE_SUPABASE_URL=http://127.0.0.1:55321`
- `VITE_SUPABASE_ANON_KEY` berisi anon key lokal dari `supabase status`
- `VITE_ENABLE_EDGE_FUNCTIONS=true`
- `VITE_ENABLE_DEFERRED_FEATURES=false`

Tidak dimasukkan:

- service-role key;
- secret key;
- S3 secret;
- key production;
- URL Supabase lama.

Catatan: key tidak dicantumkan di laporan ini.

## Perubahan AuthContext

`src/contexts/SupabaseAuthContext.jsx` sekarang:

- memuat session melalui `supabase.auth.getSession`;
- memulihkan session saat refresh melalui listener `onAuthStateChange`;
- memuat `user_profiles` berdasarkan `user.id`;
- memakai `user_profiles.role` sebagai satu-satunya sumber role;
- menyimpan `user`, `session`, `profile`, `role`, `loading`, dan `profileLoading`;
- membersihkan semua state saat logout;
- tidak memakai role dari metadata, app metadata, atau email berisi admin;
- tidak memakai RPC lama untuk login santri;
- tidak log password, token, session penuh, atau email internal santri.

Login email untuk admin, guru, dan pentashih tetap memakai:

```text
supabase.auth.signInWithPassword
```

Login santri sekarang memakai Edge Function:

```text
signin-with-nomor-induk
```

Setelah function mengembalikan session resmi, frontend memanggil:

```text
supabase.auth.setSession
```

## Route Guard

`src/components/ProtectedRoute.jsx` sekarang mendukung `allowedRoles`.

Perilaku:

- auth masih loading: tampil loading;
- profile masih loading: tampil loading;
- belum login: redirect ke `/login`;
- role tidak diizinkan: redirect ke `/dashboard` atau tampilkan akses ditolak;
- role valid: render halaman.

Route yang memakai role guard:

- `/dashboard`: `admin`, `guru`, `santri`, `pentashih`
- `/absensi-digital`: `admin`, `guru`, `pentashih`
- `/tv-display-mode`: `admin`, `guru`, `pentashih`

## Dashboard Role

`src/pages/DashboardPage.jsx` sekarang memilih dashboard langsung dari role final:

- `admin` -> `AdminDashboard`
- `guru` -> `GuruDashboard`
- `santri` -> `SantriDashboard`
- `pentashih` -> `PentashihDashboard`

Pentashih tidak lagi dideteksi dari `guru.roles`.

## Deferred Features

Fitur deferred tetap tidak diaktifkan karena `VITE_ENABLE_DEFERRED_FEATURES=false`:

- forum;
- journey;
- music player;
- game/gatcha;
- quiz;
- top score;
- random name;
- backup/restore UI.

Perubahan kecil pada `BackupRestoreManagement.jsx` hanya menghapus referensi RPC auth lama agar runtime scan bersih. UI backup/restore tetap tersembunyi saat deferred disabled.

## Hasil Validasi

### Build

Perintah awal:

```text
npm run build
```

Hasil awal:

- gagal karena PowerShell memilih wrapper `npm.ps1`/npm global yang mengarah ke path `npm-cli.js` yang tidak tersedia.
- ini masalah environment npm lokal, bukan error source.

Perintah build yang berhasil:

```text
C:\Program Files\nodejs\npm.cmd run build
```

Hasil:

```text
vite build berhasil
2936 modules transformed
dist/ berhasil dibuat
```

### Backend Runner

Command:

```text
powershell -ExecutionPolicy Bypass -File scripts/run-local-backend-tests.ps1 -SupabaseUrl http://127.0.0.1:55321
```

Hasil:

```text
SUMMARY passed=40 failed=0
```

Smoke test di dalam runner:

```text
SUMMARY passed=22 failed=0
```

### Static Scan Runtime

Scan runtime JS/JSX/TS/TSX:

```text
mock_santri_session: tidak ditemukan
signin_with_username: tidak ditemukan
service-role/secret runtime frontend: tidak ditemukan
```

Catatan:

- Scan seluruh folder `src/` tanpa filter ekstensi masih menemukan istilah `service_role` di file SQL arsip lama.
- File tersebut bukan runtime React dan tidak diubah pada fase ini.

### Test Auth Lokal via Supabase JS

Test lokal dilakukan tanpa mencetak key, token, password, atau internal email penuh.

Hasil:

```text
PASS admin role=admin
PASS guru role=guru
PASS pentashih role=pentashih
PASS santri role=santri
PASS final session cleared
SUMMARY failed=0
```

Yang terverifikasi:

- admin login via Supabase Auth;
- guru login via Supabase Auth;
- pentashih login via Supabase Auth;
- santri login via `signin-with-nomor-induk`;
- session santri dapat dipasang dengan `setSession`;
- role dibaca dari `user_profiles`;
- logout/signOut membersihkan session pada test client.

### Browser Lokal

Browser lokal sudah berhasil dipakai untuk membuka dashboard semua role:

```text
admin dashboard: berhasil
guru dashboard: berhasil
pentashih dashboard: berhasil
santri dashboard: berhasil
```

Yang terverifikasi melalui browser:

- login admin;
- login guru;
- login pentashih;
- login santri memakai Nomor Induk Qiroati;
- dashboard sesuai role.

## Risiko Tersisa

- Modul data dashboard lama masih banyak memakai schema legacy dan belum menjadi fokus pekerjaan ini.
- Beberapa halaman public masih perlu mapping ke `news` dan `announcements` pada fase berikutnya.
- Guru dashboard dan modul pembayaran detail belum dibersihkan pada fase ini; RLS backend tetap menjadi proteksi.
- Browser-level regression test perlu dilakukan pada Fase 4B lanjutan.

## Rekomendasi Berikutnya

1. Jalankan frontend lokal dari terminal biasa dengan:

```text
C:\Program Files\nodejs\npm.cmd run dev
```

2. Lanjutkan wave berikutnya: mapping dashboard query inti ke schema backend lokal.
3. Jangan commit `.env.local`.
