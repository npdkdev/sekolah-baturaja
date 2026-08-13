# 21 - Phase 3A Technical Implementation Plan

## Status

Dokumen ini adalah rencana implementasi teknis backend Supabase baru untuk LPQ Al-Fath Maulana.

Fase 3A hanya perencanaan. Pada fase ini tidak dibuat project Supabase, tidak dibuat migration SQL, tidak menjalankan Supabase CLI, tidak menjalankan SQL, tidak membuat `.env.local`, tidak mengubah frontend, tidak restore backup, tidak deploy, dan tidak memakai data asli.

Sumber keputusan utama:

- `docs/14-backend-architecture-proposal.md`
- `docs/15-final-database-schema.md`
- `docs/16-authentication-design.md`
- `docs/17-rls-access-matrix.md`
- `docs/18-storage-and-edge-functions.md`
- `docs/19-data-migration-strategy.md`
- `docs/20-phase-2-decisions-needed.md`

## Keputusan Final yang Wajib Diikuti

- Semua role memakai Supabase Auth resmi: `admin`, `guru`, `santri`, `pentashih`.
- Santri login memakai Nomor Induk Qiroati dan password.
- Nomor Induk Qiroati disimpan sebagai `text`, unik, konsisten, tanpa spasi, dan mengikuti format resmi lembaga.
- Email internal santri hanya identifier teknis Supabase Auth, tidak tampil ke santri/wali, dan tidak dipakai pada form login.
- Password awal santri dibuat oleh admin.
- Tidak ada password plaintext di tabel aplikasi.
- Tidak ada JWT custom.
- Guru hanya boleh melihat status pembayaran santri kelasnya sebagai `Lunas` atau `Belum Lunas`.
- Guru tidak boleh melihat nominal, metode pembayaran, catatan transaksi, atau detail keuangan lain.
- Foto profil santri berada pada `avatars/santri/<auth.uid()>/profile.webp`.
- Santri hanya boleh mengelola foto profilnya sendiri.
- Guru hanya boleh mengelola foto profil santri pada kelas yang diampu.
- Soft delete disimpan permanen sampai dibersihkan oleh admin teknis.
- Feedback lama tidak dimigrasikan.

## Struktur Proyek yang Direncanakan

```text
supabase/
  config.toml
  migrations/
  functions/
    signin-with-nomor-induk/
    manage-user/
    reset-user-password/
    generate-signed-upload-url/
    import-master-data/
    export-sensitive-report/
  seed.sql
  tests/
scripts/
docs/
```

Fungsi setiap path:

- `supabase/config.toml`: konfigurasi Supabase lokal/staging yang tidak memuat secret produksi.
- `supabase/migrations/`: file migration kecil, berurutan, dan dapat direview satu per satu.
- `supabase/functions/`: kode Edge Function. Service-role hanya boleh hidup di environment server function.
- `supabase/seed.sql`: seed data dummy yang aman dan fiktif.
- `supabase/tests/`: rencana dan script test SQL/RLS/Storage/Edge Function.
- `scripts/`: script lokal untuk bootstrap akun dummy, validasi migration, dan laporan agregat. Script tidak boleh mencetak data pribadi.
- `docs/`: dokumentasi keputusan, rencana, hasil pengujian, dan gate implementasi.

## Alur Implementasi Besar

1. Siapkan repository backend Supabase dalam folder `supabase/`.
2. Buat migration schema dasar tanpa RLS.
3. Tambahkan helper function RLS yang aman.
4. Aktifkan RLS dan policy per tabel.
5. Buat bucket Storage dan policy.
6. Buat Edge Function minimal.
7. Buat data dummy.
8. Jalankan test Auth, RLS, Storage, dan Edge Function.
9. Perbaiki migration bila test gagal.
10. Setelah semua gate lolos, baru masuk rencana migrasi data asli pada fase terpisah.

## Prinsip Migration

- Migration harus kecil dan berurutan.
- Satu migration menangani satu kelompok domain.
- Migration tidak boleh berisi data asli.
- Migration tidak boleh menyalin policy lama.
- RLS diaktifkan setelah helper tersedia.
- Constraint dibuat sedini mungkin jika dependency sudah siap.
- Index tambahan dibuat setelah tabel dan relasi stabil.
- Rollback utama pada fase awal adalah drop object di environment baru/staging, bukan mengubah database produksi lama.

## Auth Implementation Plan

### Admin

- Admin awal dibuat manual di Supabase Dashboard atau script bootstrap lokal yang aman.
- Setelah admin pertama ada, admin mengelola akun guru, santri, dan pentashih lewat Edge Function `manage-user`.
- Admin boleh mengelola seluruh data operasional melalui RLS.

### Guru

