# 23 - Backend Test Matrix

## Status

Dokumen ini merancang test backend. Belum ada test dijalankan, belum ada Supabase project dibuat, dan belum ada SQL dijalankan.

Test wajib memakai data dummy fiktif. Jangan memakai data dari backup lama.

## Akun Dummy

Minimal akun dummy:

| Alias | Role | Relasi |
|---|---|---|
| `admin_demo` | admin | akses penuh |
| `guru_a_demo` | guru | mengampu `kelas_a` |
| `guru_b_demo` | guru | mengampu `kelas_b` |
| `pentashih_demo` | pentashih | assignment `kelas_a` atau MMQ A |
| `santri_a1_demo` | santri | anggota `kelas_a` |
| `santri_a2_demo` | santri | anggota `kelas_a` |
| `santri_b1_demo` | santri | anggota `kelas_b` |
| `anon` | anon | tidak login |

Nomor induk, email, RFID, dan nama harus fiktif.

## Auth Test Matrix

| Kasus | Langkah | Ekspektasi |
|---|---|---|
| Admin login benar | Login email/password admin | Session Supabase Auth resmi dibuat. |
| Guru login benar | Login email/password guru | Session aktif dan role `guru` terbaca. |
| Pentashih login benar | Login email/password pentashih | Session aktif dan role `pentashih` terbaca. |
| Santri login benar | Panggil `signin-with-nomor-induk` dengan nomor induk + password benar | Session Supabase Auth resmi dikembalikan. |
| Santri password salah | Panggil function dengan password salah | Error generik, tidak membocorkan apakah nomor induk valid. |
| Nomor induk tidak ada | Panggil function dengan nomor induk fiktif tak terdaftar | Error generik sama seperti password salah. |
| Akun nonaktif | Login akun status inactive | Ditolak dengan pesan aman. |
| Rate limit | Banyak percobaan login gagal | Request berikutnya ditolak sementara. |
| Password log | Periksa log function | Password tidak muncul di log. |
| Email internal tersembunyi | Login santri berhasil | Response tidak menampilkan email internal kecuali field Supabase Auth yang memang wajib dan sudah diputuskan aman. |
| JWT custom | Periksa response function | Tidak ada token custom selain session Supabase Auth resmi. |

## RLS Test Matrix

### `user_profiles`

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | gagal | gagal | gagal | gagal |
| admin | semua | boleh | boleh | boleh sesuai policy |
| guru | sendiri | gagal | kolom aman sendiri saja jika disediakan | gagal |
| santri | sendiri | gagal | gagal atau kolom aman via function | gagal |
| pentashih | sendiri | gagal | kolom aman sendiri saja jika disediakan | gagal |

### `santri`

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | gagal | gagal | gagal | gagal |
| admin | semua | boleh | boleh | soft delete/hard delete sesuai prosedur admin |
| guru | hanya kelasnya | gagal | hanya data akademik aman kelasnya | gagal |
| santri | hanya dirinya | gagal | tidak bebas update data sensitif | gagal |
| pentashih | hanya assignment | gagal | sesuai assignment jika disetujui | gagal |

Kasus wajib:

- `guru_a_demo` gagal membaca `santri_b1_demo`.
- `santri_a1_demo` gagal membaca `santri_a2_demo`.
- `pentashih_demo` gagal membaca kelas non-assignment.

### `guru`

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | gagal | gagal | gagal | gagal |
| admin | semua | boleh | boleh | sesuai prosedur |
| guru | profil sendiri dan guru terkait | gagal | profil aman sendiri | gagal |
| santri | guru kelasnya | gagal | gagal | gagal |
| pentashih | guru terkait assignment | gagal | profil aman sendiri | gagal |

### `classes` dan `class_memberships`

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | gagal | gagal | gagal | gagal |
| admin | semua | boleh | boleh | boleh sesuai policy |
| guru | kelas dan membership yang diampu | gagal | gagal kecuali fitur khusus | gagal |
| santri | kelas/membership sendiri | gagal | gagal | gagal |
| pentashih | kelas/membership assignment | gagal | gagal | gagal |

Kasus wajib:

- Membership aktif ganda ditolak.
- Santri tanpa membership aktif ditandai sebagai data error pada validasi, bukan diberi akses sembarang.

### `attendance`

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | gagal | gagal | gagal | gagal |
| admin | semua | boleh | boleh | boleh jika policy admin mengizinkan |
| guru | kelasnya dan dirinya | kelasnya/dirinya | koreksi kelasnya dengan alasan | gagal |
| santri | sendiri | gagal kecuali kiosk/function khusus | gagal | gagal |
| pentashih | assignment | sesuai scope jika ada | sesuai scope jika ada | gagal |

Kasus wajib:

- Guru koreksi absensi kelas lain gagal.
- Koreksi tanpa `correction_reason` ditolak jika diwajibkan.
- Duplicate `(user_id, attendance_date, sesi)` ditolak jika constraint aktif.

### `payments` dan `payment_status_summary`

| Role | `payments` SELECT | `payment_status_summary` SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|---|
| anon | gagal | gagal | gagal | gagal | gagal |
| admin | semua detail | semua status | boleh | boleh | boleh |
| guru | gagal | hanya status kelasnya | gagal | gagal | gagal |
| santri | pembayaran sendiri | status sendiri | gagal | gagal | gagal |
| pentashih | gagal | gagal | gagal | gagal | gagal |

Kasus wajib:

- Guru hanya melihat `Lunas` atau `Belum Lunas`.
- Guru tidak melihat `jumlah`, `metode_pembayaran`, `catatan`, `transaction_id`.
- Hanya admin dapat delete pembayaran.
- Santri A gagal membaca pembayaran Santri B.

