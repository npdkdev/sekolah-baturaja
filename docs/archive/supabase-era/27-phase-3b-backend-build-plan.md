# 27 - Phase 3B Backend Build Plan

## Status

Dokumen ini adalah rencana eksekusi rinci untuk Fase 3B: pembuatan source backend Supabase lokal LPQ Al-Fath Maulana.

Tahap ini hanya membuat rencana. Belum membuat folder `supabase/`, belum membuat file SQL, belum menjalankan Supabase CLI, belum menjalankan Docker, belum membuat project Supabase, belum membuat `.env.local`, belum mengubah frontend, belum restore backup, belum deploy, belum push Git, dan belum memakai data asli.

Sumber utama:

- `docs/21-phase-3a-technical-implementation-plan.md`
- `docs/22-migration-file-sequence.md`
- `docs/23-backend-test-matrix.md`
- `docs/24-edge-function-contracts.md`
- `docs/25-local-staging-production-workflow.md`
- `docs/26-phase-3a-risks-and-gates.md`

Koreksi wajib yang mengoverride rencana Fase 3A:

- Jangan membuat foreign key ke `mmq_schedule` sebelum tabel MMQ tersedia.
- Migration assignment awal hanya membuat assignment kelas.
- Assignment MMQ atau foreign key MMQ ditambahkan setelah migration tabel MMQ.
- Data dummy tidak boleh dibuat sebagai migration production.
- Data dummy ditempatkan di `supabase/seed.sql` dan hanya digunakan untuk local/staging.
- Production tidak boleh menjalankan seed dummy.

## 1. Struktur Folder Final

Struktur yang akan dibuat pada implementasi Fase 3B:

```text
supabase/
  config.toml
  migrations/
    0001_extensions_and_types.sql
    0002_user_profiles_and_roles.sql
    0003_guru_santri_and_auth_aliases.sql
    0004_classes_memberships_and_mutations.sql
    0005_class_assignments.sql
    0006_attendance.sql
    0007_payments_expenses_and_payment_status.sql
    0008_hafalan_and_murojaah.sql
    0009_academic_calendar.sql
    0010_mmq_core.sql
    0011_mmq_assignments_extension.sql
    0012_content_news_announcements_feedbacks.sql
    0013_notifications_and_santri_notes.sql
    0014_audit_triggers_and_updated_at.sql
    0015_rls_helper_functions.sql
    0016_rls_policies.sql
    0017_storage_buckets_and_policies.sql
    0018_indexes_and_final_constraints.sql
  functions/
    _shared/
      auth.ts
      cors.ts
      rateLimit.ts
      response.ts
      roles.ts
      safeLogger.ts
      supabaseAdmin.ts
      validation.ts
    signin-with-nomor-induk/
      index.ts
    manage-user/
      index.ts
    reset-user-password/
      index.ts
    generate-signed-upload-url/
      index.ts
    export-sensitive-report/
      index.ts
    import-master-data/
      index.ts
  seed.sql
  tests/
    fixtures/
    functions/
    rls/
    storage/
scripts/
  check-production-guard.ps1
  validate-migration-order.ps1
  validate-no-secrets.ps1
  validate-seed-dummy-only.ps1
docs/
```

Fungsi folder:

- `supabase/config.toml`: konfigurasi Supabase lokal/staging tanpa secret production.
- `supabase/migrations/`: schema, helper, RLS, Storage policy, index, dan constraint. Tidak berisi seed dummy.
- `supabase/functions/`: Edge Function source.
- `supabase/functions/_shared/`: helper TypeScript bersama untuk response, auth, role, rate limit, validasi, logging aman, dan Supabase admin client.
- `supabase/seed.sql`: data dummy fiktif untuk local/staging saja.
- `supabase/tests/`: skeleton test Auth/RLS/Storage/Edge Function.
- `scripts/`: script validasi keamanan dan urutan file.
- `docs/`: dokumentasi rencana dan hasil.

## 2. Daftar File Migration

Nama file memakai prefix numerik stabil agar mudah direview. Jika nanti tim memilih format timestamp Supabase, isi dan urutannya tetap sama.

Tidak ada migration untuk data dummy.

