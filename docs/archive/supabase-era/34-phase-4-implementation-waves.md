# 34 - Phase 4 Implementation Waves

## Status

Dokumen ini membagi integrasi frontend React dengan Supabase lokal menjadi beberapa gelombang kecil.

Fase 4A hanya dokumentasi. Implementasi source dimulai pada Fase 4B setelah audit dan mapping disetujui.

## Prinsip Urutan

- Mulai dari konfigurasi dan auth, bukan dari fitur yang kompleks.
- Jangan mengubah desain besar di awal.
- Jangan membuka fitur deferred.
- Jangan memakai data asli.
- Jangan menyentuh Supabase online atau database lama.
- Setiap wave harus bisa diuji lokal sebelum lanjut.

## Wave 0 - Preflight Repository dan Backend Lokal

Tujuan:

- Memastikan worktree aman sebelum source frontend diubah.
- Memastikan backend lokal tetap sehat.

File target:

- Tidak ada perubahan source.
- Dokumentasi/checklist saja jika perlu.

Langkah:

1. Jalankan `git status --short`.
2. Pastikan perubahan Fase sebelumnya sudah jelas.
3. Jalankan backend test runner jika stack lokal aktif:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-local-backend-tests.ps1 -SupabaseUrl http://127.0.0.1:55321
```

Kriteria selesai:

- Tidak ada perubahan tidak dikenal.
- Backend local test tetap lulus.
- Tidak ada `.env.local` yang ter-commit.

Risiko:

- Saat audit Fase 4A dibuat, masih ada file Fase 3B-3 untracked. Jangan campur commit.

## Wave 1 - Konfigurasi Lokal Frontend dan Health Check

Tujuan:

- Menyiapkan frontend agar bisa diarahkan ke Supabase lokal secara aman.

File target kemungkinan:

- `.env.example` bila perlu penyesuaian dokumentasi.
- Tidak membuat `.env.local` otomatis.
- `src/lib/customSupabaseClient.js` hanya jika ditemukan bug konfigurasi.

Langkah:

1. User membuat `.env.local` manual dari `.env.example`.
2. Isi local URL dan anon key dari `supabase status`.
3. Jalankan frontend lokal.
4. Pastikan halaman public tetap tampil bila env kosong.
5. Pastikan tidak ada hard-code Supabase lama.

Kriteria selesai:

- Frontend bisa start lokal.
- Tanpa env, aplikasi tidak crash dan tidak menghubungi backend lama.
- Dengan env lokal, request mengarah ke `127.0.0.1` atau `localhost`.

Risiko:

- Jangan mencetak anon key ke dokumen atau console output final.
- Jangan commit `.env.local`.

## Wave 2 - Auth dan Route Guard

Tujuan:

- Menghubungkan login frontend ke Supabase Auth resmi lokal.

File target kemungkinan:

- `src/contexts/SupabaseAuthContext.jsx`
- `src/pages/LoginPage.jsx`
- `src/components/ProtectedRoute.jsx`
- `src/pages/DashboardPage.jsx`

Langkah:

1. Load `user_profiles` setelah session Auth tersedia.
2. Jadikan `user_profiles.role` sumber role tunggal.
3. Ganti login santri dari RPC `signin_with_username` ke Edge Function `signin-with-nomor-induk`.
4. Gunakan `supabase.auth.setSession` dari session resmi function.
5. Tambahkan role allowlist pada `ProtectedRoute`.
6. Ubah dashboard pentashih ke role top-level `pentashih`.

Kriteria selesai:

- Admin login.
- Guru login.
- Santri login via Nomor Induk Qiroati.
- Pentashih login.
- Refresh session tetap valid.
- Logout bersih.
- Tidak ada mock session.
- Tidak ada JWT custom.

Risiko:

- Edge Function login santri harus mengembalikan session object sesuai kontrak.
- AuthContext tidak boleh log token, password, session penuh, atau email internal santri.

## Wave 3 - Dashboard Role dan Query Inti

Tujuan:

- Membuat dashboard inti memakai schema backend lokal.

File target kemungkinan:

- `src/pages/DashboardPage.jsx`
- `src/components/dashboard/AdminDashboard.jsx`
- `src/components/dashboard/GuruDashboard.jsx`
- `src/components/dashboard/SantriDashboard.jsx`
- `src/components/dashboard/PentashihDashboard.jsx`
- helper query bila dibutuhkan.

Langkah:

1. Admin dashboard tetap membaca agregat `santri`, `payments`, dan `expenses`.
2. Guru dashboard hanya membaca data kelas yang diampu.
3. Santri dashboard hanya membaca data sendiri.
4. Pentashih dashboard membaca data berdasarkan assignment.
5. Hindari query global yang bergantung pada RLS untuk menyembunyikan semuanya jika UI bisa lebih spesifik.

Kriteria selesai:

- Admin melihat ringkasan operasional.
- Guru tidak melihat kelas lain.
- Santri tidak melihat santri lain.
- Pentashih tidak melihat assignment lain.
- Error RLS tampil ramah.

Risiko:

- Relasi lama `id_kelas` perlu adapter ke `current_class_id` dan `class_memberships`.
- Query lama yang select `*` perlu dibatasi jika data sensitif tidak diperlukan UI.

## Wave 4 - Modul Inti Admin, Guru, dan Santri

Tujuan:

- Mengintegrasikan fitur launch prioritas.

Modul:

- data santri;
- data guru;
- kelas dan mutasi;
- absensi RFID;
- pembayaran;
- pengeluaran;
- kalender akademik;
- hafalan/murojaah;
- MMQ;
- konten website.

Langkah:

1. Sesuaikan `manage-user` untuk create/update/deactivate akun guru, santri, pentashih.
2. Sesuaikan kelas dengan `class_memberships`.
3. Sesuaikan MMQ dari `mmq_absensi` ke `mmq_attendance`.
4. Pastikan guru memakai `payment_status_summary`, bukan detail `payments`.
5. Pastikan santri hanya melihat pembayaran sendiri.
6. Pisahkan berita dan pengumuman ke `news` dan `announcements`.

Kriteria selesai:

- Admin dapat mengelola data inti.
- Guru hanya mengelola santri kelasnya.
- Santri hanya melihat datanya.
- Pembayaran delete hanya admin.
- Pengeluaran hanya admin.
- MMQ memakai tabel baru.

Risiko:

- Payload Edge Function lama tidak sama dengan kontrak lokal.
- Beberapa modul masih memakai tabel legacy yang tidak dibuat di backend baru.

## Wave 5 - Storage Avatar dan Asset

Tujuan:

- Menyelaraskan upload frontend dengan policy Storage lokal.

Bucket:

- `avatars`
- `website-assets`
- `murojaah-recordings`

Langkah:

1. Avatar santri memakai path `avatars/santri/<auth.uid()>/profile.webp`.
2. Avatar guru memakai path role/uid yang disepakati.
3. Admin dan guru memakai `generate-signed-upload-url` saat policy membutuhkan validasi server.
4. Validasi JPG, JPEG, PNG, WebP dan maksimal 2 MB untuk avatar santri.
5. Website asset tetap public read dan admin write.
6. Rekaman murojaah memakai bucket private dan signed URL bila file audio diaktifkan.

Kriteria selesai:

- Santri upload avatar sendiri berhasil.
- Santri upload avatar orang lain ditolak.
- Guru hanya mengelola avatar santri kelasnya.
- Admin bisa menghapus foto tidak pantas.
- File lama diganti, tidak menumpuk.

Risiko:

- Frontend saat ini memakai `getPublicUrl` untuk avatar. Jika bucket private, perlu signed URL atau path rendering yang sesuai.

## Wave 6 - Laporan, Validasi Akhir, dan Cleanup Deferred

Tujuan:

- Menutup integrasi launch dengan laporan dan gate keamanan.

Langkah:

1. Test export Excel/PDF untuk pembayaran dan keuangan.
2. Pastikan laporan guru tidak berisi nominal/metode/catatan pembayaran.
3. Pastikan fitur deferred tetap hidden.
4. Pastikan backup/restore UI tetap disabled.
5. Scan source untuk object legacy yang tidak boleh aktif.
6. Jalankan build frontend.
7. Jalankan backend runner.

Kriteria selesai:

- `npm run build` berhasil.
- Backend local test tetap lulus.
- Tidak ada `signin_with_username` pada runtime auth.
- Tidak ada `mock_santri_session`.
- Tidak ada query aktif ke tabel deferred.
- Tidak ada secret atau `.env.local` di Git.

Risiko:

- Laporan PDF/Excel bisa membutuhkan mapping field tambahan.
- Fitur deferred mungkin masih termount dari komponen shared jika tidak dijaga.

## Urutan Commit yang Disarankan

Jika implementasi Fase 4B dilakukan bertahap:

1. Commit auth dan route guard.
2. Commit query dashboard inti.
3. Commit admin/guru/santri core modules.
4. Commit storage/avatar.
5. Commit public content/news/announcements.
6. Commit laporan dan cleanup.

Setiap commit sebaiknya lulus:

- `npm run build`;
- test manual role terkait wave;
- static scan untuk secret dan legacy object kritis.
