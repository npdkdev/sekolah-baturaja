# 04 - Frontend Database Mapping

## Ringkasan Objek Backend yang Dipanggil Frontend

### Tabel yang Dipanggil

Frontend memanggil tabel berikut:

- `academic_calendar`
- `attendance`
- `class_mutations`
- `classes`
- `expenses`
- `feedbacks`
- `forum_replies`
- `forum_topics`
- `guru`
- `hafalan_doa`
- `hafalan_items`
- `hafalan_progress`
- `hafalan_sholat`
- `hafalan_surat`
- `jilid_history`
- `login_logs`
- `media_player_settings`
- `mmq_absensi`
- `mmq_attendance`
- `mmq_notulensi`
- `mmq_schedule`
- `murojaah_submissions`
- `music_files`
- `notifications`
- `payments`
- `santri`
- `santri_notes`
- `website_content`
- `whatsapp_group_links`

### RPC yang Dipanggil

- `signin_with_username`
- `increment_santri_points`
- `get_diagnostic_rls_policies`

### Storage Bucket yang Dipanggil

- `avatars`
- `website-assets`
- `music-files`

### Edge Function yang Dipanggil

- `manage-user`
- `generate-signed-upload-url`
- `backup-database`
- `restore-database`

Source Edge Function tidak tersedia di repo. File `src/SupabaseEdgeFunctions.js` dan `src/SupabaseEdgeFunctions.sql` hanya placeholder kosong.

## Mapping Fitur

| Fitur | File Utama | Backend |
|---|---|---|
| Homepage | `HomePage`, `Navbar`, `App` | `website_content`, `santri`, `guru`, `feedbacks`, realtime `website_content`. |
| Login | `LoginPage`, `SupabaseAuthContext` | Supabase Auth, `signin_with_username`, `santri`, Edge `manage-user`, `website_content`. |
| Dashboard role | `DashboardPage` | `guru.roles`, `santri.kategori`. |
| Admin overview | `AdminDashboard` | `santri`, `payments`, `expenses`, global search ke `guru`, `classes`, `hafalan_progress`. |
| Manajemen santri | `SantriManagement`, `SantriDewasaManagement` | `santri`, `classes`, `website_content`, `attendance`, `payments`, `hafalan_progress`, `murojaah_submissions`, `avatars`, Edge `generate-signed-upload-url`. |
| Manajemen guru | `GuruManagement` | `guru`, `avatars`, Edge `manage-user`. |
| Manajemen kelas | `ClassManagement` | `classes`, `guru`, `santri`, `attendance`, `website_content`, `class_mutations`, `jilid_history`. |
| Absensi digital | `DigitalAttendancePage`, `DigitalAttendance` | `guru`, `santri`, `classes`, `attendance`, `mmq_schedule`, `mmq_attendance`, `mmq_absensi`, `class_mutations`, `website_content`, RPC `increment_santri_points`. |
| Rekap absensi | `AttendanceRecap`, `GuruAttendanceRecap`, `ClassPerformanceModal` | `attendance`, `santri`, `guru`, `classes`, `academic_calendar`, `jilid_history`, `hafalan_progress`. |
| Pembayaran | `PaymentSystem`, `PaymentHistory`, `PaymentRecap`, `PaymentNotes`, `PaymentStatusPage` | `payments`, `santri`, beberapa komponen memakai logo dari URL Storage lama. |
| Pengeluaran | `ExpenseManagement` | `expenses`. |
| Konten website | `ContentManagement` | `website_content`, `feedbacks`, `santri`, `guru`, `hafalan_items`, bucket `website-assets`. |
| Kalender akademik | `CalendarManagement` | `academic_calendar`. |
| MMQ | `MMQManagement`, `MmqSection`, `MMQScheduleForm`, `useMMQAttendance` | `guru`, `mmq_schedule`, `mmq_attendance`, `mmq_notulensi`. |
| Game dan poin | `QuizHafalanPage`, `GatchaGamePage`, `RandomNamePage`, `TopScorePage`, `GameConfiguration` | `hafalan_items`, `santri`, `guru`, `website_content`, RPC `increment_santri_points`. |
| Santri dashboard | `SantriDashboard` | `santri`, `classes`, `attendance`, `hafalan_items`, `hafalan_progress`, `murojaah_submissions`, `payments`, `website_content`, bucket `avatars`. |
| Guru dashboard | `GuruDashboard` | `guru`, `classes`, `santri`, `attendance`, `hafalan_items`, `hafalan_progress`, `murojaah_submissions`, `jilid_history`, `avatars`. |
| Media player | `useMediaPlayer`, `MediaPlayerSettings` | `music_files`, `media_player_settings`, bucket `music-files`. |
| Forum | `ForumPage`, `ForumTopicPage` | `forum_topics`, `forum_replies`. |
| Backup/restore UI | `BackupRestoreManagement` | RPC `signin_with_username`, Edge `backup-database`, Edge `restore-database`. |
| Login logs | `LoginLogs` | `login_logs`. |

## Gap Frontend vs Database

### Tabel Dipanggil Frontend tetapi Tidak Terlihat di Backup

- `hafalan_doa`
- `hafalan_sholat`
- `hafalan_surat`
- `whatsapp_group_links`

Kemungkinan ini sisa eksperimen/fitur lama. `reportUtils.js` masih mencoba membaca tiga tabel hafalan legacy, sehingga fitur rapor PDF bisa gagal atau tidak lengkap jika tabel tersebut tidak dibuat.

### RPC Dipanggil tetapi Tidak Terlihat di Backup

- `get_diagnostic_rls_policies`

Ini dipakai oleh utilitas diagnostik, bukan fitur utama pengguna. Sebaiknya tidak dibawa ke produksi baru kecuali dibutuhkan untuk debugging internal.

### Edge Function Dipanggil tetapi Source Tidak Ada

- `manage-user`: membuat/mengubah/menghapus user Auth untuk guru.
- `generate-signed-upload-url`: upload aman foto santri.
- `backup-database`: export data dari aplikasi.
- `restore-database`: restore data dari file.

Project baru harus membuat ulang Edge Function tersebut atau mengganti fiturnya.

### Storage

Frontend memakai `music-files`, tetapi backup schema yang terlihat terutama menampilkan tabel `music_files` dan policy Storage lain. Saat membuat Supabase baru, bucket `music-files` harus dibuat eksplisit.

## Area yang Mungkin Kosong atau Rusak

1. Backup/restore UI hampir pasti tidak bekerja tanpa Edge Function.
2. Pendaftaran akun guru dari login bergantung pada Edge `manage-user`.
3. Upload foto santri via signed URL bergantung pada Edge `generate-signed-upload-url`.
4. Rapor PDF mencoba mengambil tabel hafalan legacy yang tidak ada di backup.
5. TV display masih memakai logo/branding lama di beberapa bagian.
6. Beberapa halaman publik memakai fallback/static content; jika `website_content` kosong, tampilan mungkin tetap muncul tetapi bukan data resmi.
