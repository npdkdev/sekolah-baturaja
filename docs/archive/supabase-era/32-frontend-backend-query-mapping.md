# 32 - Frontend Backend Query Mapping

## Status

Dokumen ini memetakan pemakaian backend dari frontend saat ini ke backend Supabase lokal Fase 3B.

Sumber audit:

- scan `.from(` pada `src/`;
- scan `.rpc(` pada `src/`;
- scan `functions.invoke(` pada `src/`;
- scan `storage.from(` pada `src/`;
- dokumen backend Fase 2 dan Fase 3;
- hasil runtime lokal Fase 3B.

Dokumen ini tidak mengubah source frontend.

## Ringkasan Object Backend Lokal

Object inti yang tersedia atau dirancang pada backend lokal:

- Auth/profile: `user_profiles`, `auth_login_aliases`, `guru`, `santri`
- Kelas: `classes`, `class_memberships`, `class_mutations`, `pentashih_class_assignments`
- Absensi: `attendance`
- Keuangan: `payments`, `expenses`, `payment_status_summary`
- Hafalan/murojaah: `hafalan_items`, `hafalan_progress`, `murojaah_submissions`
- Kalender: `academic_calendar`
- MMQ: `mmq_schedule`, `mmq_attendance`, `mmq_notulensi`
- Konten: `website_content`, `news`, `announcements`, `feedbacks`
- Notifikasi/catatan: `notifications`, `santri_notes`, `jilid_history`
- Storage: `avatars`, `website-assets`, `murojaah-recordings`
- Edge Function: `signin-with-nomor-induk`, `manage-user`, `reset-user-password`, `generate-signed-upload-url`

## Mapping Auth dan Role

| Fitur | File frontend | Object sekarang | Target backend lokal | Status | Perubahan Fase 4B |
|---|---|---|---|---|---|
| Login email admin/guru | `src/contexts/SupabaseAuthContext.jsx` | `supabase.auth.signInWithPassword` | Supabase Auth resmi | Cocok sebagian | Tetap pakai Auth, lalu load `user_profiles` untuk role. |
| Login santri | `src/contexts/SupabaseAuthContext.jsx` | RPC `signin_with_username` | Edge Function `signin-with-nomor-induk` | Harus diganti | Kirim `nomor_induk_qiroati` dan password ke Edge Function, lalu `setSession` dari session resmi. |
| Role user | `src/contexts/SupabaseAuthContext.jsx` | `user_metadata`, `app_metadata`, email contains admin | `user_profiles.role` | Harus diganti | Setelah session ada, query `user_profiles` by `auth.uid()`. |
| Route protected | `src/components/ProtectedRoute.jsx` | Cek user saja | Cek user + role allowlist | Harus diperluas | Tambah prop role atau route wrapper per role. |
| Dashboard pentashih | `src/pages/DashboardPage.jsx` | `guru.roles` berisi `Pentashih` | `user_profiles.role = pentashih` | Harus diganti | Pentashih menjadi role top-level. `guru.roles` hanya fallback transisi bila perlu. |

## Mapping Public Website

| Fitur | File frontend | Object sekarang | Target backend lokal | Status | Perubahan Fase 4B |
|---|---|---|---|---|---|
| Logo global | `App.jsx`, `Navbar.jsx`, `LoginPage.jsx` | `website_content` key `logoUrl` | `website_content` | Cocok | Tetap fallback `/logo.png` bila kosong. |
| Home stats | `HomePage.jsx` | `santri`, `guru`, `website_content`, `feedbacks` | Sama | Cocok sebagian | Pastikan anon hanya membaca data agregat yang diizinkan RLS. |
| Feedback publik | `HomePage.jsx` | insert `feedbacks` | `feedbacks` | Cocok | Anon insert boleh, anon tidak boleh membaca daftar. |
| Berita | `NewsPage.jsx`, `NewsDetailPage.jsx` | `website_content` key `news` | `news` | Harus diganti | Query `news` published, detail by id/slug. |
| Pengumuman | `AnnouncementPage.jsx`, `AnnouncementDetailPage.jsx` | `website_content` | `announcements` | Harus diganti | Query `announcements` published, detail by id/slug. |
| Profil/fasilitas/parenting/galeri/video | public pages terkait | `website_content` | `website_content` | Cocok sebagian | Tetap untuk konten global, bukan berita/pengumuman. |
| Status pembayaran public | `PaymentStatusPage.jsx` | `payments` | Perlu desain ulang | Berisiko | Hindari expose detail pembayaran via public route tanpa token/scope aman. |

## Mapping Admin Dashboard

