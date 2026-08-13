# 16 - Authentication Design

## Tujuan

Semua pengguna memakai Supabase Auth resmi. Tidak ada mock session, tidak ada password plaintext di tabel aplikasi, dan tidak ada JWT custom.

Role final:

- `admin`
- `guru`
- `santri`
- `pentashih`

## Keputusan Final Fase 2

Seluruh keputusan autentikasi Fase 2 pada dokumen ini sudah final.

- Password awal santri dibuat oleh admin.
- Santri login memakai Nomor Induk Qiroati sebagai username dan password.
- Nomor Induk Qiroati memakai format resmi lembaga, unik, konsisten, tanpa spasi, dan disimpan sebagai `text`.
- Email internal hanya identifier teknis Supabase Auth yang tersembunyi.
- Email internal tidak ditampilkan kepada santri/wali dan tidak dipakai pada form login.
- Edge Function login santri tidak membuat JWT custom dan tidak membaca/menyimpan password plaintext di tabel aplikasi.

## Sumber Kebenaran Role

Gunakan kombinasi berikut:

1. `user_profiles.role` sebagai sumber kebenaran database.
2. `auth.users.raw_user_meta_data.role` boleh menjadi mirror untuk UI cepat.
3. RLS sebaiknya mengambil role dari tabel/profil atau claim yang dikendalikan server, bukan dari input client.

Rekomendasi helper database nanti:

- `auth_user_role()` mengembalikan role user saat ini.
- `is_admin()`
- `is_guru_for_santri(santri_id)`
- `is_pentashih_for_class(class_id)`

Helper ini dibuat nanti di migration, bukan pada Fase 2 desain.

## Pembuatan Akun

### Admin

Admin awal dibuat manual dari Supabase Dashboard atau script bootstrap lokal yang aman.

Setelah admin pertama ada:

- admin membuat guru;
- admin membuat santri;
- admin membuat pentashih;
- admin reset password bila diperlukan.

### Guru dan Pentashih

Guru dan pentashih tidak boleh daftar sendiri.

Alur:

1. Admin mengisi data akun.
2. Frontend memanggil Edge Function `manage-user`.
3. Edge Function membuat user di Supabase Auth.
4. Edge Function membuat `user_profiles`.
5. Edge Function membuat atau update `guru`.
6. Jika role `pentashih`, buat `user_profiles.role = 'pentashih'` dan profil `guru` tetap boleh ada untuk data operasional.

### Santri

Santri dibuat oleh admin, bukan daftar mandiri.

Alur:

1. Admin input data santri dan Nomor Induk Qiroati.
2. Edge Function `manage-user` membuat user Supabase Auth untuk santri.
3. Edge Function membuat `user_profiles` dengan `role = 'santri'`.
4. Edge Function membuat `santri` dengan `id = auth.users.id`.
5. Edge Function membuat mapping `auth_login_aliases` untuk Nomor Induk Qiroati.
6. Admin membuat password awal melalui Supabase Auth, bukan menyimpannya di tabel `santri`.
7. Admin menyerahkan username Nomor Induk Qiroati dan password awal kepada santri/wali melalui prosedur operasional lembaga.

## Login Santri dengan Nomor Induk Qiroati

Nama Edge Function:

- `signin-with-nomor-induk`

Input:

- `nomor_induk_qiroati`
- `password`

Alur aman:

1. Validasi input kosong/format.
2. Normalisasi nomor induk.
3. Cari mapping aktif di `auth_login_aliases`.
4. Ambil identifier Auth internal, misalnya `internal_email`.
5. Panggil Supabase Auth sign-in server-side dengan email internal dan password.
6. Jika berhasil, kembalikan session Supabase Auth resmi ke frontend.
7. Jika gagal, kembalikan pesan umum: "Nomor Induk Qiroati atau password salah."

Yang tidak boleh dilakukan:

- Membuat JWT sendiri.
- Membandingkan password dengan kolom `santri.password`.
- Mengirim internal email ke UI.
- Membuka detail apakah nomor induk ada atau tidak.

## Login Admin/Guru/Pentashih

Input:

- email
- password

Alur:

1. Frontend memakai Supabase Auth `signInWithPassword`.
2. Setelah session aktif, frontend membaca role.
3. Dashboard diarahkan berdasarkan role.

Catatan frontend:

- Fase berikutnya mungkin perlu mengubah deteksi role agar `pentashih` bisa menjadi role utama.
- Untuk transisi, `guru.roles = ['Pentashih']` boleh tetap disimpan sebagai mirror.

## Reset Password

Edge Function:

- `reset-user-password`

Mode:

- admin reset password user;
- self-service reset password via email jika SMTP Supabase sudah dikonfigurasi.

Rekomendasi awal:

- Untuk launch awal, admin reset password manual melalui Edge Function lebih sederhana.
- Self-service email bisa ditambahkan setelah email domain siap.

## Metadata Auth

Minimal metadata:

```text
role
display_name
```

Jangan simpan:

- NIK
- nomor KK
- alamat lengkap
- password
- nomor induk sebagai data rahasia yang tidak perlu

Data profil lengkap tetap di tabel aplikasi dengan RLS.

## Akun Internal Santri

Nomor Induk Qiroati dipetakan ke email internal. Contoh konsep:

```text
santri+<uuid>@auth.lpqalfathmaulana.local
```

Nilai ini hanya detail teknis Supabase Auth. Santri/wali tetap melihat dan memakai Nomor Induk Qiroati sebagai username. Email internal tidak ditampilkan di profil santri/wali, tidak dipakai di form login, dan tidak dikirim sebagai informasi akun kepada santri/wali.

## Error dan Keamanan

Semua error login harus aman:

- Jangan bilang "Nomor induk ditemukan tapi password salah".
- Jangan bilang "Akun belum dibuat".
- Gunakan pesan umum untuk mencegah enumeration.

Rate limit direkomendasikan pada Edge Function:

- limit per IP;
- limit per nomor induk;
- cooldown setelah beberapa gagal.

## Migrasi Password Lama

Password lama tidak dimigrasikan.

Strategi:

1. Buat akun Auth baru.
2. Admin membuat password awal santri.
3. Minta user mengganti password.
4. Jangan import kolom `password` dari tabel lama.

## Acceptance Criteria Auth

- Admin bisa login dan mengelola akun.
- Guru bisa login, tidak bisa daftar sendiri.
- Santri bisa login dengan Nomor Induk Qiroati + password melalui session Supabase Auth resmi.
- Pentashih bisa login dan mendapat role yang tepat.
- Tidak ada mock session.
- Tidak ada password plaintext di `santri` atau `guru`.
