# 22 - Migration File Sequence

## Status

Dokumen ini hanya merancang urutan migration. Belum ada file SQL dibuat dan belum ada SQL dijalankan.

Prinsip utama:

- Migration dipisah kecil dan berurutan.
- Nama file memakai timestamp Supabase, misalnya `YYYYMMDDHHMMSS_deskripsi.sql`.
- Tidak ada data asli dalam migration.
- RLS lama tidak disalin.
- Setiap migration harus bisa diuji sebelum lanjut ke migration berikutnya.

## Ringkasan Urutan

| No | Nama Rencana Migration | Isi Utama |
|---|---|---|
| 01 | `extensions_and_enums` | Extension, enum/domain/check dasar. |
| 02 | `user_profiles_and_roles` | `user_profiles`, role, status akun. |
| 03 | `guru_and_santri` | `guru`, `santri`, `auth_login_aliases`. |
| 04 | `classes_and_memberships` | `classes`, `class_memberships`, mutasi kelas. |
| 05 | `assignments` | assignment guru/pentashih. |
| 06 | `attendance` | absensi RFID dan koreksi. |
| 07 | `payments_and_expenses` | pembayaran, pengeluaran, view status pembayaran. |
| 08 | `hafalan_and_murojaah` | hafalan, progress, murojaah. |
| 09 | `academic_calendar` | kalender akademik. |
| 10 | `mmq` | jadwal, absensi, notulensi MMQ. |
| 11 | `content` | news, announcements, website_content, feedbacks. |
| 12 | `notifications_and_notes` | notifications, santri_notes. |
| 13 | `audit_triggers_updated_at` | audit field, trigger updated_at. |
| 14 | `rls_helper_functions` | helper function RLS. |
| 15 | `rls_policies` | enable RLS dan policy. |
| 16 | `storage_buckets_and_policies` | bucket dan policy Storage. |
| 17 | `indexes_and_constraints` | index tambahan dan constraint final. |
| 18 | `seed_dummy_data` | data dummy fiktif. |

## 01 - Extensions dan Enum

Tujuan:

- Menyiapkan extension dan tipe dasar yang dibutuhkan schema.

Object:

- `pgcrypto` untuk `gen_random_uuid()`.
- Enum/check role: `admin`, `guru`, `santri`, `pentashih`.
- Enum/check status umum jika diputuskan saat implementasi.

Dependency:

- Tidak ada.

Risiko:

- Extension belum tersedia di environment.
- Enum terlalu kaku bila kebutuhan status berubah.

Pengujian:

- Pastikan `gen_random_uuid()` dapat dipanggil.
- Pastikan role valid diterima dan role invalid ditolak.

Rollback/koreksi:

- Drop enum/type yang belum dipakai jika migration gagal di environment kosong.
- Jika sudah dipakai tabel, koreksi lewat migration baru.

## 02 - User Profiles dan Role

Tujuan:

- Membuat profil ringan untuk semua user Auth.

Object:

- `user_profiles`
- constraint role dan status.
- index `role`, `status`, dan unique email bila tidak null.

Dependency:

- `auth.users`.
- Migration 01.

Risiko:

- FK ke `auth.users` harus cocok dengan cara akun dibuat.
- Metadata Auth tidak boleh menjadi satu-satunya sumber role.

Pengujian:

- Insert profil dummy dengan id Auth dummy.
- Role invalid ditolak.
- User tidak boleh punya role kosong.

Rollback/koreksi:

- Environment baru dapat direset.
- Jika sudah ada dependency, buat migration koreksi.

## 03 - Guru dan Santri

Tujuan:

- Membuat profil operasional guru dan santri.
- Menyiapkan mapping login santri.

Object:

- `guru`
- `santri`
- `auth_login_aliases`

Constraint penting:

- `santri.id = auth.users.id`.
- `guru.id = auth.users.id`.
- `santri.nomor_induk_qiroati` unique.
- Nomor Induk Qiroati bertipe `text`, tidak boleh spasi, dan tidak boleh trim berbeda.
- `auth_login_aliases` private, unique `(alias_type, normalized_alias)`.
- Tidak ada kolom `password`.

Dependency:

- Migration 02.

Risiko:

- Nomor Induk lama mungkin tidak konsisten saat migrasi.
- Email internal tidak boleh bocor ke UI.

Pengujian:

- Santri dengan nomor induk duplikat ditolak.
- Nomor induk dengan spasi ditolak.
- Kolom password tidak ada.
- Alias inactive tidak dipakai login.

Rollback/koreksi:

- Koreksi constraint lewat migration baru.
- Data dummy dapat dihapus di environment lokal/staging.

## 04 - Classes dan Class Memberships

Tujuan:

- Membuat kelas aktif dan riwayat perpindahan santri.

Object:

- `classes`
- `class_memberships`
- `class_mutations`
- kolom `santri.current_class_id` jika belum dibuat pada migration 03.

Dependency:

- `guru`
- `santri`

Risiko:

