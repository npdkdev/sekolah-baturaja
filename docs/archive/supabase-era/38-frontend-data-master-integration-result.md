# Hasil Integrasi Frontend Data Master Inti

Tanggal: 2026-06-24

## Ringkasan

Fase ini menghubungkan modul Data Master inti frontend ke schema Supabase lokal yang baru untuk santri, guru/pentashih, kelas, membership aktif, dan assignment pentashih berbasis kelas.

Perubahan dibatasi pada frontend Data Master dan satu helper adapter. Tidak ada migration SQL, tidak ada perubahan backend, tidak ada deploy, tidak ada `supabase link`, tidak ada akses database lama, dan tidak ada data asli yang digunakan.

## File yang Diubah/Dibuat

File dibuat:

- `src/lib/dataMasterAdapters.js`
- `docs/38-frontend-data-master-integration-result.md`

File diubah:

- `src/components/dashboard/admin/SantriManagement.jsx`
- `src/components/dashboard/admin/GuruManagement.jsx`
- `src/components/dashboard/admin/ClassManagement.jsx`

## Perubahan Utama

### Santri

- Query daftar santri diarahkan ke kolom final seperti `nomor_induk_qiroati`, `current_class_id`, `kategori`, `status`, `jilid`, dan `order_in_class`.
- `current_class_id` menjadi sumber kelas utama. `id_kelas` hanya dipakai sebagai alias kompatibilitas UI lama melalui adapter.
- Nomor Induk Qiroati dinormalisasi sebagai text tanpa mengubah angka nol di depan.
- Pembuatan santri baru memakai Edge Function `manage-user` dengan role `santri`.
- Edit santri hanya mengirim field yang memang ada di schema final.
- Perubahan Nomor Induk Qiroati pada akun existing ditahan karena harus sinkron dengan `auth_login_aliases`.
- Hapus santri diganti menjadi deactivate lewat `manage-user`, lalu status tabel santri diubah menjadi `Nonaktif`.
- Import massal dan migrasi kategori/kelas ditahan sementara karena perlu operasi backend atomik untuk menjaga Auth, alias login, `current_class_id`, dan `class_memberships`.

### Guru dan Pentashih

- Query guru diarahkan ke kolom final table `guru`.
- Pembuatan guru dan pentashih baru memakai Edge Function `manage-user`.
- Role operasional ditentukan dari form: guru biasa memakai role `guru`, sedangkan guru dengan role `Pentashih` dikirim sebagai role top-level `pentashih`.
- Hapus guru/pentashih diganti deactivate lewat `manage-user`, lalu status tabel guru diubah menjadi `inactive`.
- Reset password untuk akun existing tidak dilakukan dari form guru karena harus memakai alur `reset-user-password`.

### Kelas dan Membership

- Query kelas memakai schema final `classes` dengan `sort_order`, `is_active`, `kategori`, `sesi`, dan `id_guru`.
- Tambah/edit kelas hanya mengirim field schema final.
- Urutan kelas memakai `sort_order`, bukan kolom legacy `order`.
- Hapus kelas diganti menjadi nonaktif (`is_active=false`).
- Kelas yang masih memiliki `class_memberships.is_active=true` tidak boleh dinonaktifkan dari UI.
- Drag/drop mutasi santri dan reorder santri ditahan sementara karena perlu RPC atau Edge Function atomik agar `santri.current_class_id` dan `class_memberships` tetap konsisten.

### Assignment Pentashih

- Admin dapat melihat assignment pentashih aktif berbasis kelas.
- Admin dapat membuat assignment baru ke `pentashih_class_assignments`.
- Admin dapat menonaktifkan assignment tanpa hard delete.
- Pentashih membaca assignment melalui RLS backend. UI pentashih masih perlu dirapikan pada fase berikutnya agar tidak terlihat seperti UI admin penuh.

## Helper Adapter

`src/lib/dataMasterAdapters.js` dibuat untuk:

- memetakan `santri.current_class_id` ke alias UI lama `id_kelas`;
- memetakan `classes.sort_order` ke alias UI lama `order`;
- memilih field santri/guru yang aman dikirim ke schema final;
- menormalisasi Nomor Induk Qiroati sebagai text;
- menentukan role operasional guru/pentashih dari form lama.

## Hasil Verifikasi

- `C:\Program Files\nodejs\npm.cmd run build`: lulus.
- `powershell -ExecutionPolicy Bypass -File scripts/run-local-backend-tests.ps1 -SupabaseUrl http://127.0.0.1:55321`: lulus `40/40`.
- `git diff --check`: lulus. Ada warning line ending CRLF/LF dari Git, bukan error whitespace.
- Static scan runtime `mock_santri_session`: tidak ditemukan.
- Static scan runtime `signin_with_username`: tidak ditemukan.
- Static scan runtime service-role di source frontend JS/JSX/TS/TSX: tidak ditemukan.

## Tes Lokal Data Master

Tes minimal lokal dilakukan terhadap Supabase lokal `http://127.0.0.1:55321`:

- Login admin dummy berhasil.
- Login guru dummy berhasil.
- Login pentashih dummy berhasil.
- Login santri dummy memakai Nomor Induk Qiroati berhasil.
- Admin dapat membaca data master santri, guru, dan kelas.
- Guru dapat membaca kelasnya melalui RLS.
- Pentashih dapat membaca assignment kelasnya melalui RLS.
- Santri hanya membaca record dirinya melalui RLS.
- Admin dapat membuat santri dummy melalui `manage-user`.
- Santri dummy test kemudian dinonaktifkan melalui `manage-user`.

Setelah backend runner selesai, password akun dummy lokal dikembalikan ke `Password123!`.

## Fitur yang Sengaja Ditahan

- Import massal santri.
- Mutasi kategori santri ke dewasa.
- Drag/drop pindah kelas santri.
- Reorder santri di dalam kelas.
- Aktivasi ulang akun santri secara massal.
- Edit Nomor Induk Qiroati akun existing.
- Reset password guru/pentashih dari form guru.

Alasannya sama: operasi tersebut perlu RPC atau Edge Function atomik agar data Auth, profil aplikasi, alias login, `santri.current_class_id`, dan `class_memberships` tidak saling berbeda.

## Masalah Tersisa

- `PentashihDashboard` masih menampilkan komponen `SantriManagement` bergaya admin pada tab daftar santri. RLS tetap membatasi data, tetapi UI perlu dibuat read-only/role-aware pada fase berikutnya.
- `AdultClassManagement` dan beberapa modul lama lain masih memakai pola legacy `id_kelas`; tidak disentuh karena scope fase ini hanya Data Master inti TPQ/PTPT.
- Operasi class membership belum punya RPC/Edge Function atomik.
- Beberapa modul non-scope seperti absensi, pembayaran, laporan, MMQ, Storage, dan konten publik belum diintegrasikan pada fase ini.

## Rekomendasi Berikutnya

1. Buat backend operation atomik untuk mutasi kelas:
   - update `santri.current_class_id`;
   - tutup membership lama;
   - buat membership aktif baru;
   - catat `class_mutations`;
   - pastikan hanya satu membership aktif per santri.
2. Buat operasi reaktivasi akun yang sinkron antara Supabase Auth dan tabel aplikasi.
3. Rapikan UI pentashih menjadi read-only/assignment-aware.
4. Lanjutkan fase integrasi berikutnya untuk absensi RFID dan pembayaran dengan tetap memakai RLS backend sebagai batas utama.
