# 14 - Backend Architecture Proposal

## Ringkasan

Backend baru LPQ Al-Fath Maulana dirancang sebagai project Supabase baru yang bersih. Desain ini tidak menyalin RLS lama, tidak memakai password plaintext lama, dan tidak membuat JWT custom jika Supabase Auth resmi sudah cukup.

Fase 2 ini hanya desain. Belum ada project Supabase, migration SQL, restore database, deployment, atau perubahan frontend.

## Keputusan Final Fase 2

Seluruh keputusan desain Fase 2 pada dokumen ini dianggap final untuk tahap perancangan backend.

- Santri login dengan Nomor Induk Qiroati sebagai username dan password.
- Password awal santri dibuat oleh admin melalui alur akun resmi Supabase Auth.
- Email internal santri hanya identifier teknis Supabase Auth di belakang layar, tidak ditampilkan kepada santri/wali, dan tidak dipakai pada form login.
- Edge Function login santri memetakan Nomor Induk Qiroati ke akun Supabase Auth, memverifikasi password lewat Supabase Auth, lalu mengembalikan session Supabase Auth resmi tanpa JWT custom.
- Nomor Induk Qiroati memakai format resmi lembaga, wajib unik, konsisten, tanpa spasi, dan disimpan sebagai `text` agar angka nol di depan tidak hilang.
- Santri boleh mengubah foto profilnya sendiri pada folder Storage miliknya.
- Guru hanya boleh melihat status pembayaran santri di kelasnya sebagai `Lunas` atau `Belum Lunas`, tanpa nominal, metode pembayaran, catatan transaksi, atau detail keuangan lain.
- Soft delete disimpan permanen sampai dibersihkan oleh admin teknis.
- Feedback lama tidak dimigrasikan.

## Prinsip Arsitektur

1. **Supabase Auth resmi untuk semua role**
   Admin, guru, santri, dan pentashih semuanya memiliki user di `auth.users`.

2. **Data profil dipisah dari autentikasi**
   Password dikelola Supabase Auth. Tabel aplikasi seperti `santri` dan `guru` hanya menyimpan data profil/operasional.

3. **RLS dirancang dari nol**
   Policy lama tidak dipakai ulang karena terlalu permisif. Semua akses harus berdasarkan role dan relasi data.

4. **Frontend tetap kompatibel sebisa mungkin**
   Karena frontend saat ini banyak memakai `user.id`, maka `santri.id` dan `guru.id` direkomendasikan sama dengan `auth.users.id`.

5. **Fitur inti dulu**
   Forum, journey, music player, game/gatcha, quiz, top score, random name, dan backup/restore UI dicatat sebagai fitur tertunda.

## Modul Backend

| Modul | Isi |
|---|---|
| Identity | `user_profiles`, `auth_login_aliases`, role, status akun. |
| Santri & Guru | `santri`, `guru`, data profil, RFID, kelas aktif, kontak. |
| Kelas | `classes`, `class_memberships`, `class_mutations`. |
| Absensi | `attendance`, koreksi absensi, RFID kiosk, TV Display. |
| Hafalan & Murojaah | `hafalan_items`, `hafalan_progress`, `murojaah_submissions`, `santri_notes`. |
| Keuangan | `payments`, `expenses`. |
| Kalender | `academic_calendar`. |
| MMQ | `mmq_schedule`, `mmq_attendance`, `mmq_notulensi`, assignment pentashih. |
| Konten Publik | `website_content`, `news`, `announcements`, `feedbacks`. |
| Notifikasi | `notifications`. |
| Storage | `avatars`, `website-assets`, `murojaah-recordings`. |
| Edge Function | auth admin/user, login santri, signed upload, export sensitif. |

## Alur Data Utama

### Login Admin/Guru/Pentashih

1. User memasukkan email dan password.
2. Frontend memanggil Supabase Auth `signInWithPassword`.
3. Session Supabase Auth dibuat.
4. Frontend membaca role dari metadata/profil.
5. RLS memakai `auth.uid()` dan role dari profil/claim.