| Fitur | File frontend | Object sekarang | Target backend lokal | Status | Perubahan Fase 4B |
|---|---|---|---|---|---|
| Statistik admin | `AdminDashboard.jsx` | `santri`, `payments`, `expenses` | Sama | Cocok untuk admin | Pastikan hanya role admin bisa mount. |
| Data santri TPQ/dewasa | `SantriManagement.jsx`, `SantriDewasaManagement.jsx` | `santri`, `classes`, `website_content`, `guru`, Storage `avatars` | `santri`, `classes`, `class_memberships`, `website_content`, `guru`, `avatars` | Perlu adapter | Ganti mapping kelas dari `id_kelas` ke `current_class_id`/membership. |
| Data guru | `GuruManagement.jsx` | `guru`, Storage `avatars`, Edge `manage-user` | `guru`, `user_profiles`, `manage-user`, `avatars` | Perlu kontrak baru | Sesuaikan payload `manage-user` dengan kontrak Fase 3B. |
| Kelas | `ClassManagement.jsx`, `AdultClassManagement.jsx` | `classes`, `guru`, `santri`, `attendance`, `class_mutations`, `jilid_history` | Sama + `class_memberships` | Perlu adapter | Mutasi kelas harus update membership aktif dan `current_class_id`. |
| Absensi admin | `AttendanceRecap.jsx`, `DigitalAttendance.jsx` | `attendance`, `santri`, `guru`, `classes`, `academic_calendar` | Sama | Cocok sebagian | Pastikan nama kolom waktu/tanggal sesuai migration lokal. |
| Pembayaran | `PaymentSystem.jsx`, `PaymentHistory.jsx`, `PaymentRecap.jsx`, `PaymentNotes.jsx`, `EditPaymentModal.jsx` | `payments`, `santri` | `payments`, `santri` | Cocok untuk admin | Delete pembayaran hanya admin. |
| Pengeluaran | `ExpenseManagement.jsx` | `expenses` | `expenses` | Cocok untuk admin | Pastikan route/tab hanya admin. |
| Kalender | `CalendarManagement.jsx` | `academic_calendar` | `academic_calendar` | Cocok | Cek field visibility/status bila dipakai. |
| Konten | `ContentManagement.jsx` | `website_content`, `hafalan_items`, `feedbacks`, `santri`, `guru`, Storage `website-assets` | Sama + `news`, `announcements` | Perlu split konten | Pisahkan berita/pengumuman dari `website_content`. |
| TV Display | `TvDisplaySettings.jsx`, `TvDisplayPage.jsx` | `website_content`, `santri`, `guru`, `attendance`, `classes` | Sama | Dipertahankan | Pastikan branding dan config TV tetap di `website_content`. |
| Login logs | `LoginLogs.jsx` | `login_logs` | Tidak dimigrasikan | Harus dinonaktifkan/diubah | Jangan query `login_logs` sampai desain audit log baru ada. |
| Backup/restore | `BackupRestoreManagement.jsx` | RPC `signin_with_username`, Edge `backup-database`, `restore-database` | Deferred, tidak dipakai | Tetap disabled | Jangan aktifkan di Fase 4B. |

## Mapping Guru dan Pentashih

| Fitur | File frontend | Object sekarang | Target backend lokal | Status | Perubahan Fase 4B |
|---|---|---|---|---|---|
| Dashboard guru | `GuruDashboard.jsx` | `guru`, `classes`, `santri`, `attendance`, `hafalan_items`, `hafalan_progress`, `murojaah_submissions` | Sama + RLS kelas | Cocok sebagian | RLS membatasi kelas. Hindari query agregat lintas kelas. |
| Avatar guru | `GuruDashboard.jsx`, `GuruManagement.jsx` | Storage `avatars`, update `guru.foto_url` | `avatars/guru/<uid>/profile.webp` + profile field | Perlu path final | Sesuaikan path dan validasi MIME/ukuran. |
| Pembayaran guru | beberapa UI guru/global search | Bisa membaca `payments` | `payment_status_summary` | Harus diganti | Guru hanya boleh melihat `Lunas`/`Belum Lunas`. |
| MMQ guru | `MmqSection.jsx`, `useMMQAttendance.js` | `mmq_absensi`, `mmq_schedule`, `mmq_notulensi`, `guru` | `mmq_attendance`, `mmq_schedule`, `mmq_notulensi` | Harus diganti sebagian | Semua referensi `mmq_absensi` pindah ke `mmq_attendance`. |
| Pentashih dashboard | `PentashihDashboard.jsx` | `guru`, hitung `santri`/`classes` global | `pentashih_class_assignments` + scoped tables | Harus diganti | Pentashih hanya membaca assignment kelas/MMQ. |

## Mapping Santri

