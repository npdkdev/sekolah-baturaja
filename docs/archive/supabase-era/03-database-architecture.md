# 03 - Database Architecture

## Sumber Analisis

Analisis database memakai dua sumber:

1. `src/database_schema_export.sql`, yaitu schema export dari Horizon.
2. `_private_reference/lpq_full.backup`, dibaca dengan `pg_restore --list` dan schema-only extraction lokal. Backup tidak direstore ke database mana pun.

Tidak ada isi data pribadi yang dimasukkan ke dokumen ini.

## Perbedaan Penting Schema Export vs Backup

`database_schema_export.sql` hanya memuat sebagian struktur. Backup asli lebih lengkap dan berisi tabel yang dipakai frontend tetapi tidak ada di export Horizon.

Tabel tambahan yang terlihat di backup dan penting untuk frontend:

- `academic_calendar`
- `mmq_schedule`
- `mmq_attendance`
- `music_files`
- `media_player_settings`
- `journey_posts`
- `journey_comments`
- `journey_likes`
- `journey_comment_likes`

## Tabel Utama di Backup

| Tabel | Fungsi Umum |
|---|---|
| `website_content` | Konten website berbasis key/value JSON: logo, hero, berita, pengumuman, galeri, video, config game, config TV. |
| `guru` | Profil guru, role tambahan, RFID, kontak, foto, status guru. |
| `santri` | Data santri, wali, kelas, RFID, jilid, status, poin, kategori anak/dewasa, data berkas. |
| `classes` | Kelas, guru pengampu, sesi, kategori, urutan. |
| `attendance` | Absensi santri/guru umum, tanggal, sesi, status, check-in timestamp. |
| `mmq_schedule` | Jadwal MMQ. |
| `mmq_attendance` | Absensi guru untuk sesi MMQ. |
| `mmq_absensi` | Absensi MMQ model lama. |
| `mmq_notulensi` | Notulensi MMQ. |
| `payments` | Pembayaran santri, bulan, tahun, jumlah, metode, catatan. |
| `expenses` | Pengeluaran lembaga. |
| `hafalan_items` | Master item hafalan per kategori dan jilid. |
| `hafalan_progress` | Progress hafalan santri. |
| `murojaah_submissions` | Setoran murojaah/manual/rekaman. |
| `class_mutations` | Riwayat pindah kelas. |
| `jilid_history` | Riwayat naik/turun jilid. |
| `forum_topics` | Topik forum. |
| `forum_replies` | Balasan forum. |
| `feedbacks` | Pesan dari pengunjung. |
| `announcements` | Tabel pengumuman model lama. Banyak frontend memakai `website_content` juga. |
| `news` | Tabel berita model lama. Banyak frontend memakai `website_content` juga. |
| `login_logs` | Log login. |
| `visitor_stats` | Statistik pengunjung. |
| `notifications` | Notifikasi internal. |
| `santri_notes` | Catatan guru/admin untuk santri. |
| `music_files` | Daftar file musik. |
| `media_player_settings` | State pemutar musik per user. |

## Kolom Penting

Contoh kolom yang dipakai frontend:

- `santri`: `id`, `nama_lengkap`, `nama_panggilan`, `nomor_induk_qiroati`, `foto_url`, `tanggal_lahir`, `no_hp_ortu`, `email`, `password`, `sesi_mengaji`, `rfid_tag`, `jilid`, `id_kelas`, `order_in_class`, `points`, `kategori`, `status`.
- `guru`: `id`, `nama`, `email`, `no_hp`, `foto_url`, `rfid_tag`, `roles`, `tanggal_lahir`, `status_guru`, `nomor_induk_qiroati`.
- `attendance`: `user_id`, `role`, `attendance_date`, `check_in_time`, `check_in_timestamp`, `class_id`, `sesi`, `status`.
- `payments`: `santri_id`, `bulan`, `tahun`, `jumlah`, `tanggal_pembayaran`, `metode_pembayaran`, `catatan`, `transaction_id`.
- `website_content`: `key`, `content`.

## RPC / Postgres Function

Function yang ada di schema backup:

- `get_user_role(user_id uuid)`
- `increment_santri_points(p_santri_id uuid, p_amount integer)`
- `get_absentee_notifications(p_guru_id uuid)`
- `signin_with_username(p_username text, p_password text)`
- Function pendukung JWT/signature: `sign`, `algorithm_sign`, `url_encode`, `url_decode`
- Trigger function journey: `handle_new_comment_like`, `handle_comment_unlike`

Frontend juga memanggil `get_diagnostic_rls_policies`, tetapi function ini tidak terlihat di backup/schema utama. Itu tampaknya utilitas diagnostik lama.

## Storage

Bucket yang dibutuhkan frontend:

| Bucket | Dipakai Untuk |
|---|---|
| `avatars` | Foto guru dan santri. |
| `website-assets` | Logo, hero, galeri, brosur, pustaka, gambar artikel/fasilitas. |
| `music-files` | Upload dan playback musik. |
| `murojaah-recordings` | Ada policy di backup, tetapi frontend saat ini belum benar-benar upload rekaman audio ke bucket ini. |

Catatan: schema backup menampilkan policy untuk `music-files` hanya melalui tabel `music_files`; bucket `music-files` perlu diverifikasi saat membuat project Supabase baru.

## Auth

Model Auth bercampur:

- Guru/admin mengandalkan Supabase Auth `auth.users`.
- Tabel `guru.id` mereferensikan user Auth.
- Santri memakai tabel `santri` dan RPC custom untuk membuat session/JWT.
- Ada fallback mock session di frontend.

Untuk project baru, model Auth perlu diputuskan ulang: apakah santri masuk lewat Supabase Auth sungguhan, magic link/OTP, atau login internal dengan Edge Function yang aman.

## RLS

Backup memperlihatkan banyak policy sangat permisif, termasuk:

- SELECT public pada beberapa data sensitif.
- Policy dengan ekspresi `OR true`.
- Insert/update/delete untuk authenticated pada banyak tabel.
- Storage policy yang terlalu luas untuk user authenticated.

Schema baru perlu RLS baru dari nol, bukan menyalin policy lama mentah-mentah.
