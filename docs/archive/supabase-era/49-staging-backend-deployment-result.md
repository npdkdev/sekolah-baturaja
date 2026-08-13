# Hasil Deployment Backend Staging

> Arsip alur kerja yang telah disanitasi. Semua target online lama telah dihapus; dokumen ini bukan bukti deployment LPQ Al-Fath Maulana dan tidak boleh dijalankan sebelum staging baru disetujui.

Tanggal: 2026-06-25

## Ringkasan

Backend LPQ Al-Fath Maulana 2 berhasil dideploy ke Supabase staging.

Target staging:

- Project name: `LPQ Al-Fath Maulana Staging`
- Project Ref: `[PROJECT REF LAMA DIHAPUS]`
- Region: `ap-southeast-2`

Tidak ada project baru yang dibuat. Tidak ada push Git, deploy frontend, seed dummy lokal, dump/restore, akses database lama, atau sentuhan ke production.

## Verifikasi Target

`supabase projects list` menampilkan project staging yang sesuai:

- Ref: `[PROJECT REF LAMA DIHAPUS]`
- Name: `LPQ Al-Fath Maulana Staging`
- Status: `ACTIVE_HEALTHY`

Repository berhasil dilink ke project staging dengan:

```text
supabase link --project-ref PROJECT_REF_STAGING_BARU
```

Database password tidak dimasukkan ke command, file, laporan, atau Git.

## Preflight Migration

Preflight dijalankan dengan:

- `supabase migration list`
- `supabase db push --dry-run`

Hasil preflight:

- remote belum memiliki migration repository;
- tidak ada migration remote asing;
- tidak ada permintaan migration repair;
- dry-run hanya menampilkan migration dari repository;
- tidak ada seed dummy yang ikut;
- tidak ada operasi destruktif di luar migration repository.

Catatan: satu percobaan `migration list` awal sempat gagal karena dijalankan paralel dengan dry-run dan memicu race saat CLI membuat login role sementara. Setelah dijalankan ulang secara berurutan, `migration list` berhasil.

## Migration Applied

`supabase db push` berhasil menerapkan seluruh migration repository berikut:

- `20260624000100_extensions_and_types.sql`
- `20260624000200_user_profiles_and_roles.sql`
- `20260624000300_guru_santri_and_auth_aliases.sql`
- `20260624000400_classes_memberships_and_mutations.sql`
- `20260624000500_class_assignments.sql`
- `20260624000600_attendance.sql`
- `20260624000700_payments_expenses_and_payment_status.sql`
- `20260624000800_hafalan_and_murojaah.sql`
- `20260624000900_academic_calendar.sql`
- `20260624001000_mmq_core.sql`
- `20260624001100_mmq_assignments_extension.sql`
- `20260624001200_content_news_announcements_feedbacks.sql`
- `20260624001300_notifications_and_santri_notes.sql`
- `20260624001400_audit_triggers_and_updated_at.sql`
- `20260624001500_rls_helper_functions.sql`
- `20260624001600_rls_policies.sql`
- `20260624001700_storage_buckets_and_policies.sql`
- `20260624001800_indexes_and_final_constraints.sql`
- `20260624001900_move_santri_to_class_rpc.sql`
- `20260624002000_payments_period_uniqueness.sql`

Verifikasi setelah push:

- seluruh 20 migration lokal tercatat applied di remote;
- tidak ada seed dummy yang dijalankan;
- staging tetap kosong dari data aplikasi.

## Edge Function Deployed

`supabase functions deploy` berhasil mendeploy Edge Functions launch:

- `signin-with-nomor-induk`
- `manage-user`
- `reset-user-password`
- `generate-signed-upload-url`

Verifikasi `supabase functions list`:

- keempat function berstatus `ACTIVE`;
- `signin-with-nomor-induk` memakai `verify_jwt=false` sesuai kebutuhan login santri;
- function lain memakai `verify_jwt=true`.

Tidak ada secret platform bawaan Supabase yang diubah.

## Verifikasi Schema, RLS, dan Policy