- Membership aktif ganda.
- `santri.current_class_id` tidak sinkron dengan membership aktif.

Pengujian:

- Satu santri hanya punya satu membership aktif.
- Guru kelas dapat ditemukan dari `classes.id_guru`.
- Mutasi kelas menghasilkan riwayat yang dapat diaudit.

Rollback/koreksi:

- Koreksi data membership dummy.
- Buat trigger sinkronisasi pada migration terpisah jika perlu.

## 05 - Assignment Guru dan Pentashih

Tujuan:

- Menentukan scope akses pentashih dan assignment tambahan.

Object:

- `pentashih_class_assignments`
- constraint `scope in ('class','mmq','both')`.

Dependency:

- `guru`
- `classes`
- `mmq_schedule` boleh nullable karena MMQ dibuat migration 10.

Risiko:

- FK ke `mmq_schedule` sebelum tabel MMQ ada.
- Assignment aktif duplikat.

Pengujian:

- Pentashih assignment kelas A tidak otomatis punya akses kelas B.
- Assignment inactive tidak memberi akses.

Rollback/koreksi:

- Jika FK MMQ mengganggu urutan, tambah kolom/FK MMQ pada migration 10.

## 06 - Attendance

Tujuan:

- Menyimpan absensi RFID santri, guru, dan pentashih.

Object:

- `attendance`
- kolom koreksi: `correction_reason`, `corrected_by`.

Dependency:

- `auth.users`
- `classes`

Risiko:

- Duplikasi absensi pada hari/sesi yang sama.
- Koreksi tanpa audit.

Pengujian:

- Unique `(user_id, attendance_date, sesi)` bekerja jika sesi wajib unik.
- Guru hanya dapat koreksi absensi kelasnya setelah RLS aktif.

Rollback/koreksi:

- Constraint unique dapat disesuaikan jika aturan sesi berubah.

## 07 - Payments dan Expenses

Tujuan:

- Menyimpan pembayaran dan pengeluaran.
- Menyediakan view status pembayaran terbatas untuk guru.

Object:

- `payments`
- `expenses`
- `payment_status_summary` sebagai view/materialized view.

Dependency:

- `santri`
- `classes`
- `class_memberships`

Risiko:

- Guru tidak boleh membaca detail pembayaran.
- View status tidak boleh memuat nominal/metode/catatan/transaction_id.

Pengujian:

- Admin bisa membaca detail.
- Santri hanya membaca pembayaran sendiri.
- Guru hanya membaca `Lunas` atau `Belum Lunas` dari kelasnya.
- Guru gagal membaca `payments` langsung.

Rollback/koreksi:

- Drop dan buat ulang view di environment non-production.
- Di production, koreksi view lewat migration baru.

## 08 - Hafalan dan Murojaah

Tujuan:

- Menyimpan item hafalan, progress, submission, dan rekaman.

Object:

- `hafalan_items`
- `hafalan_progress`
- `murojaah_submissions`

Dependency:

- `santri`
- `guru`

Risiko:

- Progress duplikat untuk item yang sama.
- Recording path tidak cocok dengan Storage.

Pengujian:

- Unique `(santri_id, item_id)` berjalan.
- Santri hanya insert submission sendiri setelah RLS aktif.
- Guru hanya review submission kelasnya atau target dirinya.

Rollback/koreksi:

- Koreksi constraint/item mapping lewat migration baru.

## 09 - Kalender Akademik

Tujuan:

- Menyimpan event akademik dan hari libur.

Object:

- `academic_calendar`

Dependency:

- Minimal, hanya Auth untuk audit.

Risiko:

- Event publik dan internal bercampur.

Pengujian:

- Anon hanya membaca event yang ditandai publik bila policy publik dipakai.
- Admin dapat mengelola semua event.

Rollback/koreksi:

- Tambah kolom visibility bila dibutuhkan pada migration koreksi.

## 10 - MMQ

Tujuan:

- Menyimpan jadwal, absensi, dan notulensi MMQ.

Object:

- `mmq_schedule`
- `mmq_attendance`
- `mmq_notulensi`
- FK assignment MMQ jika belum dibuat.

Dependency:

- `guru`
- `pentashih_class_assignments`

Risiko:

- Pentashih mendapat akses lebih luas dari assignment.
- Notulen tidak dibatasi.

Pengujian:

- Pentashih hanya melihat MMQ assignment.
- Guru hanya insert/update absensi dirinya.
- Hanya notulen/admin yang membuat notulensi.

Rollback/koreksi:

- Koreksi policy pada migration RLS.

## 11 - News, Announcements, Website Content, Feedback

Tujuan:

- Menyimpan konten publik dan feedback baru.

Object:

- `website_content`
- `news`
- `announcements`
- `feedbacks`

Dependency:

- `user_profiles` untuk audit.

Risiko:

- Draft terbaca oleh anon.
- Feedback spam.
- Feedback lama tidak boleh dimigrasikan.

Pengujian:

- Anon hanya melihat published/public.
- Admin mengelola seluruh konten.
- Anon hanya INSERT feedback baru, bukan SELECT semua feedback.

