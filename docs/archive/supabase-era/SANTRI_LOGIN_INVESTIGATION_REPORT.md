
# Laporan Investigasi dan Audit Alur Login Santri

**Tanggal Audit:** 2026-06-23
**Fokus Audit:** Autentikasi Santri, RPC `signin_with_username`, Context Auth, dan Dashboard Data.

---

## 1. Investigasi Alur Login Saat Ini
### `LoginPage.jsx`
- **Form Input:** Menggunakan input teks standar untuk `username` dan input password untuk `password`. Keduanya terhubung dengan state lokal.
- **Submission Handler:** Fungsi `handleSubmit` memanggil `signInWithUsername(username, password)` dari `useAuth()`.
- **Error Handling:** Pesan error dari server ditangkap dengan baik. Ada fallback pesan berbahasa Indonesia jika terjadi error network atau invalid credentials.

### `SupabaseAuthContext.jsx`
- **Login Function:** Terdapat fungsi `signInWithUsername` yang berfungsi sebagai custom login handler.
- **Mekanisme Fallback:** Fungsi mencoba login menggunakan default `signInWithPassword` (Auth standar). Jika gagal dengan pesan 'Invalid login credentials', maka fungsi akan memanggil RPC Postgres `signin_with_username`.
- **Token Storage:** Jika RPC berhasil mengembalikan `access_token` dan `refresh_token`, context akan menjalankan `supabase.auth.setSession()`, sehingga token tersimpan dengan standar keamanan Supabase di localStorage.

### Fungsi Database `signin_with_username`
- **Credentials:** Fungsi telah benar mengecek tabel santri dengan prioritas:
  1. *Email + Password* (Untuk Santri Dewasa).
  2. *Nama Panggilan + Nomor Induk Qiroati* (Untuk Santri Anak/TPQ).
- **Format Pengecekan:** Pengecekan username bersifat *case-insensitive* (`lower(nama_panggilan) = lower(p_username)`), sedangkan password dilakukan *exact match*.

### Sumber Data
- **Live Data:** Autentikasi secara eksplisit melakukan query ke tabel `public.santri`. Tidak ada tanda-tanda pengalihan ke tabel test.

---

## 2. Perbaikan pada Fungsi `signin_with_username`
Meskipun query sudah mengambil dari `santri` (Live data), telah dilakukan penguatan (hardening) keamanan pada fungsi RPC di database:
1. **Eksplisit Public Schema:** Menambahkan `public.santri` untuk memastikan tidak ada resolusi schema yang salah.
2. **Filter Status Aktif:** Menambahkan kondisi `AND status = 'Aktif'` agar santri yang sudah lulus atau non-aktif tidak bisa login ke dalam dashboard menggunakan kredensial lama mereka.
3. **Response Lengkap:** Fungsi berhasil membentuk response `user_metadata` yang berisi `role: 'santri'`, `nama_lengkap`, dan `kategori`.

---

## 3. Verifikasi `SupabaseAuthContext.jsx`
- **Koneksi RPC:** Memanggil fungsi `signin_with_username` dengan sempurna mengirim parameter `p_username` dan `p_password`.
- **Manajemen Sesi:** Setelah menerima JWT custom dari Postgres, `setSession` mengeksekusinya tanpa mengubah struktur internal Supabase, sehingga status autentikasi di-*broadcast* ke seluruh komponen React dengan baik.
- **User Metadata:** Metadata tersimpan dengan benar di objek session pengguna.

---

## 4. Verifikasi `SantriDashboard.jsx` (Live Data)
- **Data Fetching:** Komponen dashboard langsung mengambil data menggunakan ID dari session (`user.id`) melalui fungsi `initializeData`.
- **Query Live Data:** Dashboard melakukan query `supabase.from('santri').select(...).eq('id', user.id).single()`. Hal ini terkonfirmasi mengambil langsung dari koleksi tabel `santri` Live.
- **Dependensi Lain:** Semua query terkait absensi (`attendance`), hafalan (`hafalan_progress`), dan riwayat (`murojaah_submissions`) menggunakan foreign key `santri.id` yang sah di database Live.
- **Tidak Ada Isu UI/UX:** Tampilan dan fungsionalitas UI tidak berubah dan tidak ada error di console yang memengaruhi render.

---

**Kesimpulan:**
Alur login santri sudah berjalan sepenuhnya di environment **Live Data** dengan menggunakan tabel `public.santri`. Perbaikan kecil di tingkat SQL telah diterapkan untuk meningkatkan keamanan (hanya santri dengan status 'Aktif' yang dapat login). Tidak ada perbaikan komponen React yang diperlukan, karena arsitektur klien sudah solid dan menangani Custom JWT Token RPC dengan baik.