- Guru dibuat oleh admin.
- Guru login memakai email dan password Supabase Auth.
- Guru tidak boleh daftar sendiri.
- Guru hanya mengakses santri, absensi, hafalan, catatan, dan avatar pada kelas yang diampu.
- Guru hanya melihat status pembayaran melalui view terbatas.

### Santri

- Santri dibuat oleh admin.
- `santri.id` sama dengan `auth.users.id`.
- Admin membuat password awal santri.
- `auth_login_aliases` memetakan Nomor Induk Qiroati ke akun Supabase Auth.
- Santri login melalui Edge Function `signin-with-nomor-induk`.
- Santri hanya membaca data sendiri dan mengelola avatar sendiri.

### Pentashih

- Pentashih dibuat oleh admin.
- Pentashih login memakai email dan password Supabase Auth.
- Akses pentashih ditentukan oleh `pentashih_class_assignments`.
- Pentashih tidak otomatis dapat akses seluruh data guru/santri.

## RLS Helper Function Plan

Helper yang dirancang:

- `current_user_role()`
- `is_admin()`
- `is_guru()`
- `is_santri()`
- `is_pentashih()`
- `guru_has_class_access(class_id uuid)`
- `guru_has_santri_access(santri_id uuid)`
- `pentashih_has_class_access(class_id uuid)`
- `pentashih_has_santri_access(santri_id uuid)`
- `user_owns_santri_record(santri_id uuid)`

Prinsip keamanan helper:

- Gunakan `security definer` hanya jika benar-benar perlu.
- Set `search_path` eksplisit, misalnya `public`.
- Helper membaca tabel minimal yang diperlukan.
- Helper tidak melakukan write.
- Helper tidak membaca tabel yang policy-nya memanggil helper itu dengan cara yang menyebabkan recursion.
- Jika helper harus membaca tabel yang juga ber-RLS, gunakan fungsi kecil yang stabil dan diuji khusus.

## Storage Implementation Plan

### `avatars`

- Path santri: `santri/<auth.uid()>/profile.webp`
- Path guru: `guru/<auth.uid()>/profile.webp`
- Santri mengelola avatar sendiri.
- Guru mengelola avatar sendiri dan avatar santri pada kelas yang diampu.
- Admin mengelola semua avatar.
- Public read tidak menjadi default.
- Validasi: JPG, JPEG, PNG, WebP, maksimal 2 MB untuk avatar santri.
- Upload baru menggantikan file lama.

### `website-assets`

- Public read.
- Admin write.
- Digunakan untuk logo, hero, galeri, brosur, news, announcements, profil, dan kontak.
- Validasi MIME dan ukuran berdasarkan jenis file.

### `murojaah-recordings`

- Private.
- Santri upload rekaman sendiri.
- Guru, pentashih, dan admin membaca sesuai scope.
- Playback/download memakai signed URL.
- Validasi MIME audio dan ukuran maksimal.

## Edge Function Implementation Plan

Function inti:

- `signin-with-nomor-induk`
- `manage-user`
- `reset-user-password`
- `generate-signed-upload-url`

Function opsional:

- `import-master-data`, hanya bila migrasi data membutuhkan jalur server-side idempotent.
- `export-sensitive-report`, hanya bila laporan sensitif tidak aman dibaca langsung dari client dengan RLS.

Aturan umum:

- Service-role hanya boleh digunakan di Edge Function.
- Service-role tidak boleh dikirim ke frontend.
- Password tidak boleh dicetak ke log.
- Error login harus generik.
- Semua input divalidasi.
- Semua operasi sensitif mengecek role dari session Supabase Auth.

## Data Dummy

Seed dummy harus fiktif:

- 1 admin
- 2 guru
- 1 pentashih
- 5 santri
- 2 kelas
- attendance dummy
- payment dummy
- hafalan dummy
- MMQ dummy
- konten website dummy

Larangan:

- Jangan gunakan nama asli dari backup.
- Jangan gunakan Nomor Induk Qiroati asli.
- Jangan gunakan email asli.
- Jangan gunakan RFID asli.
- Jangan gunakan asset pribadi.

Catatan: akun Supabase Auth tidak selalu dapat dibuat hanya lewat `seed.sql`. Akun dummy mungkin perlu dibuat melalui script admin lokal atau Edge Function khusus development.

## Gate Sebelum SQL Dibuat

Implementasi SQL baru hanya boleh dimulai setelah:

- urutan migration disetujui;
- model Auth disetujui;
- RLS matrix final;
- kontrak Edge Function final;
- test matrix final;
- rollback strategy tersedia;
- tidak ada keputusan produk terbuka.

## Output Fase 3A

Dokumen pendukung Fase 3A:

- `docs/22-migration-file-sequence.md`
- `docs/23-backend-test-matrix.md`
- `docs/24-edge-function-contracts.md`
- `docs/25-local-staging-production-workflow.md`
- `docs/26-phase-3a-risks-and-gates.md`
