# Hasil Integrasi Frontend Absensi RFID

## Ringkasan

Integrasi absensi RFID frontend telah diarahkan ke schema Supabase lokal final untuk kebutuhan inti:

- input dan pemindaian RFID tetap memakai UI yang sudah ada;
- lookup santri memakai `santri.rfid_tag` sebagai text;
- santri aktif divalidasi sebelum pencatatan;
- kelas aktif memakai `santri.current_class_id`;
- insert absensi memakai tabel `attendance` final;
- duplikasi santri, tanggal, dan sesi ditangani oleh unique index backend;
- rekap absensi admin/guru/santri memakai kolom final.

Tidak ada Supabase online, service-role frontend, deployment, `supabase link`, data asli, atau database lama yang digunakan.

## File yang Diubah

- `src/lib/attendanceAdapters.js`
  - Adapter kecil untuk normalisasi RFID, validasi status santri aktif, payload absensi santri, tanggal/waktu lokal, dan pesan error absensi yang ramah.

- `src/components/dashboard/admin/DigitalAttendance.jsx`
  - Lookup santri RFID memakai `current_class_id`.
  - Santri nonaktif atau tanpa kelas aktif ditolak sebelum insert.
  - RFID tidak dikenal tidak membuat record.
  - Insert absensi santri memakai payload final dan `source = 'rfid'`.
  - Error duplikat ditampilkan sebagai "Santri sudah tercatat hadir pada sesi ini."

- `src/pages/DigitalAttendancePage.jsx`
  - Jalur scan santri pada halaman kiosk memakai `current_class_id`.
  - Duplikasi scan santri tidak lagi diarahkan ke update ulang, tetapi ditolak dengan pesan ramah.
  - Bagian guru/MMQ lama tidak diperluas di fase ini.

- `src/components/dashboard/admin/AttendanceRecap.jsx`
  - Data santri rekap memakai `current_class_id`.
  - Filter kelas guru/admin disesuaikan tanpa query `id_kelas` legacy.

- `src/components/dashboard/santri/SantriAbsensiRecap.jsx`
  - Rekap santri memakai relasi kelas dari `current_class_id`.

## Verifikasi

- `npm run build`: lulus.
- Backend runner lokal: lulus `41/41`.
- `git diff --check`: lulus setelah pembersihan trailing whitespace.
- No-secret scan: lulus, tidak ada secret obvious yang terdeteksi.

## Test Absensi Lokal

Test menggunakan data dummy lokal dan token user biasa:

- admin berhasil lookup RFID santri aktif;
- admin berhasil mencatat absensi santri RFID valid;
- guru berhasil mencatat absensi santri di kelasnya;
- guru ditolak mencatat absensi santri kelas lain;
- RFID tidak dikenal tidak menemukan santri dan tidak membuat record;
- santri nonaktif ditolak sebelum insert;
- scan duplikat pada santri, tanggal, dan sesi yang sama tidak membuat record kedua;
- santri hanya membaca riwayat absensinya sendiri;
- query rekap absensi berjalan tanpa error.

Hasil test absensi lokal: `9/9` lulus.

## Catatan

- Backend sudah memiliki unique index `attendance_user_date_sesi_unique`, sehingga tidak diperlukan migration baru untuk mencegah duplikasi.
- RFID dummy lokal dipakai hanya untuk pengujian lokal.
- Status dummy santri yang sempat dibuat nonaktif untuk test negatif sudah dikembalikan ke aktif.
- Perubahan ini belum dikomit agar dapat diuji melalui browser terlebih dahulu.

## Masalah Tersisa

- Halaman kiosk masih menyimpan logika lama untuk guru dan MMQ. Bagian tersebut sengaja tidak diperluas karena scope fase ini hanya absensi RFID santri dan rekap inti.
- Belum ada test browser otomatis untuk scan fisik RFID/NFC; validasi saat ini memakai API lokal dan build frontend.

## Rekomendasi Berikutnya

Uji manual di browser lokal untuk scan/input RFID dummy pada role admin dan guru, lalu lanjutkan hardening kecil pada jalur guru/MMQ hanya setelah fitur absensi santri dinyatakan stabil.
