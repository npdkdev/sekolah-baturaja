# 20 - Phase 2 Decisions Needed

## Status

Seluruh keputusan Fase 2 telah diselesaikan.

Dokumen ini tidak lagi berisi pertanyaan terbuka. Semua keputusan di bawah menjadi dasar final untuk desain backend Supabase baru LPQ Al-Fath Maulana.

## Keputusan Final

### Autentikasi Santri

- Santri tetap login menggunakan Nomor Induk Qiroati sebagai username dan password.
- Password awal santri dibuat oleh admin.
- Password lama tidak dimigrasikan.
- Password tidak disimpan sebagai plaintext di tabel aplikasi.
- Login santri dilakukan melalui Edge Function `signin-with-nomor-induk`.
- Edge Function menerima Nomor Induk Qiroati dan password.
- Edge Function mencari mapping Nomor Induk Qiroati ke akun Supabase Auth.
- Edge Function memakai identifier Auth internal, misalnya email internal tersembunyi.
- Edge Function memverifikasi password melalui Supabase Auth.
- Edge Function mengembalikan session Supabase Auth resmi.
- Edge Function tidak membuat JWT custom.

### Email Internal Santri

- Email internal hanya mekanisme teknis Supabase Auth di belakang layar.
- Email internal tidak ditampilkan kepada santri/wali.
- Email internal tidak dipakai di form login.
- Santri/wali hanya melihat Nomor Induk Qiroati sebagai username.

### Nomor Induk Qiroati

- Nomor Induk Qiroati memakai format resmi lembaga.
- Nomor Induk Qiroati wajib unik.
- Nomor Induk Qiroati harus konsisten dan tanpa spasi.
- Nomor Induk Qiroati disimpan sebagai tipe `text` agar angka nol di depan tidak hilang.

### Foto Profil Santri

- Santri boleh upload, mengganti, dan menghapus foto profilnya sendiri.
- Santri tidak boleh mengubah foto santri lain.
- Admin boleh mengelola seluruh foto profil.
- Guru hanya boleh mengelola foto profil santri pada kelas yang diampu.
- Path file memakai pola `avatars/santri/<auth.uid()>/profile.webp`.
- File yang diizinkan: JPG, JPEG, PNG, WebP.
- Ukuran maksimal disarankan 2 MB.
- Upload baru menggantikan foto lama agar file tidak menumpuk.
- Validasi tipe dan ukuran dilakukan di frontend dan backend/Storage policy atau Edge Function.
- Admin tetap dapat menghapus foto yang tidak pantas.

### Akses Guru ke Pembayaran

- Guru hanya boleh melihat status pembayaran santri di kelasnya.
- Status yang terlihat hanya `Lunas` dan `Belum Lunas`.
- Guru tidak boleh melihat nominal pembayaran.
- Guru tidak boleh melihat metode pembayaran.
- Guru tidak boleh melihat catatan transaksi.
- Guru tidak boleh melihat `transaction_id` atau detail keuangan lainnya.
- Guru tidak boleh menghapus pembayaran.

### Soft Delete

- Soft delete disimpan permanen.
- Data soft deleted hanya dibersihkan oleh admin teknis melalui prosedur terpisah.
- Kebijakan ini berlaku untuk data penting seperti santri, guru, pembayaran, absensi, dan data operasional lain.

### Feedback Lama

- Feedback lama tidak dimigrasikan.
- Tabel `feedbacks` boleh dibuat untuk feedback baru setelah backend baru aktif.

## Keputusan yang Tidak Berubah

- Auth memakai Supabase Auth resmi untuk `admin`, `guru`, `santri`, dan `pentashih`.
- `user_profiles.role` menjadi sumber kebenaran role aplikasi.
- Pentashih memakai assignment kelas/MMQ melalui tabel assignment.
- Kelas memakai model gabungan `santri.current_class_id` dan `class_memberships`.
- Fitur forum, journey, music player, game/gatcha, quiz, top score, random name, dan backup/restore UI tetap deferred.
- Backup/restore dilakukan melalui Supabase Dashboard atau `pg_dump`, bukan UI admin.

## Keputusan Terbuka

Tidak ada keputusan Fase 2 yang masih terbuka.

## Langkah Berikutnya

Tahap berikutnya dapat mulai menyusun rencana implementasi teknis backend, termasuk urutan migration SQL, helper RLS, bucket Storage, Edge Function, data dummy, dan test plan. Implementasi tetap perlu dilakukan bertahap dan diuji di project Supabase baru, bukan pada database produksi lama.
