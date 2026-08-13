# 15 - Final Database Schema

## Catatan Penting

Dokumen ini adalah rancangan schema, bukan file migration SQL. File SQL lama di `src/` hanya referensi dan tidak boleh dijalankan langsung.

Konvensi umum:

- Semua tabel inti memakai `id uuid primary key default gen_random_uuid()`, kecuali tabel profil yang `id`-nya sama dengan `auth.users.id`.
- Tabel penting memakai `created_at`, `updated_at`, `created_by`, `updated_by`.
- Data yang tidak boleh hilang memakai `deleted_at` untuk soft delete. Soft delete disimpan permanen sampai dibersihkan oleh admin teknis.
- Role final: `admin`, `guru`, `santri`, `pentashih`.
- Nomor Induk Qiroati disimpan sebagai `text`, mengikuti format resmi lembaga, unik, konsisten, tanpa spasi, dan tidak dinormalisasi menjadi angka agar angka nol di depan tidak hilang.
- Seluruh keputusan Fase 2 pada dokumen ini sudah final.

## Core Identity

### `user_profiles`

Profil ringan untuk semua user Auth.

Kolom penting:

- `id uuid primary key references auth.users(id) on delete cascade`
- `role text not null check (role in ('admin','guru','santri','pentashih'))`
- `display_name text`
- `email text`
- `phone text`
- `status text not null default 'active'`
- `created_at timestamptz`
- `updated_at timestamptz`
- `created_by uuid references auth.users(id)`
- `updated_by uuid references auth.users(id)`

Constraint/index:

- unique `email` bila tidak null
- index `role`
- index `status`

### `auth_login_aliases`

Mapping login santri. Tabel ini private, hanya Edge Function/service role yang boleh membaca.

Kolom penting:

- `id uuid primary key`
- `auth_user_id uuid not null references auth.users(id) on delete cascade`
- `alias_type text not null default 'nomor_induk_qiroati'`
- `alias_value text not null`
- `normalized_alias text not null`
- `internal_email text not null`
- `is_active boolean not null default true`
- `created_at timestamptz`
- `updated_at timestamptz`

Constraint/index:

- unique `(alias_type, normalized_alias)`
- unique `auth_user_id` untuk alias nomor induk aktif
- index `is_active`
- check `alias_value = btrim(alias_value)`
- check `alias_value !~ '\s'`

Catatan:

- Nomor Induk Qiroati tidak menjadi email publik.
- `alias_value` dan `normalized_alias` memakai tipe `text` agar angka nol di depan tetap tersimpan.
- Email internal bisa berbentuk teknis, misalnya domain internal project. Nilai aslinya tidak ditampilkan kepada santri/wali dan tidak dipakai pada form login.
- Password tidak pernah disimpan di tabel ini.

## Santri dan Guru

### `santri`

Profil santri/wali. `id` sama dengan `auth.users.id` agar kompatibel dengan frontend.

Kolom penting:

- `id uuid primary key references auth.users(id)`
- `nomor_induk_qiroati text not null`
- `nama_lengkap text not null`
- `nama_panggilan text`
- `kategori text check (kategori in ('Anak','Dewasa'))`
- `jenis_kelamin text`
- `tanggal_lahir date`
- `tempat_lahir text`
- `alamat text`
- `no_hp_ortu text`
- `email text`
- `foto_url text`
- `avatar_path text`
- `rfid_tag text`
- `current_class_id uuid references classes(id)`
- `sesi_mengaji text`
- `jilid text`
- `status text not null default 'Aktif'`
- `points integer not null default 0`
- `order_in_class integer`
- `created_at`, `updated_at`, `deleted_at`
- `created_by`, `updated_by`

Constraint/index:

- unique `nomor_induk_qiroati`
- check `nomor_induk_qiroati = btrim(nomor_induk_qiroati)`
- check `nomor_induk_qiroati !~ '\s'`
- unique `rfid_tag` where not null
- index `current_class_id`
- index `status`
- index `kategori`

Kolom yang tidak boleh ada:

- `password`
- token/session

Catatan:

- `foto_url` boleh menjadi URL/cache publik internal jika dibutuhkan UI, tetapi sumber Storage yang disarankan adalah `avatar_path`.
- Path foto profil santri mengikuti pola tetap `avatars/santri/<auth.uid()>/profile.webp`.
- Santri boleh mengganti foto profil sendiri melalui policy/Edge Function yang membatasi path berdasarkan `auth.uid()`.

### `guru`

Profil guru/pengajar/pentashih/staff.

Kolom penting:

