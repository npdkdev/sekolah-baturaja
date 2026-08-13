# Hasil Integrasi Frontend MMQ

Tanggal: 2026-06-24

## Ringkasan

Integrasi MMQ frontend sudah diarahkan ke schema Supabase lokal final:

- `mmq_schedule`
- `mmq_attendance`
- `mmq_notulensi`
- `guru`
- `pentashih_class_assignments` untuk scope MMQ pentashih

Runtime React tidak lagi memakai tabel legacy `mmq_absensi` atau kolom lama `mmq_session_id`.

## File yang Berubah

- `src/lib/mmqAdapters.js`
  - Adapter baru untuk query MMQ memakai satu client resmi `src/lib/customSupabaseClient.js`.
  - Menyediakan helper jadwal, absensi, notulensi, lookup guru RFID, dan pesan error ramah.

- `src/hooks/useMMQAttendance.js`
  - Dipindahkan ke adapter MMQ.
  - Relasi attendance memakai `schedule_id`, bukan `mmq_session_id`.
  - Error RLS/duplikasi ditampilkan sebagai pesan ramah.

- `src/components/dashboard/admin/MMQManagement.jsx`
  - Admin melihat jadwal dan rekap absensi dari tabel final.
  - Tampilan jam jadwal mendukung `start_time` dan `end_time`.

- `src/components/dashboard/admin/MMQScheduleForm.jsx`
  - Form jadwal memakai kolom schema aktual: `day_of_week`, `start_time`, `end_time`, `location`, `is_active`.
  - Field catatan jadwal lama tidak lagi dikirim karena tidak ada di schema final.

- `src/components/dashboard/admin/MMQAttendanceModal.jsx`
  - Payload edit absensi memakai `schedule_id`.

- `src/components/dashboard/guru/MmqSection.jsx`
  - Dialog guru MMQ memakai `mmq_schedule`, `mmq_attendance`, dan `mmq_notulensi`.
  - Guru hanya dapat mencatat absensi MMQ dirinya sendiri.
  - Admin tetap dapat melakukan konfirmasi manual di UI tersebut.
  - Notulensi hanya aktif untuk guru notulen atau admin.

- `src/pages/DigitalAttendancePage.jsx`
  - Jalur RFID MMQ memakai `mmq_attendance.schedule_id`.
  - Fallback tulis ke `mmq_absensi` dihapus.
  - Logging detail MMQ yang tidak perlu dihapus.

- `src/components/dashboard/admin/GuruAttendanceRecap.jsx`
  - Sinkronisasi lama ke `mmq_absensi` dihapus.

## Operasi yang Berhasil

Test lokal dummy MMQ lulus `12/12`:

- admin membuat jadwal MMQ;
- admin mengubah jadwal MMQ;
- admin membaca sumber rekap jadwal;
- guru membaca jadwal MMQ yang diizinkan;
- guru mencatat kehadiran MMQ dirinya sendiri;
- guru ditolak mencatat kehadiran guru lain;
- admin membaca rekap kehadiran MMQ;
- pentashih hanya melihat jadwal MMQ sesuai assignment;
- guru notulen membuat notulensi;
- admin memperbarui notulensi;
- guru non-notulen ditolak membuat notulensi;
- query data kosong tidak crash.

Data uji sementara dibuat di Supabase lokal dan dibersihkan kembali oleh test.

## Operasi yang Ditahan oleh RLS

- Guru non-notulen tidak dapat membuat notulensi.
- Guru tidak dapat mencatat kehadiran MMQ guru lain.
- Pentashih tidak dapat melihat jadwal MMQ tanpa assignment.
- Update notulensi oleh guru tidak diaktifkan di UI karena policy final hanya memberi update penuh kepada admin.

## Hasil Validasi

- `npm run build`: lulus.
- Backend runner lokal: lulus `49/49`.
- Test MMQ lokal: lulus `12/12`.
- `git diff --check`: lulus.
- `scripts/validate-no-secrets.ps1`: lulus.
- Runtime scan `mmq_absensi`: bersih pada `src/components`, `src/lib`, `src/pages`, `src/hooks`, dan `src/utils`.
- Runtime scan service-role pada folder runtime React: bersih.

Catatan: scan luas terhadap seluruh `src/` masih menemukan teks `service_role` dan `mmq_absensi` pada arsip SQL lama seperti `src/database_schema_export.sql`; file itu bukan runtime React dan tidak diubah pada fase ini.

## Masalah Tersisa

- `supabase status` masih dapat menampilkan peringatan service non-core seperti imgproxy/pooler berhenti, tetapi backend runner dan test inti tetap lulus.
- Test browser manual MMQ belum dilakukan oleh user.
- Integrasi ini belum mencakup Storage audio, bisyaroh/payroll, atau fitur deferred.

## Rekomendasi Berikutnya

Uji lewat browser lokal:

1. Login admin dan buka Manajemen MMQ.
2. Tambah dan edit jadwal MMQ.
3. Login guru notulen dan buka dialog MMQ.
4. Coba scan/input RFID guru sendiri.
5. Coba buat notulensi.
6. Login pentashih dan pastikan hanya data scope assignment yang tampil.