Verifikasi read-only terhadap database staging:

- 25 tabel inti ditemukan;
- 1 view inti ditemukan: `payment_status_summary`;
- 25/25 tabel inti memiliki RLS aktif;
- policy public ditemukan: 59 policy;
- policy storage ditemukan: 9 policy;
- RPC `move_santri_to_class` tersedia;
- unique index `payments_active_santri_bulan_tahun_unique` tersedia.

Policy anon yang tersedia hanya untuk area publik:

- `academic_calendar` public select;
- `website_content` public select;
- `news` published select;
- `announcements` published select;
- `feedbacks` anon insert.

Tidak ada policy anon select untuk tabel privat seperti `payments`, `expenses`, atau `auth_login_aliases`.

## Verifikasi Storage

Bucket Storage staging tersedia:

| Bucket | Public | Limit |
| --- | --- | --- |
| `avatars` | false | 2 MB |
| `murojaah-recordings` | false | 25 MB |
| `website-assets` | true | 20 MB |

Storage policy terpasang sebanyak 9 policy.

Catatan warning: query detail nama policy storage sempat mengembalikan 403 dari Supabase Management API saat inisialisasi login role. Namun jumlah policy storage dan bucket berhasil diverifikasi sebelumnya, dan migration storage sudah tercatat applied.

## Verifikasi Akses Anon

Smoke test REST anon menggunakan publishable key staging:

- `news`: status 200, rows 0;
- `announcements`: status 200, rows 0;
- `santri`: status 200, rows 0 karena staging kosong dan RLS tidak membuka data;
- `payments`: status 401 untuk akses anon.

Karena staging masih kosong, pembuktian akses privat terutama mengandalkan RLS dan policy. Test data per role perlu dilakukan setelah akun dummy staging dibuat secara aman.

## Pemeriksaan Data Staging

Jumlah data staging setelah migration:

- `auth.users`: 0;
- `user_profiles`: 0;
- `guru`: 0;
- `santri`: 0;
- `classes`: 0;
- `attendance`: 0;
- `payments`: 0;
- `expenses`: 0;
- `website_content`: 0;
- `news`: 0;
- `announcements`: 0;
- `feedbacks`: 0.

Kesimpulan:

- tidak ada data asli;
- tidak ada seed dummy lokal;
- tidak ada akun dummy staging;
- tidak ada data lama.

## Frontend Staging

File lokal ignored dibuat:

- `.env.staging.local`

Isi konseptual:

```env
VITE_SUPABASE_URL=https://PROJECT_REF_STAGING_BARU.supabase.co
VITE_SUPABASE_ANON_KEY=<STAGING_PUBLISHABLE_KEY>
VITE_ENABLE_EDGE_FUNCTIONS=true
VITE_ENABLE_DEFERRED_FEATURES=false
```

Pemeriksaan:

- `.env.staging.local` diabaikan Git oleh `.gitignore`;
- `.env.local` development tidak diganti;
- tidak ada secret key atau service-role key di frontend;
- publishable key tidak dicetak penuh di laporan.

Frontend belum dideploy.

## Validasi Akhir

| Pemeriksaan | Hasil |
| --- | --- |
| Build frontend lokal | Lulus |
| `git diff --check` | Lulus |
| No-secret scan | Lulus |
| `.env.staging.local` ignored | Lulus |
| `git status --short` | Hanya laporan ini yang belum dikomit |

## Warning dan Catatan

- PowerShell profile lokal selalu menampilkan warning modul `Microsoft.WinGet.CommandNotFound`; ini tidak mempengaruhi deployment.
- Query detail nama policy storage terkena 403 Management API setelah deployment. Verifikasi storage tetap cukup untuk tahap ini karena bucket, jumlah policy storage, dan migration applied sudah terbukti.
- Staging belum memiliki akun dummy. Auth, RLS per role, dan Edge Function yang membutuhkan user belum bisa diuji end-to-end sampai akun dummy staging dibuat.

## Percobaan Validasi E2E Staging