- `id uuid primary key references auth.users(id)`
- `nama text not null`
- `email text`
- `no_hp text`
- `alamat text`
- `foto_url text`
- `rfid_tag text`
- `jabatan text`
- `roles text[] default '{}'`
- `is_notulen boolean default false`
- `jenis_kelamin text`
- `tanggal_lahir date`
- `status_guru text`
- `status text not null default 'active'`
- `created_at`, `updated_at`, `deleted_at`
- `created_by`, `updated_by`

Constraint/index:

- unique `email` where not null
- unique `rfid_tag` where not null
- index GIN `roles`
- index `status`

Catatan:

- Role aplikasi utama tetap di `user_profiles.role`.
- `guru.roles` boleh dipakai sebagai atribut operasional, misalnya `Pentashih`, `Bendahara`, `Staff Operasional`, selama RLS utama tidak bergantung hanya pada array ini.

## Akademik dan Kelas

### `classes`

Kolom penting:

- `id uuid primary key`
- `nama_kelas text not null`
- `id_guru uuid references guru(id)`
- `sesi text`
- `kategori text`
- `order integer`
- `is_active boolean default true`
- `created_at`, `updated_at`, `deleted_at`
- `created_by`, `updated_by`

Index:

- `id_guru`
- `sesi`
- `kategori`
- `is_active`

### `class_memberships`

Sumber riwayat kelas santri.

Kolom penting:

- `id uuid primary key`
- `santri_id uuid not null references santri(id)`
- `class_id uuid not null references classes(id)`
- `start_date date not null`
- `end_date date`
- `status text not null default 'active'`
- `order_in_class integer`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

Constraint/index:

- unique active membership per santri: satu `santri_id` dengan `status='active'`
- index `class_id`
- index `santri_id`
- index `(class_id, status)`

Catatan:

- `santri.current_class_id` harus disinkronkan dengan membership aktif saat implementasi.

### `pentashih_class_assignments`

Penugasan pentashih.

Kolom penting:

- `id uuid primary key`
- `pentashih_id uuid not null references guru(id)`
- `class_id uuid references classes(id)`
- `mmq_schedule_id uuid references mmq_schedule(id)`
- `scope text not null check (scope in ('class','mmq','both'))`
- `is_active boolean default true`
- `starts_at date`
- `ends_at date`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

Constraint/index:

- index `pentashih_id`
- index `class_id`
- index `mmq_schedule_id`
- unique aktif untuk kombinasi yang sama.

### `attendance`

Absensi RFID santri dan guru.

Kolom penting:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id)`
- `role text not null check (role in ('santri','guru','pentashih'))`
- `attendance_date date not null`
- `check_in_time time`
- `check_in_timestamp timestamptz`
- `class_id uuid references classes(id)`
- `sesi text`
- `status text not null default 'Hadir'`
- `source text default 'rfid'`
- `correction_reason text`
- `corrected_by uuid references auth.users(id)`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

Constraint/index:

- unique `(user_id, attendance_date, sesi)` jika sesi wajib unik
- index `attendance_date`
- index `class_id`
- index `user_id`
- index `(role, attendance_date)`

### `academic_calendar`

Kolom penting:

- `id uuid primary key`
- `date date not null unique`
- `title text`
- `description text`
- `is_holiday boolean default false`
- `event_type text`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

## Hafalan, Murojaah, dan Catatan

### `hafalan_items`

- `id uuid primary key`
- `category text not null`
- `jilid text`
- `item_name text not null`
- `item_order integer`
- `is_active boolean default true`
- `created_at`, `updated_at`

Index:

- `(category, jilid)`
- `item_order`

### `hafalan_progress`

- `id uuid primary key`
- `santri_id uuid not null references santri(id)`
- `item_id uuid references hafalan_items(id)`
- `category text`
- `item_name text`
- `status text not null default 'belum'`
- `nilai text`
- `catatan text`
- `assessed_by uuid references guru(id)`
- `assessed_at timestamptz`
- `created_at`, `updated_at`

Constraint/index:

- unique `(santri_id, item_id)`
- index `santri_id`
- index `assessed_by`

### `murojaah_submissions`

- `id uuid primary key`
- `santri_id uuid not null references santri(id)`
- `target_guru_id uuid references guru(id)`
- `type text`
- `content text`
- `recording_path text`
- `status text default 'menunggu'`
- `feedback text`
- `submitted_at timestamptz`
- `reviewed_at timestamptz`
- `created_at`, `updated_at`

Index:

- `santri_id`
- `target_guru_id`
- `status`

### `santri_notes`

- `id uuid primary key`
- `santri_id uuid not null references santri(id)`
- `guru_id uuid references guru(id)`
- `note text not null`
- `visibility text default 'internal'`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

## Keuangan

### `payments`

- `id uuid primary key`
- `santri_id uuid not null references santri(id)`
- `bulan integer`
- `tahun integer`
- `jumlah numeric(12,2) not null`
- `tanggal_pembayaran date not null`
- `metode_pembayaran text`
- `status text default 'paid'`
- `catatan text`
- `transaction_id text`
- `deleted_at timestamptz`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

Constraint/index:

- index `santri_id`
- index `(tahun, bulan)`
- index `tanggal_pembayaran`
- unique `transaction_id` where not null

### `payment_status_summary`

View atau materialized view terbatas untuk kebutuhan guru.

Kolom yang boleh tersedia:

- `santri_id uuid`
- `bulan integer`
- `tahun integer`
- `status text check (status in ('Lunas','Belum Lunas'))`
- `class_id uuid`

Larangan:

- tidak memuat `jumlah`
- tidak memuat `metode_pembayaran`
- tidak memuat `catatan`
- tidak memuat `transaction_id`
- tidak memuat detail transaksi lain

Catatan:

- Guru hanya boleh membaca status pembayaran santri yang berada di kelas yang diampu melalui view ini.
- Detail asli tetap berada di `payments` dan hanya admin/santri pemilik yang boleh mengakses sesuai RLS.

### `expenses`

- `id uuid primary key`
- `tanggal_pengeluaran date not null`
- `kategori text`
- `deskripsi text`
- `jumlah numeric(12,2) not null`
- `bukti_url text`
- `deleted_at timestamptz`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

Index:

- `tanggal_pengeluaran`
- `kategori`

## MMQ

### `mmq_schedule`

- `id uuid primary key`
- `day_of_week integer`
- `start_time time`
- `end_time time`
- `location text`
- `is_active boolean default true`
- `created_at`, `updated_at`

### `mmq_attendance`

- `id uuid primary key`
- `schedule_id uuid references mmq_schedule(id)`
- `guru_id uuid references guru(id)`
- `attendance_date date not null`
- `check_in_timestamp timestamptz`
- `status text default 'Hadir'`
- `notes text`
- `created_at`, `updated_at`

Constraint/index:

- unique `(schedule_id, guru_id, attendance_date)`
- index `guru_id`
- index `attendance_date`

### `mmq_notulensi`

- `id uuid primary key`
- `schedule_id uuid references mmq_schedule(id)`
- `tanggal date not null`
- `judul text`
- `isi text`
- `notulen_id uuid references guru(id)`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

## Konten Publik dan Notifikasi

### `website_content`

Untuk konten global.

- `id uuid primary key`
- `key text not null unique`
- `content jsonb not null`
- `is_public boolean default true`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

Contoh key:

- `logoUrl`
- `hero`
- `profile`
- `contact`
- `tv_config`
- `level_config`

### `news`

- `id uuid primary key`
- `title text not null`
- `slug text not null unique`
- `excerpt text`
- `content jsonb`
- `cover_image_url text`
- `status text default 'draft'`
- `published_at timestamptz`
- `created_at`, `updated_at`
- `created_by`, `updated_by`

Index:

- `status`
- `published_at`

### `announcements`

Struktur mirip `news`, tetapi untuk pengumuman.

Kolom tambahan:

- `priority text`
- `valid_until date`

### `feedbacks`

- `id uuid primary key`
- `nama text`
- `email text`
- `phone text`
- `message text not null`
- `status text default 'new'`
- `created_at`
- `handled_by uuid references auth.users(id)`
- `handled_at timestamptz`

Catatan:

- Tabel ini boleh dibuat untuk feedback baru.
- Feedback lama dari sistem lama tidak dimigrasikan.

### `notifications`

- `id uuid primary key`
- `recipient_id uuid references auth.users(id)`
- `title text not null`
- `body text`
- `type text`
- `is_read boolean default false`
- `created_at`

## Tabel Lama yang Tidak Masuk Inti

Tidak dibuat pada schema inti Fase 2:

- `forum_topics`
- `forum_replies`
- `journey_posts`
- `journey_comments`
- `music_files`
- `media_player_settings`
- `login_logs`
- `visitor_stats`

Catatan:

- `login_logs` boleh dibuat ulang nanti bila ada kebutuhan audit login, tetapi jangan migrasikan log lama.
- `visitor_stats` lama tidak perlu dimigrasikan.
