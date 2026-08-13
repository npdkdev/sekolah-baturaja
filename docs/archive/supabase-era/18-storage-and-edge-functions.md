# 18 - Storage and Edge Functions

Seluruh keputusan Storage dan Edge Function Fase 2 pada dokumen ini sudah final.

## Storage Bucket

### `avatars`

Dipakai untuk:

- foto santri
- foto guru

Read:

- authenticated users boleh membaca avatar.
- public read tidak menjadi default untuk avatar santri/guru.

Write:

- admin boleh upload/update/delete semua avatar.
- guru boleh update avatar sendiri.
- santri boleh upload, mengganti, dan menghapus foto profil miliknya sendiri.
- upload foto santri oleh admin/guru sebaiknya memakai signed URL.
- guru boleh mengelola foto profil santri hanya untuk kelas yang diampu.

Pola folder:

```text
avatars/santri/<auth.uid()>/profile.webp
avatars/guru/<auth.uid()>/profile.webp
```

Batas file:

- maksimal disarankan 2 MB untuk foto profil santri.
- MIME: `image/jpeg`, `image/png`, `image/webp`.
- ekstensi yang diizinkan: JPG, JPEG, PNG, WebP.

Policy khusus foto santri:

- santri hanya boleh menulis ke folder `santri/<auth.uid()>/`.
- santri tidak boleh mengubah foto santri lain.
- upload baru menggantikan foto lama agar file tidak menumpuk.
- admin boleh menghapus foto yang tidak pantas.
- guru hanya boleh mengelola foto santri jika santri tersebut berada pada kelas yang diampu.
- validasi tipe dan ukuran dilakukan di frontend dan backend/Storage policy atau Edge Function.

### `website-assets`

Dipakai untuk:

- logo
- hero image
- galeri
- brosur
- gambar berita/pengumuman
- asset profil/kontak

Read:

- public read.

Write:

- admin only.

Pola folder:

```text
website-assets/logo/
website-assets/hero/
website-assets/gallery/
website-assets/news/
website-assets/announcements/
website-assets/brochures/
```

Batas file:

- gambar maksimal 5 MB.
- PDF brosur maksimal 20 MB.
- MIME gambar/PDF yang diizinkan saja.

### `murojaah-recordings`

Dipakai jika fitur rekaman murojaah aktif.

Read:

- santri pemilik file.
- guru kelas atau guru target.
- pentashih assignment.
- admin.

Write:

- santri upload rekaman sendiri.
- admin boleh upload/delete.

Pola folder:

```text
murojaah-recordings/<santri_id>/<submission_id>/<filename>
```

Batas file:

- maksimal 25 MB.
- MIME: `audio/mpeg`, `audio/mp4`, `audio/webm`, `audio/wav`.

Signed URL:

- Direkomendasikan untuk upload dan download.
- Jangan jadikan bucket public.

### Bucket Deferred

`music-files` belum dibuat untuk fitur inti. Jika music player diaktifkan nanti, desain bucket dan RLS dibuat terpisah.

## Edge Function

### `signin-with-nomor-induk`

Tujuan:

- login santri/wali memakai Nomor Induk Qiroati + password.
- mengembalikan session Supabase Auth resmi.

Input:

- `nomor_induk_qiroati`
- `password`

Keamanan:

- rate limit.
- pesan error umum.
- tidak expose email internal.
- tidak membuat JWT custom.
- hanya membaca `auth_login_aliases` di server.
- menerima Nomor Induk Qiroati dan password.
- mencari mapping Nomor Induk Qiroati ke akun Supabase Auth.
- memakai identifier Auth internal, misalnya email internal tersembunyi.
- memverifikasi password melalui Supabase Auth.
- mengembalikan session Supabase Auth resmi.
- tidak membaca atau menyimpan password plaintext di tabel aplikasi.

Catatan:

- Santri/wali hanya melihat Nomor Induk Qiroati sebagai username.
- Email internal hanya mekanisme teknis di belakang layar dan tidak dipakai pada form login.

### `manage-user`

Tujuan:

- admin membuat/mengubah/menonaktifkan akun guru, santri, dan pentashih.

Operasi:

- create user Auth.
- update email/password/status.
- set role metadata.
- buat/update `user_profiles`.
- buat/update `guru` atau `santri`.
- buat/update `auth_login_aliases` untuk santri.
- membuat password awal santri/guru/pentashih melalui Supabase Auth sesuai aksi admin.

Keamanan:

- hanya admin.
- service-role key hanya di server.
- validasi role target.
- jangan menghapus hard delete user kecuali benar-benar perlu; pakai deactivate/soft delete.

### `generate-signed-upload-url`

Tujuan:

- upload aman untuk avatar dan asset website.

Input:

- bucket
- path
- content type
- size
- tujuan upload

Keamanan:

- validasi bucket dan path.
- validasi user berhak upload path tersebut.
- validasi MIME dan ukuran.
- kembalikan signed URL jangka pendek.
- untuk avatar santri, path final adalah `avatars/santri/<auth.uid()>/profile.webp`.
- untuk guru yang mengelola avatar santri, cek relasi kelas aktif sebelum signed URL diberikan.
- untuk santri, tolak path yang tidak berada di folder `santri/<auth.uid()>/`.

### `reset-user-password`

Tujuan:

- admin reset password user.
- self-service reset bisa ditambahkan nanti.

Keamanan:

- admin only untuk reset langsung.
- log audit reset password.
- jangan kirim password melalui log.

### `export-sensitive-report`

Opsional.

Dipakai jika laporan Excel/PDF perlu data sensitif yang tidak aman dibaca langsung dari client.

Contoh:

- laporan keuangan penuh.
- rekap pembayaran banyak santri.
- laporan absensi lengkap.

Keamanan:

- admin only untuk laporan keuangan penuh.
- guru hanya laporan kelasnya.
- santri hanya laporan dirinya.
- hasil export jangan disimpan public.

## Edge Function yang Tidak Dibuat di Fase Inti

- `backup-database`
- `restore-database`

Alasan:

- Backup/restore UI ditunda.
- Backup sebaiknya melalui Supabase Dashboard atau `pg_dump`, bukan UI admin.
- Restore dari UI terlalu berisiko untuk production.

## Environment Server

Edge Function memakai environment server:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

Larangan:

- Jangan pernah memasukkan `SUPABASE_SERVICE_ROLE_KEY` ke frontend.
- Jangan commit environment value ke Git.

## Checklist Implementasi Nanti

- Buat bucket dengan policy default tertutup.
- Tambah policy read/write sesuai role.
- Uji upload file valid.
- Uji upload file terlalu besar.
- Uji upload MIME tidak valid.
- Uji user mencoba upload ke folder user lain.
- Uji signed URL expired.