Percobaan lanjutan validasi end-to-end staging dihentikan pada tahap audit target, sebelum bootstrap akun/data dummy.

Perintah yang dijalankan:

- `git status --short`
- `supabase projects list`
- `supabase migration list`
- `supabase functions list`

Hasil:

- `git status --short` hanya menampilkan laporan ini sebagai file belum dikomit;
- `supabase projects list` tidak menampilkan project `[PROJECT REF LAMA DIHAPUS]`;
- project yang muncul pada CLI bukan `LPQ Al-Fath Maulana Staging`;
- `supabase migration list` mengembalikan 403;
- `supabase functions list` mengembalikan 403.

Keputusan keamanan:

- tidak membuat script bootstrap staging;
- tidak meminta service-role key;
- tidak membuat akun admin dummy;
- tidak membuat data dummy staging;
- tidak menjalankan test API/browser staging;
- tidak menjalankan migration, deploy ulang, seed, reset, restore, atau repair.

Alasan: akun/profile Supabase CLI yang aktif saat percobaan E2E tidak memiliki akses yang cocok ke project staging `[PROJECT REF LAMA DIHAPUS]`. Melanjutkan bootstrap atau test terhadap remote pada kondisi ini berisiko menyasar project yang salah.

## Percobaan Validasi E2E Staging Kedua

Setelah login CLI diperbaiki, gate awal berhasil:

- `supabase projects list` menampilkan `LPQ Al-Fath Maulana Staging` dengan ref `[PROJECT REF LAMA DIHAPUS]`;
- 20 migration repository masih tercatat applied;
- 4 Edge Function launch masih deployed dan aktif:
  - `signin-with-nomor-induk`;
  - `manage-user`;
  - `reset-user-password`;
  - `generate-signed-upload-url`.

Script bootstrap staging yang aman dibuat:

- `scripts/bootstrap-staging-test-data.ps1`

Karakteristik script:

- hanya menerima target `https://PROJECT_REF_STAGING_BARU.supabase.co`;
- meminta staging service-role key melalui input tersembunyi;
- meminta password dummy sementara melalui input tersembunyi;
- tidak menyimpan atau mencetak secret/password;
- membuat admin dummy lewat Supabase Admin Auth API;
- memakai session admin untuk memanggil Edge Function `manage-user` bagi guru, pentashih, dan santri;
- membuat data dummy minimal bertanda staging;
- idempotent untuk target dummy yang sama;
- tidak memakai database password;
- tidak melakukan reset, seed lokal, migration, restore, atau deploy ulang.

Script lulus parse/syntax PowerShell secara statis.

Percobaan menjalankan script melalui proses PowerShell interaktif dari Codex tidak selesai dalam batas waktu tool. Karena Codex tool tidak menyediakan input terminal tersembunyi yang bisa dikendalikan dengan aman pada sesi ini, secret tidak dimasukkan dan bootstrap tidak dapat dikonfirmasi selesai.

Setelah timeout, query read-only database melalui Supabase Management API kembali mengembalikan 403. Karena itu:

- akun dummy staging belum dapat diverifikasi;
- data dummy staging belum dapat diverifikasi;
- test API per role belum dijalankan;
- browser smoke test staging belum dijalankan.

Keputusan keamanan:

- tidak meminta secret di chat;
- tidak menyimpan secret di environment permanen, file, script, laporan, atau Git;
- tidak menjalankan bootstrap dengan argumen command-line berisi secret;
- tidak menjalankan test yang berisiko menyasar target yang tidak terverifikasi.

## Langkah Berikutnya

Langkah aman berikutnya adalah memastikan Supabase CLI kembali login ke akun/organization yang menampilkan project `LPQ Al-Fath Maulana Staging` dengan ref `[PROJECT REF LAMA DIHAPUS]`.

Rekomendasi:

