# Hasil Validasi Release Candidate Lokal

Tanggal: 2026-06-25

## Ringkasan

Validasi release candidate lokal dilakukan setelah commit integrasi konten publik `00905ee feat: integrate public news announcements and feedback`.

Hasil umum: aplikasi lokal siap dilanjutkan ke tahap Supabase staging online, dengan catatan staging harus tetap diuji ulang memakai data dummy/staging dan bukan langsung production.

Tidak ada fitur baru, deployment, `supabase link`, Supabase online, atau akses database lama yang dilakukan pada tahap ini.

## Validasi Otomatis

| Pemeriksaan | Hasil |
| --- | --- |
| `supabase db reset` | Lulus |
| Bootstrap Auth dummy lokal | Lulus |
| Seed dummy lokal | Lulus |
| Backend runner | Lulus, 49/49 |
| Public content smoke test | Lulus, 13/13 |
| Release candidate API smoke test | Lulus, 13/13 setelah test harness disesuaikan ke schema aktual |
| Browser smoke test | Lulus, 16/16 |
| `npm run build` | Lulus |
| `git diff --check` | Lulus |
| No-secret scan | Lulus |
| Scan runtime object legacy | Lulus untuk file runtime |
| Scan URL Supabase lama pada runtime | Tidak ditemukan |
| `.env.local` ignored | Lulus |

## Validasi Browser

Skenario browser yang lulus:

- halaman publik dapat dibuka tanpa login;
- berita published tampil di daftar dan detail;
- pengumuman published tampil di daftar dan detail;
- halaman kontak tetap bekerja setelah refresh;
- login admin berhasil dan dashboard admin tampil;
- login guru berhasil dan dashboard guru tampil;
- login pentashih berhasil dan dashboard pentashih tampil;
- login santri berhasil dan dashboard santri tampil;
- refresh mempertahankan session untuk role yang diuji;
- anon ditolak dari `/dashboard`;
- route deferred seperti `/forum` tidak membuka fitur aktif.

## Bug Yang Ditemukan dan Diperbaiki

Tidak ada bug source baru yang perlu diperbaiki pada tahap release candidate ini.

Masalah yang muncul adalah masalah runtime lokal dan test harness:

- Docker/Supabase lokal sempat belum siap sehingga beberapa endpoint mengembalikan error sementara. Diselesaikan dengan menjalankan ulang stack lokal, lalu bootstrap Auth dummy dan seed.
- Test API awal memakai beberapa nama kolom/status lama. Test disesuaikan ke schema aktual tanpa mengubah source aplikasi.
- View `payment_status_summary` benar hanya mengekspos `santri_id`, `class_id`, `bulan`, `tahun`, dan `status`; tidak ada nominal, metode, catatan, atau transaction ID yang terbuka untuk guru.

## Fitur Yang Siap Secara Lokal

- halaman publik;
- Auth resmi dan session recovery;
- dashboard admin, guru, santri, dan pentashih;
- Data Master;
- mutasi kelas atomik;
- Absensi RFID;
- pembayaran inti;
- pengeluaran dan arus kas admin;
- operasional akademik inti;
- MMQ inti;
- avatar dan website assets;
- berita, pengumuman, feedback, dan konten global;
- TV Display;
- export Excel/PDF terdeteksi tersedia dan build lulus.

## Fitur Deferred

Fitur berikut tetap nonaktif melalui feature flag atau route guard:

- forum;
- journey;
- music player;
- game/gatcha;
- quiz;
- top score;
- random name;
- backup/restore UI.

## Catatan Risiko Tersisa

- `supabase_vector` masih restart loop pada lingkungan lokal. Ini dicatat sebagai non-blocker observability karena Auth, REST, Storage, RLS, Edge Function, dan test inti lulus.
- Beberapa file arsip/dokumen lama di dalam repository masih memuat nama tabel legacy atau referensi historis. Scan runtime `.js/.jsx/.ts/.tsx`, `index.html`, dan `public` tidak menemukan object legacy aktif.
- Export Excel/PDF sudah lolos build dan jalurnya tersedia, tetapi perlu satu sesi klik manual penuh saat staging untuk memastikan file hasil unduhan sesuai format akhir.
- Staging online tetap perlu validasi ulang RLS, Storage policy, Edge Function secret, domain, dan email Auth sebelum mendekati production.

## Rekomendasi

Aplikasi aman dilanjutkan ke Supabase staging online sebagai tahap berikutnya.

Jangan langsung ke production. Buat project staging baru, jalankan migration secara bersih, isi data dummy/staging, konfigurasi Edge Function dan Storage, lalu ulangi backend runner, smoke test frontend, dan uji browser per role sebelum migrasi data asli.

## Status Git

Sebelum laporan ini dibuat, worktree bersih setelah commit konten publik. Laporan ini sengaja belum dikomit agar bisa ditinjau terlebih dahulu.
