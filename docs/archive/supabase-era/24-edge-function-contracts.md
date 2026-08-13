# 24 - Edge Function Contracts

## Status

Dokumen ini merancang kontrak Edge Function. Belum ada function dibuat, belum ada deploy, dan belum ada secret dikonfigurasi.

Aturan umum:

- Service-role hanya boleh digunakan di Edge Function.
- Service-role tidak boleh dikirim ke frontend.
- Function harus membaca session Supabase Auth untuk aksi authenticated.
- Semua input divalidasi.
- Password dan token tidak boleh dicetak ke log.
- Error untuk auth harus generik.
- Tidak ada JWT custom.

## Common Response Format

Sukses:

```json
{
  "ok": true,
  "data": {}
}
```

Gagal:

```json
{
  "ok": false,
  "error": {
    "code": "GENERIC_ERROR",
    "message": "Pesan aman untuk user."
  }
}
```

Catatan:

- Detail teknis hanya boleh masuk log aman, bukan response user.
- Untuk login santri, error harus sama untuk nomor induk tidak ditemukan dan password salah.

## `signin-with-nomor-induk`

Tujuan:

- Login santri/wali memakai Nomor Induk Qiroati dan password.
- Mengembalikan session Supabase Auth resmi.

Input:

```json
{
  "nomor_induk_qiroati": "DUMMY001",
  "password": "password-user"
}
```

Output sukses:

```json
{
  "ok": true,
  "data": {
    "session": "Supabase Auth session object",
    "user": "Supabase Auth user object"
  }
}
```

Autentikasi:

- Function dipanggil tanpa session karena dipakai untuk login.

Role yang boleh memanggil:

- anon/client login page.

Penggunaan service-role:

- Boleh untuk membaca `auth_login_aliases`.
- Jangan expose service-role ke response.

Alur:

1. Terima Nomor Induk Qiroati dan password.
2. Validasi input tidak kosong.
3. Normalisasi nomor induk sesuai format resmi lembaga tanpa mengubah angka nol di depan.
4. Cari alias aktif di `auth_login_aliases`.
5. Ambil identifier Auth internal, misalnya `internal_email`.
6. Login ke Supabase Auth memakai identifier internal dan password.
7. Jika sukses, return session resmi.
8. Jika gagal, return error generik.

Validasi:

- Nomor induk tidak boleh mengandung spasi.
- Password wajib ada tetapi tidak boleh dilog.
- Alias harus `is_active = true`.
- User profile harus role `santri` dan status aktif.

Rate limit:

- Limit per IP.
- Limit per nomor induk yang dimasking.
- Cooldown setelah beberapa percobaan gagal.

Logging aman:

- Log request id, IP hash, status sukses/gagal.
- Masking nomor induk bila dicatat.
- Jangan log password.
- Jangan log internal email penuh jika tidak perlu.

Error handling:

- Nomor induk tidak ada: "Nomor Induk Qiroati atau password salah."
- Password salah: pesan sama.
- Akun nonaktif: pesan aman, tidak membocorkan detail internal.
- Rate limit: pesan "Terlalu banyak percobaan. Coba lagi nanti."

Test case:

- Login benar berhasil.
- Password salah ditolak.
- Nomor induk tidak ada ditolak dengan pesan sama.
- Alias inactive ditolak.
- Akun nonaktif ditolak.
- Password tidak muncul di log.
- Response tidak berisi JWT custom.

## `manage-user`

Tujuan:

- Admin membuat, mengubah, menonaktifkan akun guru, santri, dan pentashih.
- Admin membuat password awal santri.

Input contoh create santri:

```json
{
  "action": "create",
  "role": "santri",
  "profile": {
    "nomor_induk_qiroati": "DUMMY001",
    "nama_lengkap": "Santri Demo 001",
    "kategori": "Anak",
    "current_class_id": "uuid"
  },
  "initial_password": "password-awal"
}
```

Output:

```json
{
  "ok": true,
  "data": {
    "user_id": "uuid",
    "role": "santri"
  }
}
```

Autentikasi:

- Wajib session Supabase Auth.

Role yang boleh memanggil:

- `admin` saja.

Penggunaan service-role:

- Membuat/update user Auth.
- Menulis `user_profiles`, `guru`, `santri`, dan `auth_login_aliases`.

Validasi:

- Pemanggil harus admin.
- Role target hanya `guru`, `santri`, `pentashih`.
- Nomor Induk Qiroati unik, text, tanpa spasi, dan format resmi.
- Email internal santri dibuat teknis dan tidak dikembalikan ke user biasa.
- Password awal tidak boleh kosong dan tidak boleh dilog.
- Guru/pentashih tidak boleh self-register.

Logging aman:

- Log action, target role, target user id, status.
- Jangan log password awal.
- Jangan log data pribadi lengkap.

Rate limit:

- Limit per admin untuk operasi massal.
- Untuk bulk create, gunakan batching kecil dan idempotency key.

Error handling:

- Role pemanggil tidak sah: forbidden.
- Nomor induk duplikat: pesan aman yang bisa dipahami admin.
- Auth create gagal: rollback/koreksi record aplikasi bila sebagian gagal.

Test case:

- Admin create santri berhasil.
- Admin create guru berhasil.
- Guru memanggil function ditolak.
- Nomor induk duplikat ditolak.
- Password awal tidak masuk log.
- Alias login santri dibuat aktif.

