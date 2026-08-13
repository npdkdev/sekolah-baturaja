# 33 - Frontend Auth and Route Guard Plan

## Status

Dokumen ini adalah rencana integrasi Auth frontend dengan Supabase lokal.

Tidak ada implementasi pada Fase 4A. Perubahan kode baru dilakukan pada Fase 4B setelah rencana ini disetujui.

## Prinsip Final

- Semua role memakai Supabase Auth resmi.
- Role final: `admin`, `guru`, `santri`, `pentashih`.
- Santri tetap login dengan Nomor Induk Qiroati dan password.
- Nomor Induk Qiroati adalah username yang dilihat santri/wali.
- Email internal santri hanya identifier teknis Supabase Auth di belakang layar.
- Email internal tidak tampil ke santri/wali dan tidak dipakai di form login.
- Tidak ada JWT custom.
- Tidak ada mock session.
- Tidak ada password plaintext di tabel aplikasi.
- Guru dan santri dibuat oleh admin, bukan daftar mandiri.

## Kondisi Auth Frontend Saat Ini

File terkait:

- `src/contexts/SupabaseAuthContext.jsx`
- `src/pages/LoginPage.jsx`
- `src/components/ProtectedRoute.jsx`
- `src/pages/DashboardPage.jsx`

Kondisi sekarang:

- Email admin/guru memakai `supabase.auth.signInWithPassword`.
- Santri masih memakai RPC `signin_with_username`.
- Role masih diambil dari metadata Auth atau fallback email.
- `ProtectedRoute` hanya mengecek user login.
- Dashboard pentashih masih dideteksi lewat `guru.roles`.

## Target Auth Flow

### Admin, Guru, dan Pentashih

Alur:

1. User memasukkan email dan password.
2. Frontend memanggil `supabase.auth.signInWithPassword`.
3. Supabase Auth mengembalikan session resmi.
4. Frontend memuat `user_profiles` untuk `auth.uid()`.
5. AuthContext menyimpan `user`, `session`, `profile`, dan `role`.
6. Route guard memilih akses berdasarkan role dari `user_profiles`.

Catatan:

- Pentashih login memakai email/password Supabase Auth seperti guru/admin.
- Pentashih tidak lagi dideteksi dari array `guru.roles`.
- Jika pentashih juga punya baris operasional di `guru`, baris itu hanya data operasional, bukan sumber role utama.

### Santri

Alur:

1. Santri/wali memasukkan Nomor Induk Qiroati dan password.
2. Frontend mendeteksi input bukan email.
3. Frontend memanggil Edge Function `signin-with-nomor-induk`.
4. Function menerima:

```json
{
  "nomor_induk_qiroati": "DUMMY001",
  "password": "password-user"
}
```

5. Function mencari mapping pada `auth_login_aliases`.
6. Function memakai identifier Auth internal untuk verifikasi password lewat Supabase Auth.
7. Function mengembalikan session Supabase Auth resmi.
8. Frontend memanggil `supabase.auth.setSession`.
9. Frontend memuat `user_profiles`.
10. Dashboard santri berjalan dengan RLS `auth.uid()`.

Aturan:

- Frontend tidak pernah melihat service-role key.
- Frontend tidak perlu tahu email internal santri.
- Error login santri tetap generik: Nomor Induk Qiroati atau password salah.
- Password tidak dicetak ke console.

## Rencana Perubahan AuthContext Fase 4B

Target state AuthContext:

- `user`
- `session`
- `profile`
- `role`
- `loading`
- `profileLoading`
- `signIn`
- `signInWithUsername`
- `signOut`
- optional `refreshProfile`

Perubahan utama:

- Setelah `getSession` atau `onAuthStateChange`, panggil loader profile.
- Loader profile membaca `user_profiles` berdasarkan `user.id`.
- Role hanya berasal dari `user_profiles.role`.
- Hapus fallback email berisi `admin`.
- Ganti RPC `signin_with_username` menjadi Edge Function `signin-with-nomor-induk`.
- Jangan log password, token, session penuh, atau email internal.
- Jika profile tidak ditemukan, tampilkan error jelas dan arahkan user logout/login ulang.

## Rencana LoginPage Fase 4B

Input tetap satu field username:

- Jika format email, jalankan login email/password.
- Jika bukan email, anggap sebagai Nomor Induk Qiroati.

Pesan UI:

