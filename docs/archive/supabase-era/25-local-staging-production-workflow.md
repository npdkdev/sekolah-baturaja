# 25 - Local, Staging, and Production Workflow

## Status

Dokumen ini merancang alur kerja environment. Belum ada project Supabase dibuat, belum ada secret dibuat, belum ada `.env.local`, dan belum ada deploy.

## Tujuan

Mencegah kesalahan paling berbahaya:

- menulis ke database produksi lama;
- memakai service-role di frontend;
- menjalankan migration pada environment yang salah;
- memakai data asli pada local test;
- deploy sebelum test dan gate selesai.

## Environment

### Local Development

Kegunaan:

- Menulis dan menguji migration awal.
- Menguji RLS dengan akun dummy.
- Menguji Edge Function secara lokal.
- Menguji seed dummy.

Data:

- Hanya data fiktif.
- Tidak boleh memakai backup asli.
- Tidak boleh memakai password, NIK, email, RFID, atau asset asli.

Secret:

- Secret lokal dummy.
- `.env.local` tidak dibuat pada Fase 3A.
- Jika dibuat pada fase implementasi nanti, file harus tetap ignored oleh Git.

Aturan:

- Migration pertama kali diuji di local.
- Reset database lokal boleh dilakukan karena tidak berisi data asli.
- Semua log lokal tetap tidak boleh mencetak password atau token.

### Staging

Kegunaan:

- Simulasi backend baru mendekati production.
- Menguji migration dari nol.
- Menguji Auth, RLS, Storage, Edge Function, dan data dummy.
- Dry run migrasi data agregat pada fase terpisah jika disetujui.

Data:

- Awalnya hanya data dummy.
- Data asli hanya boleh masuk staging pada fase migrasi yang disetujui dan tetap melalui prosedur aman.

Secret:

- Secret staging terpisah dari production.
- Service-role staging hanya di Edge Function atau script admin aman.
- Secret tidak masuk Git.

Aturan:

- Semua migration harus lolos di staging sebelum production.
- Semua Edge Function diuji dengan role dummy.
- Test matrix harus terdokumentasi.

### Production

Kegunaan:

- Backend baru final setelah semua gate lulus.
- Tidak dipakai untuk eksperimen.

Data:

- Data asli hanya masuk setelah strategi migrasi disetujui.
- Database produksi lama tidak diubah oleh proses ini.

Secret:

- Production secret hanya di Supabase Dashboard atau secret manager.
- Service-role tidak pernah masuk frontend, repository, atau log.

Aturan:

- Tidak ada migration manual tanpa review.
- Tidak ada deploy langsung dari percobaan lokal.
- Tidak ada restore backup langsung ke production baru.
- Setiap migration production harus sudah lolos local dan staging.

## Promosi Migration

Urutan promosi:

1. Draft migration di branch lokal.
2. Review isi migration.
3. Jalankan di local.
4. Jalankan test local.
5. Jalankan di staging dari database kosong.
6. Jalankan test staging.
7. Dokumentasikan hasil.
8. Baru ajukan gate production.

Aturan promosi:

- Migration tidak diedit setelah masuk staging; buat migration koreksi baru.
- Jangan squash migration yang sudah diuji staging kecuali sebelum production dan disetujui.
- Production hanya menerima migration yang urutannya sama dengan staging.

## Penyimpanan Secret

Secret yang mungkin diperlukan:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- SMTP secret bila reset email diaktifkan nanti.
- Rate limit storage secret bila memakai provider tambahan.

Aturan:

- `SUPABASE_SERVICE_ROLE_KEY` hanya untuk server/Edge Function.
- Frontend hanya memakai anon key.
- Secret tidak ditulis ke dokumen hasil, log, atau commit.
- `.env`, `.env.local`, dan `.env.*` tetap ignored.
- `.env.example` boleh berisi nama variabel tanpa nilai.

## Pencegahan Salah Environment

Checklist sebelum command berisiko pada fase implementasi nanti:

- Pastikan nama project Supabase terlihat jelas.
- Pastikan URL bukan production lama.
- Pastikan environment target tertulis di terminal/log.
- Pastikan command tidak memakai service-role frontend.
- Pastikan backup lama tidak sedang direstore.
- Pastikan migration dijalankan hanya pada local/staging sampai gate production dibuka.

Guard teknis yang disarankan:

- Script migration meminta konfirmasi target environment.
- Script menolak URL production kecuali flag khusus disetujui.
- Script menampilkan project ref sebelum operasi.
- Script tidak menerima secret dari argumen CLI yang masuk shell history.
- Script membaca secret dari environment aman.

## Workflow Edge Function

Local:

- Tulis function.
- Jalankan unit test input validation.
- Jalankan test dengan data dummy.

Staging:

- Deploy function staging.
- Set secret staging.
- Uji role dan error handling.
- Periksa log aman.

Production:

- Deploy setelah kontrak final dan test staging lulus.
- Set secret production melalui dashboard/secret manager.
- Pantau error rate.

## Workflow Storage

Local:

- Rancang bucket dan policy.
- Uji path dummy.

Staging:

- Buat bucket staging.
- Uji upload/download dengan akun dummy.
- Uji file invalid.

Production:

- Buat bucket final hanya setelah policy staging lolos.
- Jangan migrasikan asset asli sampai gate migrasi asset dibuka.

## Workflow Data Dummy

Local:

- Seed dummy dapat direset berkali-kali.

Staging:

- Seed dummy dipakai untuk test end-to-end.
- Data dummy bisa dihapus sebelum migrasi data asli.

Production:

- Data dummy tidak boleh masuk production final, kecuali akun admin bootstrap yang memang dibutuhkan dan diberi label jelas.

## Checklist Sebelum Menulis ke Staging

- [ ] Migration sudah lolos local.
- [ ] Tidak ada data asli di seed.
- [ ] Tidak ada secret di repository.
- [ ] RLS helper sudah diuji.
- [ ] Test matrix siap dijalankan.
- [ ] Project staging benar.
- [ ] Production lama tidak disentuh.

## Checklist Sebelum Menulis ke Production Baru

- [ ] Semua migration lolos staging dari database kosong.
- [ ] Semua test Auth lulus.
- [ ] Semua test RLS lulus.
- [ ] Semua test Storage lulus.
- [ ] Semua Edge Function lulus kontrak.
- [ ] Rollback strategy tersedia.
- [ ] Backup schema-only staging tersedia bila diperlukan.
- [ ] User menyetujui gate production.

## Larangan Tetap

- Jangan push secret.
- Jangan deploy tanpa gate.
- Jangan restore backup lama langsung ke production baru.
- Jangan menulis ke database produksi lama.
- Jangan memakai data pribadi dalam dokumentasi hasil test.
- Jangan menggunakan service-role di frontend.