### Login Santri

1. Santri/wali memasukkan Nomor Induk Qiroati dan password.
2. Frontend memanggil Edge Function `signin-with-nomor-induk`.
3. Edge Function mencari mapping nomor induk pada `auth_login_aliases`.
4. Edge Function melakukan sign-in ke Supabase Auth menggunakan email internal akun santri.
5. Edge Function mengembalikan session Supabase Auth resmi.
6. Frontend memakai session itu seperti user Supabase biasa.

Catatan: tidak ada JWT custom, tidak ada password plaintext di tabel `santri`, dan email internal tidak pernah ditampilkan kepada santri/wali.

### Guru Mengelola Santri Kelasnya

1. Guru login.
2. RLS mengecek apakah santri terkait ada pada `class_memberships` aktif untuk kelas yang diampu guru.
3. Guru hanya bisa membaca/mengubah data akademik santri kelasnya.
4. Guru hanya boleh melihat status pembayaran santri kelasnya dalam bentuk `Lunas` atau `Belum Lunas`.
5. Guru tidak bisa membaca nominal, metode pembayaran, catatan transaksi, detail transaksi, pengeluaran lembaga, dan tidak bisa menghapus pembayaran.

### Foto Profil Santri

1. Foto profil santri disimpan di bucket `avatars` dengan path tetap `avatars/santri/<auth.uid()>/profile.webp`.
2. Santri boleh upload, mengganti, dan menghapus foto profil miliknya sendiri.
3. Santri tidak boleh mengubah foto santri lain.
4. Admin boleh mengelola seluruh foto profil.
5. Guru hanya boleh mengelola foto profil santri pada kelas yang diampu.
6. Upload baru menggantikan file lama agar foto tidak menumpuk.
7. Validasi tipe dan ukuran file dilakukan di frontend dan server/Storage policy atau Edge Function.

### Pentashih

1. Pentashih login sebagai user Supabase Auth.
2. Aksesnya ditentukan oleh `pentashih_class_assignments`.
3. Pentashih hanya melihat kelas, santri, MMQ, dan evaluasi yang ditugaskan.
4. Pentashih bukan admin dan tidak otomatis melihat seluruh data.

## Kompatibilitas Frontend

Beberapa penyesuaian frontend kemungkinan dibutuhkan pada fase implementasi berikutnya:

- Role `pentashih` sebaiknya dibaca sebagai role utama, bukan hanya `guru.roles = ['Pentashih']`.
- `current_class_id` pada `santri` disediakan untuk kompatibilitas cepat dengan query lama.
- `class_memberships` menjadi sumber kebenaran riwayat kelas dan RLS.
- `website_content` tetap dipakai untuk konten global, tetapi berita/pengumuman baru memakai tabel terpisah.

## Deferred Features

Belum menjadi kebutuhan inti Fase 2:

- forum
- journey
- music player
- game/gatcha
- quiz
- top score
- random name
- backup/restore UI

Tabel lama yang terkait fitur ini tidak perlu dibuat pada migration inti pertama. Jika nanti diaktifkan, desain RLS dan storage harus dibuat terpisah.

## Keamanan Dasar

- Jangan gunakan service-role key di frontend.
- Edge Function boleh memakai service-role key hanya di server.
- Jangan expose tabel private seperti `auth_login_aliases` ke client.
- Jangan memakai `select('*')` untuk data sensitif pada implementasi frontend berikutnya.
- Gunakan soft delete untuk data profil dan transaksi penting, dan simpan permanen sampai dibersihkan oleh admin teknis.
- Gunakan audit field pada data operasional.

## Urutan Implementasi yang Disarankan Setelah Desain Disetujui

1. Buat migration schema kosong untuk tabel inti.
2. Buat helper role dan RLS.
3. Buat storage bucket dan policy.
4. Buat Edge Function minimal: `manage-user`, `signin-with-nomor-induk`, `generate-signed-upload-url`.
5. Uji dengan data dummy.
6. Baru rancang migrasi data asli.
