# 19 - Data Migration Strategy

## Tujuan

Migrasi data dari backup lama ke Supabase baru harus bertahap, aman, dan bisa divalidasi tanpa menampilkan data pribadi di laporan.

Fase 2 ini belum melakukan restore, belum menjalankan SQL, dan belum memindahkan data.

Seluruh keputusan migrasi Fase 2 pada dokumen ini sudah final.

## Data yang Dimigrasikan

Data inti:

- santri
- guru
- kelas
- relasi kelas aktif dan riwayat kelas
- RFID
- pembayaran
- absensi
- hafalan
- murojaah
- kalender akademik
- MMQ
- konten resmi website
- asset resmi

## Data yang Tidak Dimigrasikan

Jangan migrasikan:

- password plaintext lama
- RLS policy lama
- login logs lama
- visitor stats lama
- session/token lama
- file Storage yatim
- feedback lama
- data forum/journey/music/game/quiz/top score/random name pada fase inti

## Prinsip Migrasi

1. **Schema baru dibuat dulu**
   Jangan restore backup lama langsung ke Supabase baru.

2. **Data dummy diuji dulu**
   RLS dan Auth diuji dengan akun dummy sebelum data asli masuk.

3. **Migrasi identitas harus hati-hati**
   Karena `santri.id` dan `guru.id` direkomendasikan sama dengan `auth.users.id`, pembuatan akun Auth harus menjadi bagian dari proses migrasi.

4. **Tidak menampilkan data pribadi**
   Laporan migrasi hanya berisi jumlah record, jumlah error, dan kategori masalah.

5. **Migrasi asset dipisah**
   File Storage resmi dipindahkan setelah bucket dan policy siap.

## Tahapan Migrasi

### Tahap 0 - Persiapan

- Buat project Supabase baru.
- Terapkan schema dan RLS baru.
- Buat bucket storage.
- Buat Edge Function yang diperlukan.
- Buat akun dummy untuk semua role.
- Uji RLS sampai lolos.

### Tahap 1 - Ekstraksi Read-Only Lokal

- Baca backup lama di lingkungan lokal, bukan database produksi lama.
- Ekstrak data ke format staging lokal.
- Jangan mencetak NIK, nomor KK, nomor HP, alamat, password, atau token.

Output aman:

- jumlah santri
- jumlah guru
- jumlah kelas
- jumlah pembayaran
- jumlah absensi
- jumlah item hafalan
- jumlah asset resmi

### Tahap 2 - Mapping Identitas

Untuk guru/pentashih:

- buat user Supabase Auth baru;
- buat `user_profiles`;
- buat `guru`.

Untuk santri:

- buat user Supabase Auth baru;
- buat `user_profiles`;
- buat `santri`;
- buat `auth_login_aliases`;
- jangan import password lama.

Password awal:

- dibuat oleh admin melalui Supabase Auth;
- diserahkan kepada santri/wali melalui prosedur operasional lembaga;
- tidak dicetak di laporan migrasi;
- tidak disimpan pada tabel aplikasi.

Catatan:

- Santri tetap login dengan Nomor Induk Qiroati sebagai username dan password.
- Email internal hanya dipakai sebagai identifier teknis Supabase Auth dan tidak ditampilkan kepada santri/wali.
- Nomor Induk Qiroati harus mengikuti format resmi lembaga, unik, konsisten, tanpa spasi, dan disimpan sebagai `text`.

### Tahap 3 - Data Akademik

Urutan:

1. `classes`
2. `santri.current_class_id`
3. `class_memberships`
4. `class_mutations`
5. `jilid_history`
6. `academic_calendar`

Validasi:

- jumlah kelas sama dengan sumber.
- semua santri aktif punya class membership sesuai data lama jika tersedia.
- tidak ada membership aktif ganda.

### Tahap 4 - Absensi

Migrasi:

- `attendance`
- `mmq_schedule`
- `mmq_attendance`
- `mmq_notulensi`

Validasi:

- jumlah absensi per bulan.
- jumlah absensi guru/santri.
- tidak ada duplicate fatal pada `(user_id, date, sesi)`.

### Tahap 5 - Hafalan dan Murojaah

Migrasi:

- `hafalan_items`
- `hafalan_progress`
- `murojaah_submissions`
- `santri_notes`

Validasi:

- jumlah item per kategori.
- jumlah progress per santri secara agregat.
- submission tanpa santri valid masuk daftar error, bukan dipaksa masuk.

### Tahap 6 - Keuangan

Migrasi:

- `payments`
- `expenses`

Validasi:

- total jumlah pembayaran per tahun/bulan.
- total pengeluaran per bulan.
- jumlah pembayaran per status.

Catatan:

- Jangan tampilkan nama santri atau detail transaksi pribadi di laporan publik.

### Tahap 7 - Konten dan Asset

Migrasi:

- `website_content`
- `news`
- `announcements`
- asset resmi di storage

Tidak dimigrasikan:

- feedback lama

Validasi:

- jumlah konten.
- jumlah asset resmi.
- URL lama tidak tersisa pada konten final.

## Validasi Tanpa Data Pribadi

Contoh laporan aman:

```text
santri: 320 sumber, 320 target, 0 gagal
guru: 24 sumber, 24 target, 0 gagal
payments 2025: 1450 sumber, 1450 target, selisih total Rp 0
attendance 2025-01: 5120 sumber, 5120 target
```

Yang tidak boleh masuk laporan:

- nama lengkap
- NIK
- nomor KK
- alamat
- nomor HP
- password
- token
- foto pribadi
- password awal

## Strategi Rollback

Sebelum migrasi data asli:

- backup project Supabase baru yang masih kosong/schema-only.
- jalankan migrasi ke environment staging bila memungkinkan.
- jika migrasi gagal, hapus data target di project baru/staging dan ulang dari awal.

Jangan rollback dengan mengubah database produksi lama.

## Checklist Sebelum Migrasi Data Asli

- [ ] Schema baru disetujui.
- [ ] RLS diuji dengan akun dummy.
- [ ] Edge Function auth siap.
- [ ] Bucket storage siap.
- [ ] Prosedur admin untuk membuat dan menyerahkan password awal santri siap.
- [ ] Script migrasi tidak mencetak data pribadi.
- [ ] Validasi agregat disiapkan.
- [ ] Backup lama tetap lokal dan tidak masuk Git.