- Placeholder boleh tetap: `Email Guru/Admin atau Nomor Induk Qiroati`.
- Untuk pentashih, email digunakan seperti guru/admin.
- Untuk santri/wali, tidak ada email yang diminta.

Error:

- Supabase belum dikonfigurasi: tampilkan pesan konfigurasi lokal.
- Network/server gagal: tampilkan koneksi gagal.
- Login salah: tampilkan pesan generik.
- Role/profile tidak valid: tampilkan pesan hubungi admin.

## Rencana Route Guard

`ProtectedRoute` perlu mendukung role allowlist.

Contoh konsep penggunaan Fase 4B:

```jsx
<ProtectedRoute allowedRoles={['admin']}>
  <AdminOnlyPage />
</ProtectedRoute>
```

Perilaku:

- Jika auth loading, tampilkan loading.
- Jika tidak ada user, redirect ke `/login`.
- Jika user ada tetapi profile masih loading, tampilkan loading profile.
- Jika role tidak diizinkan, tampilkan halaman akses ditolak atau redirect ke `/dashboard`.
- Jika role diizinkan, render children.

Route role awal:

| Route | Role yang boleh |
|---|---|
| `/dashboard` | semua role login |
| `/absensi-digital` | admin, guru, pentashih sesuai kebutuhan operasional |
| `/tv-display-mode` | admin, guru, pentashih sesuai kebutuhan operasional |
| Admin tabs | admin |
| Guru dashboard | guru |
| Santri dashboard | santri |
| Pentashih dashboard | pentashih |

Catatan:

- `/dashboard` dapat tetap satu route, tetapi isi dashboard harus dipilih dari role profile.
- Route public tetap tidak butuh login.

## Rencana Dashboard Role

`DashboardPage.jsx` harus berubah dari:

- role dari metadata/email;
- pentashih dari `guru.roles`.

Menjadi:

- role dari AuthContext profile;
- `admin` -> `AdminDashboard`;
- `guru` -> `GuruDashboard`;
- `santri` -> `SantriDashboard`;
- `pentashih` -> `PentashihDashboard`.

Data tambahan:

- `SantriDashboard` boleh memuat kategori dari `santri.kategori`.
- `GuruDashboard` boleh memuat data operasional guru dari `guru`.
- `PentashihDashboard` harus memakai assignment, bukan hitung global.

## Rencana Logout

Logout harus:

- memanggil `supabase.auth.signOut`;
- membersihkan `user`, `session`, `profile`, dan `role`;
- tidak menyebut mock session;
- tidak menyimpan state auth custom di localStorage selain mekanisme Supabase Auth resmi.

## Error dan Failure Mode

| Kondisi | Respons frontend |
|---|---|
| Env Supabase kosong | Jangan request backend, tampilkan pesan konfigurasi. |
| Edge Function login santri belum aktif | Tampilkan pesan server login santri belum tersedia. |
| Nomor/password salah | Tampilkan error generik. |
| Session valid tetapi `user_profiles` tidak ada | Tampilkan pesan akun belum lengkap, minta hubungi admin. |
| Role tidak dikenal | Logout atau blok dashboard dengan pesan role tidak valid. |
| RLS menolak query | Tampilkan pesan akses tidak diizinkan, jangan retry tanpa batas. |

## Test Auth Fase 4B

Test wajib setelah implementasi:

- Login admin berhasil dan dashboard admin terbuka.
- Login guru berhasil dan dashboard guru terbuka.
- Login pentashih berhasil dan dashboard pentashih terbuka.
- Login santri dengan Nomor Induk Qiroati berhasil.
- Login santri tidak memakai email pada UI.
- Password salah menghasilkan error generik.
- Refresh browser mempertahankan session.
- Logout membersihkan dashboard.
- User guru tidak bisa membuka view admin.
- User santri tidak bisa membuka data santri lain.
- Role tidak diambil dari email atau metadata bebas.
- Tidak ada `signin_with_username` pada auth runtime.
- Tidak ada `mock_santri_session`.

## Gate Sebelum Implementasi

Fase 4B auth baru boleh dianggap selesai jika:

- `user_profiles.role` menjadi sumber role tunggal.
- Santri login lewat `signin-with-nomor-induk`.
- Supabase session resmi dipakai.
- Tidak ada JWT custom.
- Tidak ada mock session.
- Route guard punya role allowlist.
- Dashboard pentashih memakai role top-level.
- Password, token, session penuh, dan email internal tidak dicetak ke log.