| Urutan | File | Isi Utama |
|---|---|---|
| 0001 | `0001_extensions_and_types.sql` | Extension, enum/domain/check dasar. |
| 0002 | `0002_user_profiles_and_roles.sql` | `user_profiles`, role, status akun. |
| 0003 | `0003_guru_santri_and_auth_aliases.sql` | `guru`, `santri`, `auth_login_aliases`. |
| 0004 | `0004_classes_memberships_and_mutations.sql` | `classes`, `class_memberships`, `class_mutations`. |
| 0005 | `0005_class_assignments.sql` | Assignment kelas/pentashih berbasis kelas saja. |
| 0006 | `0006_attendance.sql` | Absensi RFID dan koreksi. |
| 0007 | `0007_payments_expenses_and_payment_status.sql` | `payments`, `expenses`, `payment_status_summary`. |
| 0008 | `0008_hafalan_and_murojaah.sql` | Hafalan, progress, murojaah. |
| 0009 | `0009_academic_calendar.sql` | Kalender akademik. |
| 0010 | `0010_mmq_core.sql` | `mmq_schedule`, `mmq_attendance`, `mmq_notulensi`. |
| 0011 | `0011_mmq_assignments_extension.sql` | Kolom/FK/scope assignment MMQ setelah tabel MMQ tersedia. |
| 0012 | `0012_content_news_announcements_feedbacks.sql` | Konten website, berita, pengumuman, feedback baru. |
| 0013 | `0013_notifications_and_santri_notes.sql` | Notifikasi dan catatan santri. |
| 0014 | `0014_audit_triggers_and_updated_at.sql` | Audit fields, trigger `updated_at`, soft delete support. |
| 0015 | `0015_rls_helper_functions.sql` | Helper function RLS. |
| 0016 | `0016_rls_policies.sql` | Enable RLS dan policy. |
| 0017 | `0017_storage_buckets_and_policies.sql` | Bucket dan Storage policy. |
| 0018 | `0018_indexes_and_final_constraints.sql` | Index dan constraint tambahan. |

## 3. Isi dan Dependency Setiap Migration

### `0001_extensions_and_types.sql`

Tujuan:

- Menyiapkan extension dan tipe dasar.

Isi:

- `pgcrypto` untuk `gen_random_uuid()`.
- Tipe/check role final: `admin`, `guru`, `santri`, `pentashih`.
- Tipe/check status umum jika dibutuhkan oleh schema.

Dependency:

- Tidak ada.

Risiko:

- Extension tidak tersedia pada environment tertentu.

Pengujian:

- `gen_random_uuid()` dapat dipanggil.
- Role valid diterima dan role invalid ditolak.

Rollback/koreksi:

- Di local/staging kosong, reset database.
- Jika sudah terlanjur diterapkan, buat migration koreksi.

### `0002_user_profiles_and_roles.sql`

Tujuan:

- Membuat profil ringan semua user Supabase Auth.

Isi:

- Tabel `user_profiles`.
- FK `id` ke `auth.users(id)`.
- Role, display name, email, phone, status, audit field.
- Index role/status.

Dependency:

- `auth.users`.
- `0001_extensions_and_types.sql`.

Risiko:

- Role metadata Auth tidak sinkron dengan `user_profiles.role`.

Pengujian:

- Insert profil dummy dengan role valid.
- Role invalid ditolak.
- User tidak punya akses sendiri sebelum RLS dibuat.

Rollback/koreksi:

- Reset local/staging atau migration koreksi.

### `0003_guru_santri_and_auth_aliases.sql`

Tujuan:

- Membuat profil operasional guru, santri, dan mapping login santri.

Isi:

- `guru`.
- `santri`.
- `auth_login_aliases`.
- `santri.id` dan `guru.id` sama dengan `auth.users.id`.
- Nomor Induk Qiroati bertipe `text`, unik, konsisten, tanpa spasi.
- `auth_login_aliases` private untuk mapping Nomor Induk Qiroati ke identifier Auth internal.
- Tidak ada kolom password.

Dependency:

- `0002_user_profiles_and_roles.sql`.

Risiko:

- Nomor Induk Qiroati tidak konsisten saat migrasi data asli.
- Email internal bocor jika RLS/Edge Function salah.

Pengujian:

- Nomor induk duplikat ditolak.
- Nomor induk dengan spasi ditolak.
- Tidak ada kolom `password` di `santri` atau `guru`.

Rollback/koreksi:

- Migration koreksi untuk constraint.
- Data dummy dihapus/reset pada local/staging.