1. Jalankan ulang login Supabase CLI bila perlu.
2. Ulangi `supabase projects list`.
3. Lanjutkan hanya jika project `LPQ Al-Fath Maulana Staging` dengan ref `[PROJECT REF LAMA DIHAPUS]` tampil.
4. Jalankan `scripts/bootstrap-staging-test-data.ps1` dari terminal interaktif pengguna, bukan dari argumen command-line berisi secret.
5. Masukkan service-role key staging dan password dummy melalui prompt tersembunyi script.
6. Setelah bootstrap selesai, jalankan query agregat untuk memastikan akun/data dummy staging sudah ada.
7. Jalankan test API/RLS per role dan browser smoke test staging.
8. Jika semua lulus, commit laporan dan script bootstrap staging sesuai scope yang disetujui.

## Percobaan Validasi E2E Staging Ketiga

Setelah bootstrap data dummy staging dilaporkan berhasil dari terminal pengguna, validasi E2E dicoba ulang dari terminal Codex.

Perintah awal:

- `git status --short`;
- cek environment proses untuk password dummy sementara;
- `supabase projects list`;
- query read-only agregat via `supabase db query --linked`.

Hasil:

- password dummy tidak tersedia di environment proses Codex;
- `supabase projects list` pada terminal Codex kembali tidak menampilkan project `[PROJECT REF LAMA DIHAPUS]`;
- project yang tampil adalah project lain;
- query read-only database linked mengembalikan 403 Management API.

Sesuai instruksi, proses mencoba membersihkan environment token:

```text
Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
```

Lalu `supabase projects list`, `supabase migration list`, dan `supabase functions list` dijalankan ulang.

Hasil ulang:

- project `LPQ Al-Fath Maulana Staging` dengan ref `[PROJECT REF LAMA DIHAPUS]` tetap tidak muncul pada terminal Codex;
- `migration list` masih 403;
- `functions list` masih 403.

Keputusan keamanan:

- test API/RLS staging tidak dijalankan;
- test browser staging tidak dijalankan;
- tidak ada write ke staging;
- tidak ada deploy ulang migration atau Edge Function;
- tidak ada commit otomatis.

Alasan: target staging tidak dapat diverifikasi dari terminal Codex yang aktif. Melanjutkan test dengan konteks CLI yang salah berisiko menyasar project lain.

Catatan: script bootstrap staging sudah tersedia dan sudah diperbaiki untuk secret key format baru, tetapi validasi E2E dari Codex masih menunggu konteks Supabase CLI yang benar pada terminal Codex.

## Runner Manual E2E Staging

Karena terminal Codex memakai konteks kredensial Supabase yang berbeda dari PowerShell user, validasi E2E staging disiapkan sebagai runner manual yang tidak bergantung pada Supabase CLI.

Runner dibuat:

- `scripts/run-staging-e2e-tests.ps1`

Karakteristik runner:

- target dikunci ke `https://PROJECT_REF_STAGING_BARU.supabase.co`;
- menolak project ref selain `[PROJECT REF LAMA DIHAPUS]`;
- membaca publishable key dari `.env.staging.local`;
- meminta staging secret/service-role key melalui input tersembunyi;
- meminta password dummy staging melalui input tersembunyi;
- mendukung secret key baru `sb_secret_...` sebagai header `apikey` tanpa `Authorization`;
- mendukung legacy service-role JWT sebagai `apikey` plus `Authorization: Bearer`;
- menolak `sbp_...`, `sb_publishable_...`, anon key, dan connection string sebagai secret/service-role key;
- tidak menjalankan migration, deploy, reset, restore, atau seed ulang;
- tidak memakai `supabase projects list`, `migration list`, atau kredensial CLI.

Test yang dicakup runner:

- login admin;
- login guru;
- login pentashih;
- login santri via `signin-with-nomor-induk`;
- role dari `user_profiles`;
- anon ditolak membaca data privat;
- anon membaca news/announcements published;
- anon tidak membaca draft;
- feedback publik insert, tetapi anon tidak dapat list;
- guru membaca kelasnya;
- pentashih membaca assignment;
- santri hanya membaca data sendiri;
- admin mencatat absensi RFID dummy;
- absensi duplikat ditolak;
- pembayaran pertama berhasil;
- pembayaran periode sama ditolak;
- guru hanya membaca `payment_status_summary`;
- guru ditolak membaca detail `payments`;
- admin membuat dan soft-delete expense dummy;
- expense soft-deleted tidak ikut rekap aktif;
- RPC `move_santri_to_class` hanya berhasil untuk admin;
- signed upload avatar dibuat;
- `website-assets` public endpoint dapat diakses;
- reset password ditolak bagi role non-admin.