Rollback/koreksi:

- Tambah rate limit di Edge Function/form bila spam tinggi.

## 12 - Notifications dan Santri Notes

Tujuan:

- Menyimpan notifikasi user dan catatan santri.

Object:

- `notifications`
- `santri_notes`

Dependency:

- `auth.users`
- `santri`
- `guru`

Risiko:

- Catatan internal terbaca santri.
- Notifikasi user lain terbaca.

Pengujian:

- User hanya membaca notifikasi sendiri.
- Guru hanya membuat catatan untuk santri kelasnya.
- Santri tidak membaca catatan internal.

Rollback/koreksi:

- Tambah kolom visibility atau policy koreksi bila dibutuhkan.

## 13 - Audit Fields, Triggers, Updated At

Tujuan:

- Menstandarkan `created_at`, `updated_at`, `created_by`, `updated_by`, `deleted_at`.

Object:

- trigger `set_updated_at`.
- helper audit setter bila dipakai.
- trigger sinkronisasi ringan bila disetujui.

Dependency:

- Semua tabel inti.

Risiko:

- Trigger terlalu agresif dan mengubah data saat import.
- `updated_by` null saat operasi service-role.

Pengujian:

- UPDATE mengubah `updated_at`.
- Soft delete mengisi `deleted_at` tanpa hard delete.
- Audit tidak mencetak data sensitif.

Rollback/koreksi:

- Disable/drop trigger di environment non-production.
- Di production, migration baru untuk memperbaiki trigger.

## 14 - Helper Function RLS

Tujuan:

- Menyediakan fungsi kecil untuk policy RLS.

Object:

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

Dependency:

- Tabel profil, kelas, membership, assignment.

Risiko:

- Recursion RLS.
- Helper membuka data terlalu luas.

Pengujian:

- Test helper dengan token dummy setiap role.
- Pastikan helper return false untuk anon.
- Pastikan guru A tidak mendapat akses kelas guru B.

Rollback/koreksi:

- Replace function lewat migration baru.

## 15 - RLS Policy

Tujuan:

- Mengaktifkan RLS dan policy semua tabel operasional.

Object:

- `alter table ... enable row level security`
- policy per role dan operasi.

Dependency:

- Migration 14.

Risiko:

- Policy terlalu longgar.
- Policy terlalu ketat sehingga aplikasi tidak berjalan.
- Service-role dipakai sebagai jalan pintas di client.

Pengujian:

- Jalankan test matrix `docs/23`.
- Test SELECT/INSERT/UPDATE/DELETE per role.
- Pastikan anon tidak membaca data sensitif.

Rollback/koreksi:

- Di staging, reset dan ulang.
- Di production, buat migration policy koreksi. Jangan disable RLS global kecuali emergency internal.

## 16 - Storage Bucket dan Storage Policy

Tujuan:

- Membuat bucket dan policy Storage.

Object:

- `avatars`
- `website-assets`
- `murojaah-recordings`
- policy path dan role.

Dependency:

- Helper RLS.
- Tabel `santri`, `guru`, `class_memberships`, `classes`, `pentashih_class_assignments`.

Risiko:

- Path ownership salah.
- Avatar user lain bisa ditimpa.
- Bucket private terbuka.

Pengujian:

- Santri upload avatar sendiri berhasil.
- Santri upload ke folder orang lain gagal.
- Guru upload avatar santri luar kelas gagal.
- Anon gagal membaca private recording.

Rollback/koreksi:

- Koreksi policy Storage lewat migration baru.
- Hapus file dummy di environment test.

## 17 - Index dan Constraint Tambahan

Tujuan:

- Menambah performa dan konsistensi setelah query utama jelas.

Object:

- index FK utama.
- partial unique index untuk membership aktif.
- index status/published.
- constraint format Nomor Induk Qiroati.

Dependency:

- Semua tabel inti.

Risiko:

- Index mahal jika dibuat setelah data besar.
- Constraint gagal saat data migrasi belum bersih.

Pengujian:

- Explain query RLS kritis.
- Insert data invalid harus ditolak.
- Data dummy tetap lolos constraint.

Rollback/koreksi:

- Drop index/constraint di migration koreksi jika terlalu ketat.

## 18 - Seed Data Dummy

Tujuan:

- Menyediakan data fiktif untuk test lokal/staging.

Object:

- `seed.sql`
- data dummy non-pribadi.

Isi:

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

Dependency:

- Semua tabel inti.
- Akun Auth dummy mungkin dibuat dengan script admin lokal, bukan hanya `seed.sql`.

Risiko:

- Tanpa Auth user, FK ke `auth.users` gagal.
- Data dummy menyerupai data asli.

Pengujian:

- Semua role dummy dapat login.
- RLS test berjalan pada data dummy.
- Data dummy tidak mengandung NIK, email, RFID, atau data asli.

Rollback/koreksi:

- Reset database lokal/staging.
- Hapus data dummy lewat script khusus environment non-production.
