# 05 - Security and Data Risks

## Prinsip Analisis

Backup lama berisi data asli dan sensitif. Laporan ini tidak menyalin data pribadi, password, token, NIK, nomor KK, atau isi tabel.

## Risiko Kritis

### 1. Koneksi Supabase Lama Hard-Code

Client Supabase masih hard-code URL project dan anon/publishable key di:

- `src/lib/customSupabaseClient.js`
- `lib/customSupabaseClient.js`

Risiko:

- Build lokal dan produksi baru bisa tetap membaca/menulis ke Supabase lama.
- Sulit membedakan data lama dan data baru.
- Key/token telanjur berada di source.

Rekomendasi:

- Pindahkan ke environment variable.
- Buat `.env.example` tanpa nilai asli.
- Putuskan koneksi ke project lama sebelum fase implementasi besar.

### 2. Fallback Mock Session Santri

`SupabaseAuthContext.jsx` membuat `mock_santri_session` di `localStorage` jika RPC login gagal tetapi data santri cocok.

Risiko:

- Frontend menganggap user login walau tidak punya session Supabase valid.
- RLS berbasis `auth.uid()` tidak berjalan untuk mock user.
- Bisa memunculkan perilaku berbeda antara UI dan database.

Rekomendasi:

- Hapus fallback mock session untuk produksi.
- Gunakan Supabase Auth resmi atau Edge Function yang mengeluarkan session/token dengan benar.

### 3. Data Password di Tabel Profil

Tabel `santri` dan `guru` memiliki kolom `password`. Frontend juga membandingkan password/nomor induk untuk fallback login.

Risiko:

- Password plaintext atau semi-plaintext dapat tersimpan di tabel aplikasi.
- Admin/client bisa membaca field yang seharusnya tidak boleh terekspos.

Rekomendasi:

- Jangan menyimpan password plaintext di tabel publik.
- Pindahkan autentikasi ke Supabase Auth atau hash server-side.
- Buat view/RLS agar data sensitif tidak pernah keluar ke client.

### 4. RLS Backup Terlalu Permisif

Schema backup menunjukkan banyak policy dengan pola permisif, misalnya akses untuk authenticated pada banyak operasi dan kondisi yang selalu benar.

Risiko:

- User login biasa dapat membaca/mengubah data yang bukan miliknya.
- Data santri, pembayaran, absensi, dan catatan guru bisa terekspos.
- Storage upload/update/delete terlalu longgar.

Rekomendasi:

- Jangan copy-paste policy lama.
- Rancang ulang RLS per role: anon, santri, guru, admin.
- Gunakan test matrix RLS sebelum input data asli.

### 5. Edge Function Tidak Tersedia

Frontend memanggil function penting seperti `manage-user`, `generate-signed-upload-url`, `backup-database`, dan `restore-database`, tetapi source tidak ada.

Risiko:

- Fitur akun guru, upload foto, backup, restore gagal.
- Jika function lama masih aktif di Supabase lama, frontend bisa tetap memanggil service lama.

Rekomendasi:

- Rebuild Edge Function di project baru.
- Gunakan service-role hanya di Edge Function server-side, tidak pernah di frontend.
- Audit izin setiap function sebelum produksi.

### 6. Data Pribadi di Query Client

Frontend mengambil banyak kolom sensitif dengan `select('*')`, termasuk data santri dan guru.

Risiko:

- Data pribadi terkirim ke browser meskipun tidak semua ditampilkan.
- RLS sulit dikontrol jika query terlalu luas.

Rekomendasi:

- Ganti `select('*')` dengan kolom spesifik.
- Buat view aman untuk dashboard.
- Pisahkan profil publik dan profil internal.

### 7. Branding dan Asset Lama

Masih ada URL Storage lama dan branding LPQ Al-Fath Maulana di beberapa file.

Risiko:

- Website baru menampilkan identitas lembaga lama.
- Asset masih dimuat dari Supabase lama.

Rekomendasi:

- Audit semua URL eksternal sebelum launch.
- Upload ulang asset resmi ke bucket project baru.
- Ganti konten/branding lewat manajemen konten baru.

## Data yang Perlu Dilindungi Saat Migrasi

- Identitas santri dan wali.
- Nomor induk, NIK, nomor KK.
- Nomor HP dan alamat.
- Riwayat pembayaran.
- Absensi.
- Foto profil.
- Catatan guru/admin.
- Kredensial/login.

## Rekomendasi Keamanan Awal

1. Buat Supabase baru kosong.
2. Buat schema bersih tanpa data.
3. Terapkan RLS ketat.
4. Uji semua role dengan akun dummy.
5. Migrasi data bertahap setelah schema dan RLS lolos.
6. Jangan hubungkan frontend baru ke database lama kecuali read-only audit yang disetujui.
