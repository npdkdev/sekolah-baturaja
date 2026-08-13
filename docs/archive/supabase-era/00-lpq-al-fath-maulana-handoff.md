# Handoff LPQ Al-Fath Maulana

## Status template

Repository ini adalah template lokal independen untuk **LPQ Al-Fath Maulana**. Belum ada GitHub remote, Supabase online baru, Vercel project, akun resmi, atau deployment baru. Logo, domain, kontak, alamat, profil, jadwal TPQ, kuota, biaya, persyaratan pendaftaran, sistem pembelajaran, dan aset publik dasar sudah diisi dari informasi resmi lembaga.

Jangan memasukkan credential, akun Auth, backup, data pribadi, asset privat, URL, Project Ref, maupun data operasional dari lembaga sumber.

## Arsitektur frontend dan backend

- Frontend memakai React 18, Vite, React Router, Tailwind CSS, komponen UI Radix, dan Framer Motion.
- Route utama disusun di `src/App.jsx`; halaman publik dan dashboard role berada di `src/pages` dan `src/components/dashboard`.
- Akses data memakai satu client Supabase di `src/lib/customSupabaseClient.js`, lalu adapter per domain di `src/lib`.
- Backend lokal berada di `supabase`: migration PostgreSQL, RLS, RPC, Storage policy, seed dummy, dan Edge Functions.
- Konfigurasi browser hanya boleh memakai `VITE_SUPABASE_URL` dan publishable/anon key milik environment baru. Service-role key tidak boleh masuk frontend atau Git.

## Role dan aturan akses

- **Publik:** membaca konten website yang memang ditandai publik serta mengirim feedback melalui alur yang disediakan.
- **Admin:** mengelola Data Master, kelas/mutasi, pembayaran, pengeluaran, konten publik, konfigurasi, akun, dan laporan sesuai RLS.
- **Guru:** mengakses profil sendiri, kelas yang ditugaskan, absensi, perkembangan, hafalan/murojaah, serta fungsi pengajaran yang diizinkan.
- **Pentashih:** mengakses penugasan pentashih, MMQ, evaluasi, dan data yang berada dalam cakupan penugasannya.
- **Santri:** mengakses profil dan data miliknya sendiri sesuai kebijakan RLS.

Keamanan tidak boleh hanya mengandalkan tampilan atau route guard. Hak akses final ditegakkan oleh RLS, RPC, Storage policy, dan pemeriksaan role pada Edge Functions.

## Alur Auth santri

1. Santri memasukkan Nomor Induk atau alias login dan password; email internal tidak ditampilkan kepada santri.
2. Frontend memanggil Edge Function `signin-with-nomor-induk`.
3. Function menormalkan identifier, menerapkan rate limit, mencari alias yang aktif, lalu menggunakan email teknis internal pada domain `auth.lpqalfathmaulana.local` untuk proses Supabase Auth.
4. Session Supabase dikembalikan ke frontend; route guard dan RLS membaca user/role yang sah.
5. Pembuatan, perubahan, dan reset akun dilakukan melalui Edge Functions yang memeriksa session serta role pemanggil.

Domain internal tersebut hanya identifier teknis lokal/aplikasi, bukan alamat email publik.

## Migration, RLS, Storage, dan Edge Functions

- Migration dijalankan berurutan dari `supabase/migrations`; migration lama yang sudah stabil tidak diubah urutannya.
- Migration mencakup tipe/extension, profil dan role, guru/santri, kelas/mutasi, absensi, pembayaran/pengeluaran, hafalan/murojaah, kalender, MMQ, konten publik, audit, helper RLS, policy, Storage, index/constraint, RPC, kategori santri, arsip, PTPT/tahfizh, avatar guru, dan sesi absensi aktual.
- RLS utama berada pada migration `20260624001500_rls_helper_functions.sql` dan `20260624001600_rls_policies.sql` beserta penyesuaian migration berikutnya.
- Storage memakai bucket `avatars`, `website-assets`, `murojaah-recordings`, dan `music-files` dengan akses publik/pribadi sesuai migration policy.
- Edge Functions yang dipertahankan: `signin-with-nomor-induk`, `manage-user`, `reset-user-password`, `generate-signed-upload-url`, dan `record-login-attempt`.
- Test backend lokal berada di `supabase/tests` dan dijalankan melalui `scripts/run-local-backend-tests.ps1`.

## Modul utama

- Halaman publik, profil, fasilitas, galeri, berita, pengumuman, feedback, parenting, pendaftaran, dan TV Display.
- Auth dan dashboard untuk admin, guru, pentashih, dan santri.
- Data Master guru/santri, TPQ, PTPT/tahfizh, santri dewasa, kelas, penugasan, mutasi, serta arsip santri.
- Absensi digital/RFID, konfigurasi sesi, rekap, dan histori.
- Pembayaran, bukti pembayaran, status, pengeluaran, arus kas, dan rekap.
- Kalender akademik, hafalan, murojaah, perkembangan karakter, jilid, dan MMQ.
- Avatar dan website assets, gamifikasi, level, quiz/gacha, papan skor, serta Media Player.

## Gaya LPQ Aurora Neo-Glass

Gaya resmi adalah **LPQ Aurora Neo-Glass**: frosted translucent glass, pencahayaan aurora teal–cyan–blue–violet, depth neumorphic lembut, kontrol tactile, spring microinteraction, light/dark mode yang matang, serta accessibility dan performa yang terjaga.

Gunakan secara terarah pada permukaan interaktif. Pertahankan kontras, focus state, reduced-motion, fallback tanpa `backdrop-filter`, responsivitas, dan kinerja perangkat rendah.

## Workflow local → staging → production

1. **Local:** isi `.env.local` hanya dengan Supabase lokal, jalankan Supabase melalui Docker, migration, bootstrap Auth dummy baru, seed dummy, test backend, test frontend, dan build.
2. **Staging:** setelah persetujuan, buat Supabase staging baru dan repository GitHub baru. Berikan URL/Project Ref baru secara eksplisit; deploy migration dan Edge Functions tanpa data asli, lalu buat akun dummy staging baru.
3. **Frontend staging:** hubungkan Vite ke publishable key staging baru, buat Vercel project baru, atur CORS melalui `ALLOWED_ORIGINS`, lalu jalankan E2E staging.
4. **Production:** hanya setelah persetujuan terpisah, buat/konfirmasi target production baru, ulangi gate keamanan, dan gunakan credential baru melalui secret manager/dashboard—bukan file repository.

Skrip online sengaja tidak memiliki Project Ref aktif. Variabel `LPQ_STAGING_PROJECT_REF`, `LPQ_STAGING_SUPABASE_URL`, atau `LPQ_PRODUCTION_PROJECT_REF` baru boleh diisi setelah target baru dibuat dan disetujui.

## Placeholder yang wajib diisi pemilik lembaga

Logo dan favicon resmi LPQ Al-Fath Maulana sudah terpasang dari aset yang diberikan pemilik lembaga.

- nama kepala lembaga, pengurus, serta guru yang diizinkan tampil;
- jam pasti kelas dewasa dan periode buka/tutup pendaftaran;
- media sosial resmi;
- tautan grup WhatsApp per jilid; mapping lama tidak tersedia secara publik dan tidak ditemukan dalam repository;
- kebijakan SPP terperinci, kode pos, serta legalitas/nomor izin bila akan dipublikasikan;
- Project Ref/URL/key Supabase staging dan production baru serta URL Vercel baru.

Jangan mengganti placeholder dengan informasi perkiraan. Pakai hanya data resmi yang diberikan pemilik LPQ Al-Fath Maulana.
