# Hasil Integrasi Frontend Pembayaran Inti

## Ringkasan

Integrasi pembayaran inti frontend sudah diarahkan ke Supabase lokal final untuk:

- pencatatan pembayaran santri oleh admin;
- riwayat pembayaran santri sendiri;
- status pembayaran guru melalui `payment_status_summary`;
- rekap pembayaran admin;
- penghapusan pembayaran hanya lewat aksi admin.

Tidak ada perubahan backend, migration, Supabase online, deployment, `supabase link`, service-role di frontend, data asli, atau database lama yang digunakan.

## File yang Diubah

- `src/lib/paymentAdapters.js`
  - Adapter kecil untuk bulan numerik, format periode, select kolom pembayaran, validasi nominal, dan pesan error pembayaran.

- `src/components/dashboard/admin/PaymentSystem.jsx`
  - Admin payment insert memakai schema final `payments`.
  - `bulan` dikirim sebagai angka `1-12`.
  - `tanggal_pembayaran`, `status = paid`, dan `transaction_id` unik per record dikirim eksplisit.
  - Riwayat pembayaran memilih kolom yang diperlukan saja.
  - Error RLS/duplikat/nominal ditampilkan lebih ramah.

- `src/components/dashboard/admin/PaymentHistory.jsx`
  - Query detail admin memakai select eksplisit.
  - Debug console dan banner audit lama dihapus dari runtime.
  - Filter dan tampilan bulan disesuaikan dengan angka `1-12`.
  - Delete tetap tersedia untuk admin dan mengandalkan RLS.

- `src/components/dashboard/admin/EditPaymentModal.jsx`
  - Edit pembayaran memakai bulan numerik dan validasi nominal.
  - Update mempertahankan status `paid`.
  - Error pembayaran memakai pesan ramah.

- `src/components/dashboard/admin/PaymentRecap.jsx`
  - Rekap admin memakai pembayaran `paid` yang belum terhapus.
  - Perhitungan bulan disesuaikan dengan schema final.

- `src/components/dashboard/admin/PaymentNotes.jsx`
  - Status bulanan memakai `payment_status_summary`.
  - Status yang ditampilkan hanya `Lunas` atau `Belum Lunas`.
  - Tombol reset semua riwayat pembayaran dihilangkan dari UI milestone ini.

- `src/components/dashboard/santri/SantriPaymentHistory.jsx`
  - Santri hanya membaca riwayat miliknya sendiri melalui RLS.
  - Query memakai kolom yang diperlukan saja.

- `src/components/dashboard/GuruDashboard.jsx`
  - Guru melihat status pembayaran terbatas dari `payment_status_summary`.
  - Guru tidak membaca tabel `payments` langsung dan tidak melihat nominal, metode, catatan, atau transaction ID.

## Hasil Test

- `npm run build`: lulus.
- Backend runner lokal: lulus `41/41`.
- `git diff --check`: lulus.
- No-secret scan: lulus.
- Test pembayaran lokal data dummy: lulus `9/9`.

Skenario pembayaran yang diuji:

- admin mencatat pembayaran;
- admin melihat detail pembayaran;
- admin mengubah pembayaran;
- admin menghapus pembayaran dummy;
- guru melihat status `Lunas`/`Belum Lunas` via `payment_status_summary`;
- guru gagal membaca detail `payments`;
- santri melihat pembayaran sendiri;
- santri gagal melihat pembayaran santri lain;
- query rekap admin tidak crash.

## Catatan Keamanan

- Frontend tetap memakai `src/lib/customSupabaseClient.js`.
- Tidak ada service-role key di frontend.
- Guru tidak mengambil detail pembayaran dari tabel `payments`.
- Santri tetap dibatasi oleh RLS ke data pembayaran miliknya sendiri.
- Penghapusan pembayaran tetap bergantung pada policy admin backend.

## Masalah Tersisa

- Backend saat ini memiliki unique constraint untuk `payments.transaction_id`, tetapi belum memiliki unique constraint atomik untuk kombinasi `santri_id + bulan + tahun` pembayaran SPP. Frontend melakukan pemeriksaan duplikasi untuk membantu admin, tetapi pencegahan race condition per periode sebaiknya ditambahkan pada fase backend berikutnya jika aturan satu pembayaran per periode harus dikunci di database.
- Bagian bukti pembayaran dan WhatsApp masih mengikuti UI lama dan belum menjadi fokus hardening mendalam pada milestone ini.