| Fitur | File frontend | Object sekarang | Target backend lokal | Status | Perubahan Fase 4B |
|---|---|---|---|---|---|
| Dashboard santri | `SantriDashboard.jsx` | `santri`, relasi `class:id_kelas`, `hafalan_items`, `hafalan_progress`, `murojaah_submissions`, `attendance`, `website_content` | `santri`, `classes`, `class_memberships`, hafalan/murojaah, attendance | Perlu adapter | Ganti relasi kelas legacy dengan `current_class_id`/membership. |
| Avatar santri | `SantriDashboard.jsx` | direct upload `avatars`, update `santri.foto_url` | `avatars/santri/<auth.uid()>/profile.webp` | Perlu path/policy | Santri hanya upload/ganti/hapus avatar sendiri. |
| Riwayat pembayaran santri | `SantriPaymentHistory.jsx` | `payments` by `santri_id` | `payments` scoped self | Cocok untuk santri | Pastikan RLS hanya data sendiri. |
| Rekap absensi santri | `SantriAbsensiRecap.jsx` | `attendance`, `academic_calendar`, `santri` | Sama | Cocok sebagian | Sesuaikan field sesi/kelas. |
| Murojaah upload | `SantriDashboard.jsx` | insert `murojaah_submissions` | `murojaah_submissions` + Storage `murojaah-recordings` bila file audio | Perlu validasi | Pastikan file rekaman memakai bucket private dan signed URL bila diaktifkan. |

## Mapping Storage

| Bucket sekarang | File frontend | Target backend lokal | Status | Perubahan Fase 4B |
|---|---|---|---|---|
| `avatars` | `SantriDashboard.jsx`, `GuruDashboard.jsx`, `GuruManagement.jsx`, `SantriManagement.jsx`, `SantriDewasaManagement.jsx` | `avatars` | Cocok bucket, perlu path | Gunakan path final per role dan policy. |
| `website-assets` | `ContentManagement.jsx` | `website-assets` | Cocok | Admin write, public read. |
| `music-files` | `MediaPlayerSettings.jsx` | Deferred, tidak dibuat inti | Harus tetap disabled | Jangan mount saat deferred false. |
| `murojaah-recordings` | belum dominan di frontend | `murojaah-recordings` | Perlu integrasi nanti | Tambahkan saat fitur rekaman siap. |

## Mapping Edge Function

| Function sekarang | File frontend | Target backend lokal | Status | Perubahan Fase 4B |
|---|---|---|---|---|
| `manage-user` | `GuruManagement.jsx` | `manage-user` | Ada, kontrak perlu disesuaikan | Payload lama `{ action, userData }` harus mengikuti kontrak role/profile/initial_password. |
| `generate-signed-upload-url` | `SantriManagement.jsx`, `SantriDewasaManagement.jsx` | `generate-signed-upload-url` | Ada, kontrak perlu dicek | Gunakan `bucket`, `path`, `content_type`, `size`, `purpose`. |
| `backup-database` | `BackupRestoreManagement.jsx` | Tidak dipakai | Deferred | Tetap disabled. |
| `restore-database` | `BackupRestoreManagement.jsx` | Tidak dipakai | Deferred | Tetap disabled. |
| Belum dipakai | frontend auth | `signin-with-nomor-induk` | Perlu ditambahkan | Dipakai untuk login santri. |
| Belum dipakai | admin user tools | `reset-user-password` | Perlu ditambahkan nanti | Untuk reset password oleh admin. |

## Mapping RPC

| RPC sekarang | File frontend | Target backend lokal | Status | Perubahan Fase 4B |
|---|---|---|---|---|
| `signin_with_username` | `SupabaseAuthContext.jsx` | `signin-with-nomor-induk` Edge Function | Harus diganti | Tidak boleh dipakai untuk login santri baru. |
| `signin_with_username` | `BackupRestoreManagement.jsx` | Tidak dipakai | Deferred | Backup/restore tetap disabled. |
| `increment_santri_points` | game/quiz/random/digital attendance | Deferred/game points | Harus dijaga disabled | Jangan dipakai pada launch inti kecuali diputuskan ulang. |
| `get_diagnostic_rls_policies` | `diagnosticSantriDataFlow.js` | Tidak wajib launch | Dev diagnostic | Jangan jalankan otomatis di runtime user. |

## Tabel Legacy atau Deferred yang Perlu Dihindari

Tabel/object berikut muncul di source tetapi tidak menjadi target inti Fase 4:

- `forum_topics`
- `forum_replies`
- `music_files`
- `media_player_settings`
- `mmq_absensi`
- `login_logs`
- `hafalan_doa`
- `hafalan_sholat`
- `hafalan_surat`
- `whatsapp_group_links`

Keputusan:

- Forum/music/game/quiz/random/top score tetap deferred.
- `mmq_absensi` diganti `mmq_attendance`.
- `login_logs` tidak dimigrasikan dan tidak boleh menjadi tab aktif sebelum desain baru.
- Hafalan legacy doa/sholat/surat perlu dimapping ke `hafalan_items` dan `hafalan_progress` jika masih diperlukan.

## Prioritas Mapping Fase 4B

1. Auth dan role dari `user_profiles`.
2. Login santri via `signin-with-nomor-induk`.
3. Route guard berbasis role.
4. Query dashboard inti admin/guru/santri.
5. Mapping kelas dari `id_kelas` ke `current_class_id` dan `class_memberships`.
6. Guru memakai `payment_status_summary`.
7. News dan announcements memakai tabel baru.
8. Storage avatar memakai path final.
9. MMQ memakai `mmq_attendance`.
10. Deferred features tetap tidak dimount.