### `0004_classes_memberships_and_mutations.sql`

Tujuan:

- Membuat struktur kelas aktif, riwayat kelas, dan mutasi kelas.

Isi:

- `classes`.
- `class_memberships`.
- `class_mutations`.
- Relasi guru kelas melalui `classes.id_guru`.
- Relasi santri ke kelas melalui `class_memberships`.
- `santri.current_class_id` jika belum dibuat di migration sebelumnya.

Dependency:

- `guru`.
- `santri`.

Risiko:

- Membership aktif ganda.
- `santri.current_class_id` tidak sinkron dengan membership aktif.

Pengujian:

- Satu santri hanya punya satu membership aktif.
- Guru kelas dapat ditemukan dari `classes.id_guru`.

Rollback/koreksi:

- Reset local/staging atau migration koreksi untuk constraint/sinkronisasi.

### `0005_class_assignments.sql`

Tujuan:

- Membuat assignment awal untuk pentashih berbasis kelas.

Isi:

- `pentashih_class_assignments` atau nama final yang setara.
- Kolom `pentashih_id`.
- Kolom `class_id`.
- Kolom status aktif, tanggal mulai, tanggal selesai, audit field.
- Scope awal hanya kelas, misalnya `scope = 'class'`.

Dependency:

- `guru`.
- `classes`.

Risiko:

- Assignment memberi akses kelas terlalu luas.

Pengujian:

- Pentashih assignment kelas A tidak mendapat akses kelas B.
- Assignment inactive tidak memberi akses.

Rollback/koreksi:

- Migration koreksi untuk constraint/unique aktif.

Catatan wajib:

- Jangan membuat kolom `mmq_schedule_id` di migration ini.
- Jangan membuat foreign key ke `mmq_schedule` di migration ini.
- Jangan memakai scope `mmq` sebelum migration MMQ tersedia.

### `0006_attendance.sql`

Tujuan:

- Menyimpan absensi RFID santri, guru, dan pentashih.

Isi:

- `attendance`.
- Kolom user, role, tanggal, waktu, timestamp, class, sesi, status, source.
- Kolom koreksi `correction_reason` dan `corrected_by`.

Dependency:

- `auth.users`.
- `classes`.

Risiko:

- Duplikasi absensi per hari/sesi.
- Koreksi tanpa audit.

Pengujian:

- Constraint duplikasi berjalan jika diterapkan.
- Koreksi menyimpan alasan dan user korektor.

Rollback/koreksi:

- Migration koreksi untuk aturan unique sesuai kebutuhan operasional.

### `0007_payments_expenses_and_payment_status.sql`

Tujuan:

- Menyimpan pembayaran, pengeluaran, dan view status pembayaran aman untuk guru.

Isi:

- `payments`.
- `expenses`.
- `payment_status_summary`.

Dependency:

- `santri`.
- `classes`.
- `class_memberships`.

Risiko:

- Guru melihat detail pembayaran yang tidak boleh dibuka.

Pengujian:

- `payment_status_summary` hanya memuat `Lunas` atau `Belum Lunas`.
- View tidak memuat nominal, metode, catatan, `transaction_id`, atau detail keuangan lain.
- Guru gagal membaca detail `payments` setelah RLS aktif.

Rollback/koreksi:

- Drop/recreate view pada local/staging.
- Migration koreksi pada environment yang sudah stabil.

### `0008_hafalan_and_murojaah.sql`

Tujuan:

- Menyimpan item hafalan, progress hafalan, dan submission murojaah.

Isi:

- `hafalan_items`.
- `hafalan_progress`.
- `murojaah_submissions`.

Dependency:

- `santri`.
- `guru`.

Risiko:

- Progress duplikat per item.
- Path rekaman tidak cocok dengan Storage.

Pengujian:

- Unique progress per santri/item berjalan.
- Submission santri punya relasi santri valid.

Rollback/koreksi:

- Migration koreksi untuk constraint dan field recording.

### `0009_academic_calendar.sql`

Tujuan:

- Menyimpan kalender akademik dan hari libur.

Isi:

- `academic_calendar`.
- Kolom date, title, description, event type, holiday/public flag, audit field.

Dependency:

- `user_profiles` untuk audit.

Risiko:

- Event internal terbaca publik jika visibility tidak jelas.

Pengujian:

- Event publik dan internal dapat dibedakan.
- Admin dapat mengelola semua event setelah RLS aktif.

Rollback/koreksi:

- Migration koreksi untuk field visibility/status.

### `0010_mmq_core.sql`

Tujuan:

- Membuat tabel inti MMQ.

Isi:

- `mmq_schedule`.
- `mmq_attendance`.
- `mmq_notulensi`.

Dependency:

- `guru`.
- `user_profiles`.

Risiko:

- Notulen tidak terbatas pada user yang berwenang.
- Relasi assignment MMQ belum aktif sampai migration berikutnya.

Pengujian:

- Jadwal MMQ dapat dibuat.
- Absensi MMQ terkait guru valid.
- Notulensi terkait jadwal valid.

Rollback/koreksi:

- Reset local/staging atau migration koreksi.

### `0011_mmq_assignments_extension.sql`

Tujuan:

- Menambahkan kemampuan assignment MMQ setelah tabel MMQ tersedia.

Isi:

- Tambah `mmq_schedule_id` nullable pada tabel assignment jika desain final memakai satu tabel assignment.
- Tambah FK ke `mmq_schedule(id)`.
- Perluas scope assignment menjadi `class`, `mmq`, atau `both` jika dibutuhkan.
- Tambah unique/index untuk kombinasi pentashih, class, schedule, dan status aktif.

Dependency:

- `0005_class_assignments.sql`.
- `0010_mmq_core.sql`.

Risiko:

- Assignment MMQ membuka akses di luar jadwal yang ditugaskan.
- Constraint scope terlalu longgar.

Pengujian:

- Pentashih assignment MMQ hanya melihat jadwal terkait.
- Pentashih tanpa assignment MMQ gagal melihat data MMQ terbatas.
- FK ke `mmq_schedule` valid karena tabel sudah tersedia.

Rollback/koreksi:

- Migration koreksi untuk scope, FK, atau index.

Catatan wajib:

- Ini satu-satunya migration yang boleh menambahkan FK assignment ke `mmq_schedule`.

### `0012_content_news_announcements_feedbacks.sql`

Tujuan:

- Menyimpan konten website dan feedback baru.

Isi:

- `website_content`.
- `news`.
- `announcements`.
- `feedbacks`.

Dependency:

- `user_profiles` untuk audit.

Risiko:

- Draft atau konten internal terbaca anon.
- Feedback spam.
- Feedback lama tidak boleh ikut migrasi.

Pengujian:

- Anon hanya membaca konten published/public.
- Anon hanya dapat insert feedback baru, bukan membaca daftar feedback.

Rollback/koreksi:

- Migration koreksi untuk status/visibility.

### `0013_notifications_and_santri_notes.sql`

Tujuan:

- Menyimpan notifikasi user dan catatan santri.

Isi:

- `notifications`.
- `santri_notes`.

Dependency:

- `auth.users`.
- `santri`.
- `guru`.

Risiko:

- Catatan internal terbaca santri.
- Notifikasi user lain terbaca.

Pengujian:

- User hanya membaca notifikasi sendiri.
- Santri tidak membaca catatan internal.

Rollback/koreksi:

- Migration koreksi untuk visibility/policy.

### `0014_audit_triggers_and_updated_at.sql`

Tujuan:

- Menstandarkan audit field dan trigger `updated_at`.

Isi:

- Function `set_updated_at`.
- Trigger updated_at untuk tabel inti.
- Pola soft delete permanen melalui `deleted_at`.

Dependency:

- Semua tabel inti.

Risiko:

- Trigger mengganggu import data.
- Audit user null pada operasi service-role.

Pengujian:

- UPDATE mengubah `updated_at`.
- Soft delete tidak melakukan hard delete.

Rollback/koreksi:

- Disable/drop trigger pada local/staging.
- Migration koreksi di environment stabil.

### `0015_rls_helper_functions.sql`

Tujuan:

- Membuat helper yang aman untuk RLS.

Isi:

- `current_user_role()`.
- `is_admin()`.
- `is_guru()`.
- `is_santri()`.
- `is_pentashih()`.
- `guru_has_class_access(class_id uuid)`.
- `guru_has_santri_access(santri_id uuid)`.
- `pentashih_has_class_access(class_id uuid)`.
- `pentashih_has_santri_access(santri_id uuid)`.
- `user_owns_santri_record(santri_id uuid)`.

