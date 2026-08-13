# Hasil Aturan Satu Pembayaran per Periode

## Ringkasan

Integrasi pembayaran frontend inti sudah tercatat pada commit lokal `d988469 feat: integrate core payment workflows with Supabase`. Repository kemudian dilanjutkan untuk menegakkan keputusan bisnis final: satu santri hanya boleh memiliki satu pembayaran aktif untuk kombinasi bulan dan tahun yang sama.

Perubahan aturan periode ini belum dikomit agar dapat diuji terlebih dahulu melalui browser.

## File yang Dibuat atau Diubah

- `supabase/migrations/20260624002000_payments_period_uniqueness.sql`
- `src/lib/paymentAdapters.js`
- `scripts/run-local-backend-tests.ps1`
- `scripts/validate-migration-order.ps1`
- `docs/42-payment-period-uniqueness-result.md`

## Migration yang Dibuat

Migration baru:

`supabase/migrations/20260624002000_payments_period_uniqueness.sql`

Isi utama migration:

- Memeriksa duplikasi aktif sebelum constraint dibuat.
- Gagal dengan pesan jelas jika ada lebih dari satu pembayaran aktif untuk kombinasi `santri_id`, `bulan`, dan `tahun`.
- Membuat partial unique index:

```sql
create unique index if not exists payments_active_santri_bulan_tahun_unique
  on public.payments (santri_id, bulan, tahun)
  where deleted_at is null
    and bulan is not null
    and tahun is not null;
```

Index ini hanya berlaku untuk record aktif karena tabel `payments` memakai soft delete melalui `deleted_at`. Unique constraint `transaction_id` yang sudah ada tetap dipertahankan.

## Perubahan Frontend

`src/lib/paymentAdapters.js` diperbarui agar error unique violation dari index `payments_active_santri_bulan_tahun_unique` ditampilkan ramah:

`Pembayaran santri untuk bulan dan tahun tersebut sudah tercatat.`

Database tetap menjadi sumber kebenaran. Frontend tidak mengandalkan query cek sebelum insert sebagai satu-satunya proteksi.

## Perubahan Test

`scripts/run-local-backend-tests.ps1` diperbarui untuk:

- mengenali migration baru;
- memastikan index `payments_active_santri_bulan_tahun_unique` tersedia;
- menguji aturan satu pembayaran per santri, bulan, dan tahun;
- memastikan pembayaran bulan berbeda, tahun berbeda, dan santri berbeda tetap diperbolehkan;
- memastikan update pembayaran tidak boleh menabrak periode milik record lain;
- memastikan pembuatan ulang setelah delete sah mengikuti model delete aktual.

`scripts/validate-migration-order.ps1` diperbarui agar urutan migration mencakup file baru.

## Hasil Verifikasi

- `supabase db reset`: berhasil, migration `20260624002000` diterapkan.
- Bootstrap akun Auth dummy lokal: berhasil.
- Seed dummy lokal: berhasil.
- Backend runner lokal: berhasil, `49/49`.
- Test pembayaran lokal: berhasil, `13/13`.
- `npm run build`: berhasil.
- `git diff --check`: berhasil.
- No-secret scan: berhasil, tidak menemukan secret yang jelas.

## Test Pembayaran yang Lulus

- Pembayaran pertama untuk periode tertentu berhasil.
- Pembayaran kedua untuk santri, bulan, dan tahun yang sama ditolak.
- Pembayaran bulan berbeda berhasil.
- Pembayaran tahun berbeda berhasil.
- Santri berbeda pada periode yang sama berhasil.
- Edit pembayaran yang menabrak periode record lain ditolak.
- Guru tetap hanya membaca status pembayaran.
- Guru tetap gagal membaca detail tabel `payments`.
- Santri tetap hanya membaca pembayaran sendiri.
- Rekap admin tetap tidak crash.

## Catatan Keamanan

- Tidak ada service-role key di frontend.
- Tidak ada perubahan RLS.
- Tidak ada akses ke Supabase online.
- Tidak ada akses ke database produksi lama.
- Tidak ada data asli yang digunakan.
- Tidak ada deploy dan tidak ada `supabase link`.

## Status

Aturan satu pembayaran per bulan dan tahun sudah siap diuji lokal. Perubahan migration dan test sengaja belum dikomit.