Runner belum dijalankan dari Codex karena instruksi melarang akses staging dari terminal Codex. Verifikasi lokal Codex yang dilakukan:

- PowerShell syntax check: lulus;
- self-test lokal tanpa request staging: lulus;
- static review header dan target: selesai;
- no-secret scan: lulus;
- `git diff --check`: lulus.

Perintah manual untuk user:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/run-staging-e2e-tests.ps1
```

## Hasil Final Validasi E2E Staging

Validasi manual terbaru dari PowerShell user berhasil penuh:

```text
SUMMARY passed=25 failed=0
```

Status final staging:

- 20 migration repository sudah applied di project staging;
- 4 Edge Function launch sudah deployed:
  - `signin-with-nomor-induk`;
  - `manage-user`;
  - `reset-user-password`;
  - `generate-signed-upload-url`;
- bootstrap akun dan data dummy staging berhasil;
- akun dan data dummy staging tetap dipertahankan untuk pengujian frontend berikutnya;
- tidak ada data asli yang dimasukkan ke staging;
- frontend belum dideploy.

Validasi Auth yang lulus:

- login admin berhasil;
- login guru berhasil;
- login pentashih berhasil;
- login santri berhasil melalui Nomor Induk Qiroati dummy;
- role terbaca dari `user_profiles`.

Validasi API, RLS, dan data publik yang lulus:

- anon ditolak membaca data privat;
- berita published dapat dibaca publik;
- pengumuman published dapat dibaca publik;
- draft berita/pengumuman tidak tampil untuk publik;
- feedback publik dapat dikirim, tetapi daftar feedback tidak bisa dibaca anon;
- guru hanya membaca data kelasnya;
- pentashih hanya membaca assignment-nya;
- santri hanya membaca data sendiri.

Validasi fitur operasional staging yang lulus:

- absensi RFID dummy berhasil dicatat;
- absensi duplikat ditolak;
- pembayaran pertama berhasil;
- pembayaran periode sama ditolak;
- guru hanya membaca status pembayaran;
- guru ditolak membaca detail `payments`;
- pengeluaran dummy berhasil dibuat dan soft-delete;
- pengeluaran soft-deleted tidak ikut rekap aktif;
- RPC `move_santri_to_class` hanya berhasil untuk admin;
- signed upload avatar berhasil dibuat;
- `website-assets` public read berhasil;
- reset password ditolak bagi role non-admin.

Verifikasi keamanan Git:

- tidak ada password dummy di Git;
- tidak ada secret key di Git;
- tidak ada service-role key di Git;
- tidak ada access token atau session di Git;
- `.env.staging.local` tetap ignored;
- script staging hanya meminta secret/password melalui input tersembunyi saat dijalankan.

Kesimpulan: backend Supabase staging siap dipakai untuk pengujian frontend staging lokal. Langkah berikutnya adalah menjalankan frontend lokal dengan `.env.staging.local`, melakukan browser smoke test terhadap data dummy staging, lalu baru memutuskan apakah staging frontend siap dideploy.

## Konfirmasi Keamanan

- Tidak ada database password yang dicetak atau disimpan.
- Tidak ada access token, secret key, service-role key, session, atau connection string penuh yang dicetak atau disimpan.
- Tidak ada data asli yang digunakan.
- Tidak ada seed dummy lokal yang dijalankan ke staging.
- Tidak ada `.env.staging.local` yang dikomit.
- Tidak ada `.env.local` yang diubah.
- Tidak ada project production yang disentuh.
- Tidak ada database lama yang diakses.
- Tidak ada push Git.
- Tidak ada deploy frontend.