### `expenses`

| Role | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | gagal | gagal | gagal | gagal |
| admin | semua | boleh | boleh | boleh |
| guru | gagal | gagal | gagal | gagal |
| santri | gagal | gagal | gagal | gagal |
| pentashih | gagal | gagal | gagal | gagal |

### Hafalan dan Murojaah

| Tabel | Admin | Guru | Santri | Pentashih | Anon |
|---|---|---|---|---|---|
| `hafalan_items` | ALL | SELECT | SELECT | SELECT | gagal |
| `hafalan_progress` | ALL | SELECT/INSERT/UPDATE kelasnya | SELECT sendiri | SELECT assignment | gagal |
| `murojaah_submissions` | ALL | SELECT/UPDATE kelasnya atau target dirinya | SELECT/INSERT sendiri | SELECT assignment | gagal |

Kasus wajib:

- Guru B gagal update progress santri kelas A.
- Santri gagal insert submission atas nama santri lain.
- Pentashih hanya membaca assignment.

### MMQ

| Tabel | Admin | Guru | Santri | Pentashih | Anon |
|---|---|---|---|---|---|
| `mmq_schedule` | ALL | SELECT aktif | gagal | SELECT assignment | gagal |
| `mmq_attendance` | ALL | SELECT/INSERT sendiri | gagal | SELECT assignment | gagal |
| `mmq_notulensi` | ALL | INSERT jika notulen | gagal | SELECT assignment | gagal |

### Notes dan Notifications

| Tabel | Admin | Guru | Santri | Pentashih | Anon |
|---|---|---|---|---|---|
| `santri_notes` | ALL | kelasnya | gagal untuk catatan internal | assignment | gagal |
| `notifications` | ALL | sendiri | sendiri | sendiri | gagal |

Kasus wajib:

- User hanya update `is_read` notifikasi sendiri.
- Santri tidak membaca catatan internal guru.

### Content

| Tabel | Anon | Admin | Authenticated |
|---|---|---|---|
| `website_content` | SELECT public | ALL | SELECT public |
| `news` | SELECT published | ALL | SELECT published |
| `announcements` | SELECT published | ALL | SELECT published |
| `feedbacks` | INSERT only | ALL | INSERT own request only jika disediakan |

Kasus wajib:

- Draft news tidak terbaca anon.
- Feedback anon tidak dapat SELECT daftar feedback.

## Storage Test Matrix

### `avatars`

| Kasus | Ekspektasi |
|---|---|
| Santri upload `santri/<own_uid>/profile.webp` | berhasil |
| Santri upload `santri/<other_uid>/profile.webp` | gagal |
| Santri hapus avatar sendiri | berhasil |
| Guru upload avatar sendiri `guru/<own_uid>/profile.webp` | berhasil |
| Guru update avatar santri kelasnya | berhasil |
| Guru update avatar santri luar kelas | gagal |
| Admin update semua avatar | berhasil |
| Upload `.exe` atau MIME bukan gambar | gagal |
| Upload gambar lebih dari 2 MB untuk avatar santri | gagal |
| Upload baru | menggantikan file lama |

### `website-assets`

| Kasus | Ekspektasi |
|---|---|
| Anon read asset public | berhasil |
| Admin upload logo/hero | berhasil |
| Guru upload website asset | gagal |
| MIME tidak valid | gagal |
| File terlalu besar | gagal |

### `murojaah-recordings`

| Kasus | Ekspektasi |
|---|---|
| Santri upload rekaman miliknya | berhasil |
| Santri upload ke folder santri lain | gagal |
| Guru baca rekaman santri kelasnya | berhasil |
| Guru baca rekaman luar kelas | gagal |
| Pentashih baca rekaman assignment | berhasil |
| Anon baca rekaman | gagal |
| Signed URL expired | gagal digunakan |

## Edge Function Test Matrix

| Function | Kasus | Ekspektasi |
|---|---|---|
| `signin-with-nomor-induk` | nomor/password benar | session resmi |
| `signin-with-nomor-induk` | salah | error generik |
| `signin-with-nomor-induk` | rate limit | ditolak sementara |
| `manage-user` | admin create santri | Auth user, profil, alias dibuat |
| `manage-user` | guru memanggil | ditolak |
| `reset-user-password` | admin reset user | berhasil, password tidak masuk log |
| `reset-user-password` | santri reset user lain | ditolak |
| `generate-signed-upload-url` | path sendiri valid | signed URL |
| `generate-signed-upload-url` | path orang lain | ditolak |
| `export-sensitive-report` | admin laporan keuangan | berhasil jika function dibuat |
| `export-sensitive-report` | guru laporan detail keuangan | ditolak |

## Logging dan Observability

Yang boleh masuk log:

- request id;
- role pemanggil;
- jenis aksi;
- status sukses/gagal;
- kode error generik;
- durasi.

Yang tidak boleh masuk log:

- password;
- service-role key;
- refresh token;
- Nomor Induk Qiroati lengkap jika tidak dimasking;
- nomor KK;
- alamat lengkap;
- nomor HP;
- catatan transaksi detail.

## Acceptance Test Sebelum Data Asli

Backend belum boleh menerima data asli sebelum:

- semua test Auth lulus;
- semua test RLS role inti lulus;
- semua test Storage path ownership lulus;
- Edge Function tidak membocorkan secret;
- laporan test hanya memakai data dummy;
- tidak ada policy yang membuka data sensitif ke anon/authenticated umum;
- tidak ada service-role key di frontend.