Dependency:

- `user_profiles`.
- `classes`.
- `class_memberships`.
- `pentashih_class_assignments`.
- MMQ assignment extension jika helper MMQ dibuat.

Risiko:

- Recursion RLS.
- Helper terlalu luas.

Pengujian:

- Helper return benar untuk admin, guru, santri, pentashih, dan anon.
- Guru A tidak punya akses santri kelas B.
- Pentashih hanya punya akses assignment.

Rollback/koreksi:

- Replace function lewat migration koreksi.

### `0016_rls_policies.sql`

Tujuan:

- Mengaktifkan RLS dan membuat policy semua tabel operasional.

Isi:

- `alter table ... enable row level security`.
- Policy anon untuk konten publik.
- Policy admin full access.
- Policy guru kelas.
- Policy santri sendiri.
- Policy pentashih assignment.
- Policy pembayaran guru hanya via `payment_status_summary`.

Dependency:

- `0015_rls_helper_functions.sql`.

Risiko:

- Policy terlalu longgar atau terlalu ketat.

Pengujian:

- Jalankan test matrix RLS dari `docs/23`.
- Guru gagal SELECT detail `payments`.
- Santri gagal membaca data santri lain.
- Anon gagal membaca data sensitif.

Rollback/koreksi:

- Local/staging reset.
- Migration policy koreksi untuk environment stabil.

### `0017_storage_buckets_and_policies.sql`

Tujuan:

- Membuat bucket dan Storage policy.

Isi:

- Bucket `avatars`.
- Bucket `website-assets`.
- Bucket `murojaah-recordings`.
- Policy path ownership.
- Policy admin/guru/santri/pentashih sesuai scope.

Dependency:

- Helper RLS.
- `santri`.
- `guru`.
- `classes`.
- `class_memberships`.
- `pentashih_class_assignments`.

Risiko:

- User dapat menulis file orang lain.
- Bucket private terbuka.

Pengujian:

- Santri hanya upload `avatars/santri/<auth.uid()>/profile.webp`.
- Guru hanya mengelola avatar santri kelasnya.
- `website-assets` public read dan admin write.
- `murojaah-recordings` private.

Rollback/koreksi:

- Migration koreksi policy Storage.
- Hapus file dummy pada local/staging.

### `0018_indexes_and_final_constraints.sql`

Tujuan:

- Menambahkan index dan constraint tambahan setelah struktur stabil.

Isi:

- Index FK utama.
- Partial unique index membership aktif.
- Index status/published.
- Constraint format Nomor Induk Qiroati.
- Index query RLS kritis.

Dependency:

- Semua tabel inti.

Risiko:

- Constraint terlalu ketat untuk data migrasi lama.
- Index mahal bila dibuat setelah data besar.

Pengujian:

- Insert data invalid ditolak.
- Query RLS utama punya index yang relevan.

Rollback/koreksi:

- Migration koreksi untuk drop/ubah index atau constraint.

## 4. File Edge Function yang Akan Dibuat

### `supabase/functions/signin-with-nomor-induk/index.ts`

Tanggung jawab:

- Menerima Nomor Induk Qiroati dan password.
- Validasi dan normalisasi nomor induk tanpa menghilangkan angka nol depan.
- Membaca `auth_login_aliases` dengan service-role.
- Login ke Supabase Auth memakai identifier internal.
- Mengembalikan session Supabase Auth resmi.
- Tidak membuat JWT custom.
- Tidak mencetak password, token, atau email internal penuh ke log.

### `supabase/functions/manage-user/index.ts`

Tanggung jawab:

- Admin membuat/mengubah/menonaktifkan akun guru, santri, dan pentashih.
- Membuat password awal santri melalui Supabase Auth.
- Membuat/memperbarui `user_profiles`, `guru`, `santri`, dan `auth_login_aliases`.
- Menolak pemanggil non-admin.

### `supabase/functions/reset-user-password/index.ts`

Tanggung jawab:

- Admin reset password user.
- Menolak role non-admin.
- Tidak mencetak password baru ke log.
- Menyiapkan jalur self-service email hanya jika SMTP nanti siap.

### `supabase/functions/generate-signed-upload-url/index.ts`

Tanggung jawab:

