# 08 - Questions Before Implementation

## Keputusan Produk

1. Nama final website apakah **LPQ Al-Fath Maulana 2** tampil di publik, atau hanya nama internal proyek sementara?
2. Domain final apa yang akan dipakai?
3. Apakah semua fitur Horizon lama harus dipertahankan, atau ada yang boleh dihapus?
4. Fitur mana yang paling prioritas untuk launching pertama: profil publik, pendaftaran, dashboard, absensi, pembayaran, atau konten?
5. Apakah halaman game, gatcha, quiz, top score, random name tetap dipakai?
6. Apakah TV display dan absensi digital akan dipakai di lokasi fisik?

## Keputusan Data

1. Data mana yang harus dimigrasikan dari database lama?
2. Data mana yang boleh ditinggalkan sebagai arsip?
3. Apakah riwayat pembayaran lama wajib masuk sistem baru?
4. Apakah riwayat absensi lama wajib masuk sistem baru?
5. Apakah foto dan asset lama perlu dipindahkan semua, atau hanya logo/konten resmi?
6. Apakah data sensitif seperti NIK/nomor KK masih perlu disimpan di sistem baru?

## Keputusan Auth

1. Apakah santri harus punya akun login sendiri?
2. Jika ya, apakah santri login dengan email, nomor induk, nama panggilan, atau OTP?
3. Apakah guru dibuat oleh admin saja, atau boleh daftar sendiri dari halaman login?
4. Apakah role `Pentashih` tetap dipakai?
5. Apakah admin utama akan memakai email resmi lembaga?

## Keputusan RLS dan Akses

1. Admin boleh melihat semua data?
2. Guru hanya boleh melihat santri di kelasnya, atau semua santri?
3. Santri/wali boleh melihat data pembayaran dan absensi sendiri saja?
4. Siapa yang boleh edit data santri: admin saja, guru, atau santri/wali juga?
5. Siapa yang boleh hapus pembayaran dan absensi?

## Keputusan Fitur Keuangan

1. Pembayaran hanya dicatat manual, atau akan ada payment gateway?
2. Bukti pembayaran dikirim via WhatsApp manual, PDF, atau email?
3. Data pengeluaran hanya untuk admin tertentu atau semua admin?
4. Apakah laporan keuangan perlu export Excel/PDF?

## Keputusan Konten

1. Apakah berita/pengumuman tetap disimpan di `website_content`, atau dipisah ke tabel `news` dan `announcements`?
2. Siapa yang boleh mengelola konten website?
3. Apakah forum diskusi tetap dipakai?
4. Apakah galeri memakai upload admin saja?
5. Apakah video hafalan berasal dari YouTube, Google Drive, atau Storage sendiri?

## Keputusan Operasional

1. Apakah RFID/tag absensi akan tetap dipakai?
2. Format sesi mengaji final apa saja: Pagi, Siang, Sore, Malam, atau berbeda?
3. Apakah MMQ memakai jadwal tetap mingguan?
4. Apakah kalender akademik perlu hari libur nasional otomatis atau manual?
5. Apakah sistem backup/restore perlu ada di UI admin, atau cukup backup dari Supabase dashboard?

## Rekomendasi Jawaban Awal untuk Pemula

Untuk mulai aman, saya sarankan:

1. Launch pertama fokus pada website publik, login admin/guru, data santri, kelas, absensi, pembayaran, dan konten.
2. Game, TV display, backup/restore UI, dan fitur eksperimen ditunda sampai core stabil.
3. Santri login dibuat aman tanpa mock session.
4. RLS dibuat ketat dari awal.
5. Data asli dimigrasikan setelah semua fitur inti lulus testing dengan data dummy.
