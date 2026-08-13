# 07 - Required Credentials and Services

## Kredensial yang Dibutuhkan Nanti

Jangan masukkan nilai asli ke repo atau chat. Simpan di dashboard layanan atau `.env.local` lokal saja.

| Kebutuhan | Dipakai Untuk |
|---|---|
| Supabase project URL baru | Koneksi frontend ke Supabase baru. |
| Supabase anon/publishable key baru | Client browser. Boleh publik, tetapi tetap jangan hard-code di source. |
| Supabase service-role key baru | Hanya untuk Edge Function/server, tidak boleh masuk frontend. |
| Supabase database password baru | Operasi migration/backup lokal, hanya untuk admin teknis. |
| JWT secret atau signing setup | Jika tetap memakai custom login/RPC JWT. Lebih baik hindari jika tidak perlu. |
| Storage bucket policy/access | Upload dan baca file `avatars`, `website-assets`, `music-files`. |
| Domain baru | Deployment LPQ Al-Fath Maulana 2. |
| Hosting/deployment account | Vercel/Netlify/Hostinger/static hosting sesuai pilihan. |
| Email/SMS/WhatsApp provider | Jika nanti ada notifikasi resmi. Saat ini WhatsApp lebih banyak berupa link/pesan manual. |

## Service Supabase yang Perlu Dibuat

### Database

Perlu dibuat dari migration bersih, bukan restore langsung ke produksi.

Modul utama:

- Profil dan role: `guru`, `santri`.
- Akademik: `classes`, `attendance`, `academic_calendar`, `hafalan_items`, `hafalan_progress`, `murojaah_submissions`.
- Keuangan: `payments`, `expenses`.
- Konten: `website_content`, `feedbacks`, forum/news/announcement bila dipertahankan.
- MMQ: `mmq_schedule`, `mmq_attendance`, `mmq_notulensi`.
- Media: `music_files`, `media_player_settings`.

### Auth

Perlu keputusan:

1. Admin/guru memakai Supabase Auth email/password.
2. Santri memakai Supabase Auth juga, atau login internal via Edge Function.
3. Role disimpan konsisten di user metadata dan/atau tabel profil.

### Storage

Bucket minimal:

- `avatars`
- `website-assets`
- `music-files`

Bucket opsional:

- `murojaah-recordings`

### Edge Function

Function yang harus dibuat ulang bila fitur dipertahankan:

- `manage-user`
- `generate-signed-upload-url`
- `backup-database`
- `restore-database`

Rekomendasi: backup/restore UI sebaiknya dinonaktifkan dulu sampai desain keamanan matang.

## Environment Variable yang Disarankan

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

Untuk Edge Function/server:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

Jangan pernah memakai `SUPABASE_SERVICE_ROLE_KEY` di React/Vite frontend.

## Akses yang Perlu Dimiliki Pengelola

- Owner/admin Supabase project baru.
- Akses domain/DNS.
- Akses hosting deployment.
- Akses backup lama secara lokal.
- Daftar akun admin/guru/santri dummy untuk testing.

## Yang Belum Perlu Dibuat Sekarang

- Project Supabase baru.
- Database produksi baru.
- Deployment produksi.
- Import data asli.
- Upload file Storage asli.

Semua itu sebaiknya dilakukan setelah roadmap, schema, Auth, dan RLS disetujui.