- Memberi signed URL jangka pendek untuk upload aman.
- Validasi bucket, path, MIME, ekstensi, ukuran, dan ownership.
- Avatar santri wajib path `santri/<auth.uid()>/profile.webp` untuk pemilik.
- Guru hanya boleh request upload avatar santri kelasnya.
- Tidak mencetak signed URL penuh ke log.

### `supabase/functions/export-sensitive-report/index.ts`

Status:

- Opsional dan guarded.

Tanggung jawab:

- Export laporan sensitif jika RLS/client biasa tidak cukup aman.
- Admin boleh laporan keuangan penuh.
- Guru tidak boleh mendapat detail nominal/metode/catatan pembayaran.
- Output tidak disimpan public.

### `supabase/functions/import-master-data/index.ts`

Status:

- Opsional dan guarded.

Tanggung jawab:

- Import master data secara idempotent jika fase migrasi membutuhkan jalur server-side.
- Tidak membaca database produksi lama langsung.
- Tidak mencetak data pribadi ke log.
- Menolak password lama dan feedback lama.

## 5. Shared Helper Edge Function

### `supabase/functions/_shared/cors.ts`

- Header CORS standar.
- Allow origin dikonfigurasi lewat environment server.
- Tidak memakai wildcard production kecuali diputuskan aman.

### `supabase/functions/_shared/response.ts`

- Format response sukses dan error.
- Error auth generik untuk mencegah enumeration.
- Tidak membocorkan stack trace ke client.

### `supabase/functions/_shared/auth.ts`

- Membaca Authorization header.
- Membuat Supabase client dengan anon key untuk session user.
- Mengambil user aktif.
- Menolak session invalid.

### `supabase/functions/_shared/roles.ts`

- Membaca role dari `user_profiles`.
- Helper `requireAdmin`.
- Helper scope guru/santri/pentashih untuk function.

### `supabase/functions/_shared/rateLimit.ts`

- Helper rate limit sederhana.
- Digunakan terutama untuk `signin-with-nomor-induk`.
- Key rate limit memakai IP hash dan nomor induk termasking.

### `supabase/functions/_shared/supabaseAdmin.ts`

- Membuat client service-role untuk server only.
- Validasi env server tersedia.
- Tidak pernah mengembalikan key ke response.

### `supabase/functions/_shared/validation.ts`

- Validasi Nomor Induk Qiroati.
- Validasi role target.
- Validasi MIME, ekstensi, ukuran file.
- Validasi path Storage.
- Validasi input laporan/export.

### `supabase/functions/_shared/safeLogger.ts`

- Logging aman berbasis request id.
- Masking nomor induk.
- Tidak log password, token, service-role key, signed URL penuh, atau email internal penuh.

## 6. Strategi Seed Dummy

File:

- `supabase/seed.sql`

Prinsip:

- Hanya untuk local/staging.
- Tidak boleh dijalankan di production.
- Tidak menjadi migration.
- Tidak masuk `supabase/migrations/`.
- Hanya memakai data fiktif.
- Tidak memakai nama, nomor induk, email, RFID, alamat, foto, atau data lain dari backup.

Isi dummy yang direncanakan:

- 1 admin.
- 2 guru.
- 1 pentashih.
- 5 santri.
- 2 kelas.
- Membership kelas.
- Attendance dummy.
- Payment dummy.
- Hafalan dummy.
- MMQ dummy.
- Konten website dummy.

Catatan Auth:

- Akun Supabase Auth dummy tidak selalu dapat dibuat hanya lewat `seed.sql`.
- Jika `seed.sql` tidak cukup, implementasi nanti menambahkan script local/admin helper untuk membuat Auth user dummy.
- Script tersebut tetap hanya untuk local/staging dan tidak boleh memakai data asli.

Guard production:

- `scripts/check-production-guard.ps1` harus mencegah seed dummy dijalankan ke production.
- Dokumentasi command production tidak boleh memuat `supabase db reset` dengan seed dummy.

## 7. Test Skeleton yang Akan Dibuat

### `supabase/tests/fixtures/`

Isi:

- Fixture user dummy.
- Fixture role.
- Fixture kelas dan membership.
- Fixture file metadata dummy.

Larangan:

- Tidak ada data asli.
- Tidak ada password production.

### `supabase/tests/rls/`

Rencana test:

