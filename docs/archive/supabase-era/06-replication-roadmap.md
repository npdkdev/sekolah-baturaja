# 06 - Replication Roadmap

## Tujuan

Membangun LPQ Al-Fath Maulana 2 sebagai website independen, bukan sekadar mengganti URL Supabase di hasil export lama.

## Fase 0 - Bekukan dan Amankan Sumber Lama

Status: tahap analisis ini.

Langkah:

1. Simpan backup lama di folder privat, jangan upload ke layanan eksternal.
2. Jangan restore ke produksi.
3. Jangan memakai service-role key di frontend.
4. Dokumentasikan struktur dan risiko.
5. Pastikan semua orang paham bahwa data lama masih sensitif.

## Fase 1 - Bersihkan Konfigurasi Frontend

Tujuan: mencegah frontend baru tersambung ke Supabase lama secara tidak sengaja.

Langkah:

1. Pindahkan Supabase URL/key ke `.env.local`.
2. Buat `.env.example`.
3. Hapus client Supabase ganda atau pilih satu lokasi resmi.
4. Ganti semua asset URL lama dengan placeholder lokal/sementara.
5. Hapus atau nonaktifkan fitur yang memanggil Edge Function belum tersedia.

Output:

- Frontend bisa jalan tanpa menyentuh project lama.
- Koneksi backend dikendalikan environment.

## Fase 2 - Rancang Schema Supabase Baru

Tujuan: membuat schema bersih berdasarkan kebutuhan nyata frontend.

Langkah:

1. Pakai backup sebagai referensi struktur, bukan sebagai script mentah.
2. Buat migration SQL baru:
   - tabel inti: `santri`, `guru`, `classes`, `attendance`, `payments`, `expenses`;
   - konten: `website_content`, `feedbacks`, forum, news/announcements jika tetap diperlukan;
   - akademik: `hafalan_items`, `hafalan_progress`, `murojaah_submissions`, `academic_calendar`;
   - MMQ: `mmq_schedule`, `mmq_attendance`, `mmq_notulensi`;
   - media: `music_files`, `media_player_settings`.
3. Putuskan apakah tabel legacy `hafalan_doa`, `hafalan_sholat`, `hafalan_surat` akan dibuat atau kode dirapikan ke `hafalan_progress`.
4. Buat bucket Storage: `avatars`, `website-assets`, `music-files`, dan bila perlu `murojaah-recordings`.

Output:

- Schema baru yang bisa dibaca pemula dan diuji.

## Fase 3 - Desain Auth dan RLS Baru

Tujuan: role aman sebelum data asli masuk.

Langkah:

1. Tentukan role final: `admin`, `guru`, `santri`, mungkin `pentashih`.
2. Tentukan model login santri:
   - opsi aman: akun Supabase Auth per santri;
   - opsi alternatif: Edge Function login internal dengan token valid;
   - hindari mock session.
3. Tulis RLS per tabel:
   - anon hanya konten publik;
   - santri hanya data sendiri;
   - guru hanya santri/kelas terkait;
   - admin semua data operasional;
   - storage sesuai folder dan role.
4. Uji dengan akun dummy.

Output:

- RLS test matrix lulus sebelum migrasi data.

## Fase 4 - Rebuild Edge Function

Tujuan: mengganti fungsi server lama yang tidak ada di repo.

Function prioritas:

1. `manage-user` untuk create/update/delete user Auth.
2. `generate-signed-upload-url` untuk upload aman.
3. Backup/export baru yang read-only dan redacted bila perlu.
4. Restore/import hanya untuk admin dan lingkungan staging.

Output:

- Fitur admin tidak lagi bergantung pada Edge Function Supabase lama.

## Fase 5 - Seed Data Non-Sensitif

Tujuan: membuat frontend bisa diuji tanpa data asli.

Langkah:

1. Isi konten website dummy.
2. Buat akun admin/guru/santri dummy.
3. Buat kelas dan absensi dummy.
4. Uji halaman publik, dashboard, pembayaran dummy, MMQ, game, dan upload.

Output:

- Website dapat diuji end-to-end tanpa data asli.

## Fase 6 - Migrasi Data Asli Bertahap

Tujuan: memindahkan data lama dengan aman.

Urutan aman:

1. Migrasi master kecil: kelas, guru, konten dasar.
2. Migrasi santri tanpa field yang tidak dibutuhkan.
3. Migrasi relasi kelas.
4. Migrasi pembayaran.
5. Migrasi absensi.
6. Migrasi hafalan dan murojaah.
7. Migrasi foto/Storage setelah policy benar.

Catatan:

- Lakukan di staging dulu.
- Validasi jumlah record, bukan menampilkan data pribadi.
- Jangan impor password plaintext lama.

## Fase 7 - Cutover Produksi

Langkah:

1. Freeze perubahan pada sistem lama pada waktu yang disepakati.
2. Backup terakhir dari database lama.
3. Migrasi delta.
4. Uji smoke test role admin/guru/santri.
5. Update DNS/deployment.
6. Pantau error dan log.

## Prioritas Paling Aman

1. Environment dan koneksi Supabase.
2. Schema baru.
3. RLS/Auth.
4. Edge Function.
5. Dummy data.
6. Migrasi data asli.
7. Launch.