## `reset-user-password`

Tujuan:

- Admin mereset password user.
- Self-service email bisa ditambahkan setelah SMTP siap.

Input:

```json
{
  "target_user_id": "uuid",
  "new_password": "password-baru",
  "require_password_change": true
}
```

Output:

```json
{
  "ok": true,
  "data": {
    "target_user_id": "uuid",
    "password_updated": true
  }
}
```

Autentikasi:

- Wajib session Supabase Auth.

Role yang boleh memanggil:

- `admin` untuk reset langsung.
- Self-service terbatas hanya jika mode reset email dibuat nanti.

Penggunaan service-role:

- Update password Supabase Auth user.

Validasi:

- Pemanggil admin.
- Target user ada dan tidak hard deleted.
- Password memenuhi kebijakan minimal.

Logging aman:

- Log target user id dan admin id.
- Jangan log password baru.

Rate limit:

- Limit per admin.
- Audit reset berulang pada user sama.

Error handling:

- Target tidak ditemukan: pesan aman untuk admin.
- Role tidak sah: forbidden.
- Password lemah: validation error.

Test case:

- Admin reset santri berhasil.
- Guru reset user lain ditolak.
- Password tidak muncul di log.
- User bisa login setelah reset.

## `generate-signed-upload-url`

Tujuan:

- Memberi signed URL untuk upload aman ke bucket yang diizinkan.

Input:

```json
{
  "bucket": "avatars",
  "path": "santri/<uid>/profile.webp",
  "content_type": "image/webp",
  "size": 1800000,
  "purpose": "santri_avatar"
}
```

Output:

```json
{
  "ok": true,
  "data": {
    "signed_url": "temporary-url",
    "path": "santri/<uid>/profile.webp",
    "expires_in": 300
  }
}
```

Autentikasi:

- Wajib session Supabase Auth.

Role yang boleh memanggil:

- `admin` untuk semua path yang diizinkan.
- `santri` untuk avatar sendiri dan rekaman sendiri.
- `guru` untuk avatar sendiri dan avatar santri kelasnya.
- `pentashih` read/download sesuai assignment jika dibutuhkan.

Penggunaan service-role:

- Membuat signed URL setelah validasi role/path.

Validasi:

- Bucket masuk allowlist.
- Path sesuai role dan ownership.
- Avatar santri harus `santri/<auth.uid()>/profile.webp` untuk santri pemilik.
- Guru harus punya akses kelas ke santri target sebelum mengelola avatar santri.
- MIME dan ekstensi cocok.
- Ukuran avatar santri maksimal 2 MB.
- Rekaman murojaah memakai MIME audio yang diizinkan.
- Upload baru overwrite file lama jika purpose avatar.

Logging aman:

- Log bucket, purpose, role, status.
- Jangan log signed URL penuh.

Rate limit:

- Limit upload avatar per user.
- Limit request signed URL per menit.

Error handling:

- Path orang lain: forbidden.
- MIME invalid: validation error.
- Ukuran terlalu besar: validation error.
- Bucket tidak dikenal: validation error.

Test case:

- Santri dapat signed URL avatar sendiri.
- Santri gagal meminta URL avatar orang lain.
- Guru berhasil untuk santri kelasnya.
- Guru gagal untuk santri luar kelas.
- MIME `.exe` ditolak.
- Signed URL tidak muncul di log.

## `import-master-data`

Status:

- Opsional, hanya bila benar-benar diperlukan untuk migrasi server-side.

Tujuan:

- Membantu import master data secara idempotent pada staging/production baru.
- Tidak digunakan untuk membaca database produksi lama langsung.

Input:

```json
{
  "batch_id": "string",
  "entity": "santri",
  "records": []
}
```

Autentikasi:

- Wajib session admin.
- Sebaiknya hanya aktif pada staging atau mode migration production yang dikunci.

Penggunaan service-role:

- Boleh untuk insert/update terkontrol.

Validasi:

- Idempotency key wajib.
- Data pribadi tidak boleh dicetak ke log.
- Password lama ditolak.
- Feedback lama ditolak.

Test case:

- Batch sama tidak membuat duplikat.
- Data invalid masuk daftar error agregat.
- Log hanya menampilkan jumlah record.

## `export-sensitive-report`

Status:

- Opsional, hanya jika laporan sensitif tidak aman dibaca langsung oleh client.

Tujuan:

- Membuat export Excel/PDF untuk data sensitif dengan pembatasan role.

Input:

```json
{
  "report_type": "payments",
  "filters": {
    "year": 2026,
    "month": 1
  },
  "format": "xlsx"
}
```

Autentikasi:

- Wajib session Supabase Auth.

Role yang boleh memanggil:

- Admin untuk laporan keuangan penuh.
- Guru hanya untuk laporan kelasnya dan tanpa detail keuangan terlarang.
- Santri hanya laporan dirinya.

Penggunaan service-role:

- Boleh untuk membaca data setelah authorization ketat.

Validasi:

- Filter wajib dibatasi.
- Role menentukan scope.
- Output tidak disimpan public.

Logging aman:

- Log jenis laporan, role, range tanggal, status.
- Jangan log isi laporan.

Test case:

- Admin export pembayaran penuh berhasil.
- Guru gagal export detail nominal/metode/catatan pembayaran.
- Santri gagal export data orang lain.
- Link download bersifat sementara.