- Admin bisa mengelola data inti.
- Guru hanya melihat santri kelasnya.
- Guru gagal melihat santri luar kelas.
- Santri hanya melihat data sendiri.
- Pentashih hanya melihat assignment.
- Guru gagal SELECT detail `payments`.
- Guru hanya melihat `payment_status_summary`.
- Anon gagal membaca data sensitif.

### `supabase/tests/storage/`

Rencana test:

- Santri upload avatar sendiri berhasil.
- Santri upload avatar orang lain gagal.
- Guru upload avatar santri kelasnya berhasil.
- Guru upload avatar santri luar kelas gagal.
- `website-assets` public read dan admin write.
- `murojaah-recordings` private.
- MIME/ekstensi/ukuran invalid ditolak.

### `supabase/tests/functions/`

Rencana test:

- `signin-with-nomor-induk` berhasil untuk nomor/password benar.
- Password salah dan nomor tidak ada menghasilkan error generik.
- Rate limit berjalan.
- `manage-user` hanya admin.
- `reset-user-password` tidak log password.
- `generate-signed-upload-url` menolak path orang lain.
- Function opsional guarded saat belum diaktifkan.

### Test keamanan tambahan

- Scan log test tidak mengandung password.
- Scan source tidak mengandung service-role key.
- Scan seed tidak mengandung data asli yang diketahui.
- Scan migration memastikan tidak ada `seed_dummy_data.sql`.
- Scan migration memastikan `mmq_schedule` tidak direferensikan sebelum `0010_mmq_core.sql`.

## 8. Urutan Implementasi Fase 3B

Urutan kerja saat implementasi backend lokal nanti:

1. Buat struktur folder `supabase/`, `supabase/functions/`, `supabase/tests/`, dan `scripts/`.
2. Buat `supabase/config.toml` minimal untuk local.
3. Buat migration `0001` sampai `0004` untuk identity, guru/santri, dan kelas.
4. Buat `0005_class_assignments.sql` hanya untuk assignment kelas.
5. Buat `0006` sampai `0009` untuk attendance, finance, hafalan/murojaah, dan kalender.
6. Buat `0010_mmq_core.sql` untuk tabel MMQ.
7. Buat `0011_mmq_assignments_extension.sql` untuk menambah assignment MMQ/FK MMQ.
8. Buat `0012` sampai `0014` untuk konten, notifikasi/catatan, dan audit trigger.
9. Buat `0015_rls_helper_functions.sql`.
10. Buat `0016_rls_policies.sql`.
11. Buat `0017_storage_buckets_and_policies.sql`.
12. Buat `0018_indexes_and_final_constraints.sql`.
13. Buat Edge Function source dan shared helper.
14. Buat `supabase/seed.sql` dummy local/staging.
15. Buat skeleton test.
16. Buat script validasi.
17. Jalankan static validation.
18. Baru jalankan Supabase CLI/test pada tahap eksekusi yang disetujui.

## 9. Command yang Nanti Akan Dijalankan

Command ini hanya dicatat untuk fase implementasi berikutnya. Tidak dijalankan saat membuat dokumen rencana ini.

Local setup:

```powershell
supabase start
supabase db reset
```

Edge Function local:

```powershell
supabase functions serve signin-with-nomor-induk
supabase functions serve manage-user
supabase functions serve reset-user-password
supabase functions serve generate-signed-upload-url
```

Test:

```powershell
supabase test db
```

Jika runner test berbeda, command final ditentukan saat implementasi setelah melihat dukungan Supabase CLI lokal.

