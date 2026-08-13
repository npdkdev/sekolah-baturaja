# Hasil Integrasi Operasional Akademik Inti

## Ringkasan

Operasional akademik inti frontend sudah diarahkan ke schema Supabase lokal final untuk kalender akademik, item hafalan, progres hafalan, pengajuan/riwayat murojaah, dan catatan santri.

Tidak ada migration baru, tidak ada service-role di frontend, tidak ada deploy, tidak ada `supabase link`, dan tidak ada akses Supabase online atau database lama.

## File yang Dibuat atau Diubah

- `src/lib/academicAdapters.js`
- `src/components/dashboard/admin/CalendarManagement.jsx`
- `src/components/dashboard/admin/ContentManagement.jsx`
- `src/components/dashboard/GuruDashboard.jsx`
- `src/components/dashboard/SantriDashboard.jsx`
- `src/components/dashboard/shared/SantriDetailModal.jsx`
- `src/utils/reportUtils.js`
- `docs/44-frontend-academic-operations-result.md`

## Perubahan Utama

- Menambahkan adapter akademik untuk:
  - kalender akademik;
  - master item hafalan;
  - progres hafalan;
  - pengajuan dan review murojaah;
  - catatan santri;
  - pesan error RLS yang ramah.
- Kalender akademik admin sekarang mengirim field final:
  - `date`
  - `title`
  - `description`
  - `is_holiday`
  - `is_public`
  - `event_type`
- Master item hafalan tetap berada di tab Konten, tetapi memakai `hafalan_items` final dan delete UI dibuat menjadi nonaktif/soft deactivate melalui `is_active = false`.
- Guru dashboard sekarang memakai:
  - `classes`
  - `class_memberships`
  - `hafalan_items`
  - `hafalan_progress`
  - `murojaah_submissions`
- Progres hafalan memakai status final `belum`, `proses`, `lulus`, dan `ulang`.
- Santri dashboard sekarang membuat pengajuan murojaah tanpa file audio memakai:
  - `type`
  - `content`
  - `recording_path = null`
  - `status = menunggu`
- Catatan santri memakai `santri_notes`; insert/update mengikuti RLS guru sesuai kelas.
- Util laporan tidak lagi memakai tabel legacy `hafalan_doa`, `hafalan_sholat`, atau `hafalan_surat`.

## Hasil Test

- `npm run build`: berhasil.
- Backend runner lokal: berhasil, `49/49`.
- Test akademik lokal dummy: berhasil, `19/19`.
- `git diff --check`: berhasil.
- No-secret scan: berhasil.
- Scan runtime untuk tabel legacy `hafalan_doa`, `hafalan_sholat`, `hafalan_surat`: tidak ada temuan.

## Skenario Test Akademik

- Admin tambah/update/delete kalender akademik.
- Admin tambah/update/nonaktifkan item hafalan.
- Guru mencatat progres hafalan santri kelasnya.
- Guru update progres hafalan santri kelasnya.
- Guru ditolak mengelola progres santri kelas lain.
- Santri melihat progresnya sendiri.
- Santri tidak melihat progres santri lain.
- Santri membuat pengajuan murojaah sendiri tanpa file audio.
- Santri ditolak membaca pengajuan murojaah orang lain.
- Guru memperbarui status pengajuan murojaah dalam scope kelas.
- Guru membuat catatan santri kelasnya.
- Guru ditolak membuat catatan santri kelas lain.
- Pentashih melihat progres dalam assignment.
- Pentashih tidak melihat progres di luar assignment.
- Query data kosong tidak crash.

## Masalah Tersisa

- Input setoran murojaah manual oleh guru ditahan di UI karena RLS saat ini hanya mengizinkan santri/admin untuk insert `murojaah_submissions`. Guru tetap dapat review pengajuan santri dalam scope kelas.
- Penghapusan catatan santri dan penghapusan setoran murojaah oleh guru ditahan karena RLS backend tidak memberi delete pada role guru.
- Storage audio murojaah belum dikerjakan sesuai batasan scope.
- MMQ, bisyaroh, konten publik, dan fitur deferred belum disentuh.

## Rekomendasi Uji Browser

1. Login admin, buka Kalender dan tab Konten > Hafalan.
2. Tambah item hafalan dummy, lalu nonaktifkan setelah selesai.
3. Login guru, buka kelas, klik tombol hafalan pada santri, lalu tandai satu item.
4. Login santri, kirim pengajuan murojaah tanpa audio.
5. Login guru kembali, review pengajuan murojaah tersebut.
6. Buka detail santri sebagai guru, tambah catatan akademik.
