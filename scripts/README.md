# scripts/

Perkakas operasional. Sebagian besar berasal dari era Supabase dan statusnya
berbeda-beda — baca klasifikasi di bawah sebelum menjalankan apa pun.

## Masih dibutuhkan: perkakas cutover

Membaca data dari Supabase **produksi** untuk dipindahkan ke Postgres sendiri.
Jangan dihapus sebelum migrasi data benar-benar selesai.

| Berkas | Fungsi |
|---|---|
| `prepare-production-migration.mjs` | Menyiapkan payload migrasi dari produksi |
| `import-production-migration-local.mjs` | Mengimpor hasilnya ke instance lokal |
| `promote-staging-production-data.mjs` | Mempromosikan data staging → produksi |
| `upload-migrated-assets-local.mjs` | Memindahkan berkas storage |
| `run-production-migration-rehearsal.ps1` | Gladi bersih migrasi |
| `run-production-data-promotion.ps1` | Pembungkus promosi data |
| `validate-production-migration-local.ps1` | Validasi hasil migrasi lokal |

Semuanya butuh Supabase CLI dan/atau `SUPABASE_URL` + service-role key.

## Masih berlaku: validasi repo

Tidak menyentuh Supabase, aman dijalankan kapan saja.

| Berkas | Fungsi |
|---|---|
| `validate-migration-order.ps1` | Memastikan urutan berkas `db/migrations/` konsisten |
| `validate-seed-dummy-only.ps1` | Memastikan `db/seed.sql` tidak memuat data nyata |
| `validate-no-secrets.ps1` | Memindai kredensial yang bocor di `db/`, `scripts/`, `docs/` |
| `validate-no-legacy-class-column.ps1` | Mencegah kolom kelas lama muncul kembali |
| `check-production-guard.ps1` | Menolak perintah destruktif yang menyasar produksi |

## Usang: staging Supabase

Menargetkan project Supabase staging yang sudah ditinggalkan. Dipertahankan
hanya sebagai rujukan sampai cutover ditutup.

`bootstrap-dummy-auth-users.ps1`, `bootstrap-staging-test-data.ps1`,
`clear-staging-application-data.mjs`, `run-staging-cleanup.ps1`,
`run-staging-e2e-tests.ps1`, `apply-production-login-policy.mjs`,
`run-production-login-policy.ps1`, `run-local-runtime-smoke-tests.ps1`,
`run-migrated-assets-local.ps1`, `run-local-backend-tests.ps1`,
`test-default-spp-hafalan.ps1`, `test-frontend-staging-bugfixes.ps1`

Sebagian di antaranya membaca `supabase/functions/*` yang sudah dihapus, jadi
akan gagal di assertion tersebut.

## Sudah dihapus

Lima skrip `test-*.mjs` dibuang karena mengunci arsitektur yang tidak ada lagi —
misalnya meng-assert `supabase.rpc('increment_santri_points')` masih dipanggil
di `RandomNamePage.jsx`, padahal frontend sudah lepas dari Supabase. Skrip itu
juga tidak pernah bisa dijalankan Node polos, karena `src/lib` saling mengimpor
lewat alias `@` yang hanya dipahami Vite.

Assertion yang masih bernilai sudah diport ke Vitest di `tests/`:

```bash
npm test
```