Script validasi:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/validate-no-secrets.ps1
powershell -ExecutionPolicy Bypass -File scripts/validate-migration-order.ps1
powershell -ExecutionPolicy Bypass -File scripts/validate-seed-dummy-only.ps1
powershell -ExecutionPolicy Bypass -File scripts/check-production-guard.ps1
```

Static scan yang wajib:

```powershell
rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY|password|mmq_schedule|seed_dummy_data" supabase scripts docs
```

Catatan:

- Scan `password` harus dibaca hati-hati karena istilah password boleh muncul pada dokumentasi/validasi, tetapi tidak boleh ada password nyata.
- Scan `mmq_schedule` harus memastikan referensi sebelum migration `0010` tidak ada.

## 10. File yang Tidak Boleh Disentuh

Selama implementasi Fase 3B nanti, file dan area berikut tidak boleh disentuh kecuali ada persetujuan eksplisit baru:

- `src/`
- frontend runtime lain.
- `.env.local`
- `.env`
- `.env.*`
- `_private_reference/`
- file backup database lokal seperti `*.backup` dan `*.dump`
- database produksi lama
- project Supabase lama
- remote Git/GitHub
- file migration yang sudah diterapkan ke staging/production nanti

Pada tahap pembuatan dokumen ini, hanya file `docs/27-phase-3b-backend-build-plan.md` yang dibuat.

## 11. Checklist Keamanan

Checklist sebelum backend lokal Fase 3B dianggap aman untuk diuji:

- [ ] Tidak ada service-role key di frontend.
- [ ] Tidak ada service-role key di repository.
- [ ] Service-role hanya digunakan di Edge Function server.
- [ ] Tidak ada data asli di seed, test, docs, atau log.
- [ ] Tidak ada password plaintext di tabel aplikasi.
- [ ] Tidak ada password awal dummy yang menyerupai pola production.
- [ ] Tidak ada FK ke `mmq_schedule` sebelum `0010_mmq_core.sql`.
- [ ] `0005_class_assignments.sql` hanya assignment kelas.
- [ ] `0011_mmq_assignments_extension.sql` baru menambahkan assignment/FK MMQ.
- [ ] Tidak ada `seed_dummy_data.sql` di `supabase/migrations/`.
- [ ] `supabase/seed.sql` hanya untuk local/staging.
- [ ] Production tidak menjalankan seed dummy.
- [ ] Guru hanya melihat status pembayaran `Lunas` atau `Belum Lunas`.
- [ ] Guru tidak melihat nominal, metode pembayaran, catatan transaksi, atau `transaction_id`.
- [ ] Storage avatar santri dibatasi ke `santri/<auth.uid()>/profile.webp`.
- [ ] Santri tidak bisa upload avatar santri lain.
- [ ] Guru hanya bisa mengelola avatar santri kelasnya.
- [ ] Edge Function tidak mencetak password, token, internal email penuh, service-role key, atau signed URL penuh.
- [ ] Error login santri tetap generik.
- [ ] Tidak ada JWT custom.
- [ ] Backup lama tidak dibaca untuk membuat seed.
- [ ] Tidak ada deploy.
- [ ] Tidak ada push Git.

## 12. Kriteria Selesai Fase 3B

Fase 3B implementasi backend lokal nanti dianggap selesai jika:

- Struktur folder `supabase/`, `supabase/functions/`, `supabase/tests/`, dan `scripts/` dibuat sesuai rencana.
- Semua migration `0001` sampai `0018` tersedia.
- Setiap migration kecil, berurutan, dan dependency-nya benar.
- Tidak ada FK ke `mmq_schedule` sebelum tabel MMQ tersedia.
- Assignment kelas dan assignment MMQ dipisah sesuai migration `0005` dan `0011`.
- Data dummy hanya berada di `supabase/seed.sql`.
- Tidak ada seed dummy sebagai migration production.
- Production guard mencegah seed dummy dijalankan di production.
- Edge Function inti tersedia: `signin-with-nomor-induk`, `manage-user`, `reset-user-password`, `generate-signed-upload-url`.
- Function opsional `export-sensitive-report` dan `import-master-data` tersedia sebagai guarded/optional jika dibuat.
- Shared helper Edge Function tersedia dan tidak membocorkan secret.
- Test skeleton mencakup Auth, RLS, Storage, Edge Function, seed safety, dan production guard.
- Script validasi tersedia.
- Static scan secret dan data dummy lulus.
- Tidak ada perubahan frontend.
- Tidak ada `.env.local` dibuat.
- Tidak ada backup direstore.
- Tidak ada data asli dipakai.
- Tidak ada deployment.
- Tidak ada push Git.

## Rekomendasi Setelah Dokumen Ini Disetujui

Langkah berikutnya adalah implementasi Fase 3B secara lokal dengan urutan paling aman:

1. Buat struktur folder dan file kosong/skeleton.
2. Isi migration secara bertahap dari `0001` sampai `0018`.
3. Buat helper dan Edge Function setelah schema inti jelas.
4. Buat seed dummy dan test skeleton.
5. Jalankan validasi statis sebelum menjalankan Supabase CLI.
6. Baru jalankan Supabase lokal dan test setelah user menyetujui eksekusi teknis.
