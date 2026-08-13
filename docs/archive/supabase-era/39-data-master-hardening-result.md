# Hasil Finalisasi Data Master

Tanggal: 2026-06-24

## Ringkasan

Finalisasi Data Master scope kecil sudah dikerjakan untuk dua area:

1. Operasi atomik mutasi kelas santri melalui RPC database `move_santri_to_class`.
2. Dashboard pentashih read-only dan assignment-aware.

Tidak ada Supabase online, `supabase link`, deploy, database lama, data asli, atau service-role di frontend yang digunakan.

## File Dibuat

- `supabase/migrations/20260624001900_move_santri_to_class_rpc.sql`
- `docs/39-data-master-hardening-result.md`

## File Diubah

- `src/components/dashboard/admin/ClassManagement.jsx`
- `src/components/dashboard/PentashihDashboard.jsx`
- `scripts/validate-migration-order.ps1`
- `scripts/run-local-backend-tests.ps1`

## Mutasi Kelas Atomik

Migration baru menambahkan RPC:

- `public.move_santri_to_class(p_santri_id uuid, p_to_class_id uuid, p_reason text default null)`

Perilaku RPC:

- memakai `auth.uid()` dan `public.current_user_role()`;
- hanya role aplikasi `admin` yang boleh menjalankan mutasi;
- memverifikasi santri ada dan aktif;
- memverifikasi kelas tujuan ada, aktif, dan tidak soft-deleted;
- mengunci record santri, kelas tujuan, dan membership aktif terkait selama transaksi function;
- menutup membership aktif lama dengan `status='moved'` dan `end_date=current_date`;
- membuat membership aktif baru;
- memperbarui `santri.current_class_id`, `sesi_mengaji`, dan `order_in_class`;
- mencatat `class_mutations`;
- aman jika kelas tujuan sama dengan kelas aktif saat ini;
- mengembalikan ringkasan non-sensitif: santri id, kelas asal/tujuan, mutation id, status changed, message, dan jumlah membership aktif;
- revoke default execute lalu grant hanya ke DB role `authenticated`, dengan pemeriksaan role admin tetap dilakukan di dalam function.

Frontend `ClassManagement.jsx` sekarang memanggil RPC tersebut saat admin drag/drop santri ke kelas tujuan. Frontend tidak lagi melakukan beberapa update terpisah untuk `santri`, `class_memberships`, dan `class_mutations`.

Catatan: operasi mengeluarkan santri dari kelas ke status tanpa kelas masih ditahan karena belum menjadi scope RPC ini.

## Pentashih Read-Only

`PentashihDashboard.jsx` diganti menjadi dashboard ringan:

- hanya membaca kelas yang dikembalikan RLS untuk pentashih;
- hanya membaca membership aktif dan santri dalam assignment;
- tidak memakai `ClassManagement` atau `SantriManagement` admin;
- tidak menampilkan tombol tambah, edit, hapus, deactivate, import, mutasi, atau pindah kelas;
- memiliki empty state jika belum ada assignment;
- tetap mengandalkan RLS backend sebagai batas keamanan utama.

## Update Test Runner

Karena migration bertambah menjadi 19:

- `scripts/validate-migration-order.ps1` diperbarui untuk mengenali `20260624001900_move_santri_to_class_rpc.sql`;
- `scripts/run-local-backend-tests.ps1` diperbarui dari 18 ke 19 migration;
- backend runner juga memeriksa keberadaan RPC `move_santri_to_class`.

## Hasil Pengujian

Workflow lokal:

- `supabase db reset`: berhasil, migration `20260624000100` sampai `20260624001900` diterapkan.
- `scripts/bootstrap-dummy-auth-users.ps1`: berhasil membuat akun Auth dummy lokal.
- `supabase/seed.sql`: berhasil dijalankan terhadap database lokal.

Test RPC wajib:

- Admin memindahkan santri dummy dari Kelas Demo A ke Kelas Demo B: lulus.
- Membership lama menjadi `moved`: lulus.
- Hanya satu membership aktif per santri: lulus.
- `santri.current_class_id` sama dengan membership aktif: lulus.
- `class_mutations` tercatat: lulus.
- Guru ditolak memanggil RPC: lulus.
- Santri ditolak memanggil RPC: lulus.
- Fixture dummy dikembalikan ke Kelas Demo A setelah test agar runner tetap stabil.

Test pentashih:

- Pentashih melihat 1 kelas assignment dummy: lulus.
- Pentashih melihat 3 santri dalam kelas assignment dummy: lulus.
- Pentashih melihat 3 membership aktif terkait assignment: lulus.
- Static scan dashboard pentashih untuk kontrol admin seperti `Tambah`, `Edit`, `Nonaktifkan`, `Hapus`, `Import`, `Mutasi`, `Pindah`, `ClassManagement`, `SantriManagement`, dan `GuruAttendanceRecap`: tidak ditemukan.

Verifikasi umum:

- `powershell -ExecutionPolicy Bypass -File scripts/run-local-backend-tests.ps1 -SupabaseUrl http://127.0.0.1:55321`: lulus `41/41`.
- `C:\Program Files\nodejs\npm.cmd run build`: lulus.
- `git diff --check`: lulus, hanya warning line-ending CRLF/LF.
- `powershell -ExecutionPolicy Bypass -File scripts/validate-no-secrets.ps1`: lulus.

## Hal yang Tetap Ditunda

- Import massal santri.
- Edit Nomor Induk Qiroati existing.
- Reaktivasi massal akun.
- Reorder santri dalam kelas.
- Operasi mengeluarkan santri dari kelas tanpa kelas tujuan.
- Absensi.
- Pembayaran.
- MMQ.
- Konten website.
- Storage.

## Catatan Risiko

- RPC baru memakai `security definer`, sehingga `search_path` sudah dikunci ke `public, pg_temp` dan function melakukan pemeriksaan role aplikasi secara eksplisit.
- Grant execute diberikan ke DB role `authenticated` karena PostgreSQL/Supabase tidak mengenal role aplikasi `admin` sebagai DB role. Pembatasan admin tetap dilakukan di dalam function.
- Dashboard pentashih sekarang read-only, tetapi modul lain di luar scope fase ini masih perlu audit role-aware pada fase integrasi berikutnya.

## Rekomendasi Berikutnya

1. Tambahkan RPC terpisah untuk mengeluarkan santri dari kelas jika workflow operasional memang dibutuhkan.
2. Tambahkan RPC untuk reorder santri dalam kelas agar `order_in_class` tetap konsisten.
3. Lanjutkan integrasi absensi RFID setelah Data Master stabil.
