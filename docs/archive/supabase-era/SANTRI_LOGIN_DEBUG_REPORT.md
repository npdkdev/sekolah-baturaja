
# Laporan Investigasi dan Debugging Login Santri

**Tanggal:** 2026-06-23
**Kasus:** Santri dengan Nama Panggilan 'Abdurrahman' dan Nomor Induk '353989' gagal login dengan pesan "Email atau Password Salah".

## 1. Temuan Investigasi
Berdasarkan pengecekan mendalam terhadap alur login (`LoginPage.jsx` -> `SupabaseAuthContext.jsx` -> `RPC signin_with_username`), ditemukan bahwa akar masalah utama adalah **penanganan spasi kosong (whitespace)**.

1. **Input Pengguna (Client-side):** Seringkali saat mengetik di perangkat mobile atau menggunakan autofill, sebuah spasi tambahan (trailing space) ikut terinput di akhir username atau password (misal: `"Abdurrahman "` alih-alih `"Abdurrahman"`).
2. **Penyimpanan Database (Server-side):** Data yang diimpor dari Excel/sumber luar ke tabel `public.santri` terkadang memiliki karakter spasi tersembunyi pada kolom `nama_panggilan` atau `nomor_induk_qiroati`.
3. **Logika Pengecekan:** Fungsi RPC sebelumnya menggunakan pengecekan *exact match* yang ketat (kecuali untuk huruf besar/kecil):
   `lower(nama_panggilan) = lower(p_username) AND nomor_induk_qiroati = p_password`.
   Jika ada selisih satu spasi saja, pengecekan ini akan gagal dan mengembalikan `NULL`, memicu error "Email atau Password Salah" di sisi klien.

## 2. Tindakan Perbaikan (Fixes Applied)

**A. Sisi Database (RPC `signin_with_username`)**
Fungsi telah diperbarui untuk sangat toleran terhadap whitespace dengan menerapkan fungsi `trim()` pada semua komparasi:
