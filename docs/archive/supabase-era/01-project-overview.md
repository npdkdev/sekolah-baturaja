# 01 - Project Overview

## Ringkasan

Proyek ini adalah export website Horizon AI untuk LPQ Al-Fath Maulana yang akan dijadikan dasar pembangunan website baru **LPQ Al-Fath Maulana 2**. Frontend memakai React + Vite dan berkomunikasi langsung dengan Supabase lama melalui client di `src/lib/customSupabaseClient.js`.

Tahap ini hanya analisis dan dokumentasi. Tidak ada restore database, deployment, migrasi, perubahan desain, atau koneksi tulis ke Supabase lama.

## Struktur Folder Penting

| Folder/File | Fungsi |
|---|---|
| `src/` | Source utama React: halaman, komponen dashboard, hooks, utilitas, dan file SQL/report lama. |
| `src/pages/` | Halaman publik, halaman dashboard, mode absensi, TV display, game, dan detail konten. |
| `src/components/` | Navbar, footer, komponen UI, dashboard admin/guru/santri, dan komponen bersama. |
| `src/contexts/` | Auth context Supabase dan theme context. |
| `src/lib/customSupabaseClient.js` | Client Supabase yang dipakai aplikasi utama. Masih hard-code project Supabase lama. |
| `lib/customSupabaseClient.js` | Client Supabase kedua di luar `src`; juga hard-code project lama. Perlu dirapikan nanti. |
| `src/database_schema_export.sql` | Export schema Horizon. Tidak lengkap dibanding backup asli. |
| `_private_reference/lpq_full.backup` | Backup PostgreSQL Custom Archive dari Supabase lama. Berisi data asli sensitif. |
| `public/` | Asset publik, favicon/sitemap/robots/llms. Ada sisa branding lama. |
| `plugins/` | Plugin visual/editor Horizon untuk Vite. |

## Status Tooling

- `package.json` memakai React 18, Vite 7, Tailwind, Supabase JS v2, Radix UI, Framer Motion, Recharts, jsPDF, xlsx, dan beberapa library UI/media.
- Folder saat ini bukan repository Git aktif, jadi tidak ada status commit lokal yang bisa dipakai untuk audit perubahan.
- `pg_restore` ditemukan di instalasi PostgreSQL lokal dan berhasil dipakai untuk `pg_restore --list`.
- Schema-only backup berhasil diekstrak secara lokal ke folder temp pengguna untuk analisis struktur, bukan ke database.

## Temuan Utama

1. Aplikasi masih bergantung pada Supabase lama melalui URL project dan anon/publishable key yang hard-code di source. Nilai key tidak ditulis di dokumen ini.
2. `database_schema_export.sql` tidak lengkap. Backup asli memiliki tabel tambahan yang dipakai frontend, seperti `academic_calendar`, `mmq_schedule`, `mmq_attendance`, `music_files`, dan `media_player_settings`.
3. Frontend memanggil beberapa objek yang tidak tampak di schema backup, seperti `hafalan_doa`, `hafalan_sholat`, `hafalan_surat`, `whatsapp_group_links`, dan RPC diagnostik `get_diagnostic_rls_policies`.
4. Ada Edge Function yang dipanggil frontend tetapi source function tidak tersedia di repo, terutama `manage-user`, `generate-signed-upload-url`, `backup-database`, dan `restore-database`.
5. Ada sisa branding LPQ Al-Fath Maulana pada beberapa halaman/game/TV display, file SQL, dan dokumen investigasi lama.
6. RLS pada backup terlihat sangat permisif pada banyak tabel, termasuk pola `OR true` dan read/write untuk authenticated. Ini harus didesain ulang sebelum Supabase baru dipakai produksi.

## Kesimpulan Tahap Ini

Kode frontend dapat menjadi bahan awal, tetapi website baru sebaiknya dibangun sebagai project independen dengan Supabase baru, schema yang dibersihkan, RLS baru, Edge Function baru, dan migrasi data yang dipilih secara hati-hati.
