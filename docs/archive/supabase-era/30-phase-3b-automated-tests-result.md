# 30 - Phase 3B Automated Tests Result

## Ringkasan

Fase 3B-3 menyatukan validasi backend lokal ke satu runner utama:

```text
scripts/run-local-backend-tests.ps1
```

Runner ini tidak membuat project online, tidak menjalankan `supabase link`, tidak melakukan deploy, tidak memakai data asli, tidak membuat `.env.local`, dan tidak mengubah frontend.

Hasil akhir runner:

```text
SUMMARY passed=40 failed=0
```

## Test Runner yang Dibuat

File baru:

```text
scripts/run-local-backend-tests.ps1
```

Tanggung jawab runner:

- memastikan target hanya local: `http://127.0.0.1:55321`, `localhost`, atau `::1`;
- menjalankan production guard;
- memastikan API lokal, DB lokal, dan container DB Supabase lokal aktif;
- menjalankan validasi migration order;
- menjalankan validasi seed dummy-only;
- menjalankan no-secret scan;
- menjalankan pemeriksaan schema penting secara read-only;
- menjalankan smoke test Auth, RLS, Storage, dan Edge Function;
- menampilkan ringkasan `passed` dan `failed`;
- keluar dengan exit code non-zero jika ada kegagalan.

Runner tidak mencetak key, token, password, internal email penuh, atau signed URL.

## Audit Test yang Tersedia

Script validasi yang dipakai:

- `scripts/check-production-guard.ps1`
- `scripts/validate-migration-order.ps1`
- `scripts/validate-seed-dummy-only.ps1`
- `scripts/validate-no-secrets.ps1`
- `scripts/run-local-runtime-smoke-tests.ps1`

Folder test skeleton yang tersedia:

- `supabase/tests/rls/run-rls-tests.ps1`
- `supabase/tests/storage/run-storage-tests.ps1`
- `supabase/tests/functions/run-function-tests.ps1`

Catatan:

- File di `supabase/tests/*` masih skeleton dan keluar `exit 2`.
- Cakupan kritis RLS, Storage, dan Edge Function saat ini dijalankan melalui `scripts/run-local-runtime-smoke-tests.ps1`.
- Tidak dibuat framework testing baru karena PowerShell runner sudah cukup untuk kebutuhan Fase 3B-3.

## Pemeriksaan Schema Read-Only

Runner menambahkan pemeriksaan berikut:

- seluruh 18 migration tercatat di `supabase_migrations.schema_migrations`;
- tidak ada kolom `password` pada tabel aplikasi di schema `public`;
- `santri.nomor_induk_qiroati` bertipe `text`;
- Nomor Induk Qiroati memiliki unique index;
- tidak ada `user_profiles` yatim terhadap `auth.users`;
- hanya satu membership aktif per santri;
- tabel sensitif memiliki RLS aktif;
- `payment_status_summary` tidak memiliki kolom nominal, metode pembayaran, catatan, atau transaction ID;
- bucket `avatars`, `website-assets`, dan `murojaah-recordings` tersedia;
- RPC `consume_auth_rate_limit` tersedia.

Semua pemeriksaan schema lulus.

## Smoke Test yang Dipertahankan

Smoke test yang tetap berjalan dan lulus:

- login admin;
- login guru;
- login santri melalui Nomor Induk Qiroati;
- error login generik;
- guru A hanya melihat santri kelas A;
- guru B hanya melihat santri kelas B;
- santri hanya melihat data sendiri;
- guru tidak membaca detail `payments`;
- guru hanya membaca status pembayaran;
- expenses hanya admin;
- anon hanya membaca konten published;
- anon dapat insert feedback tetapi tidak membaca daftar feedback;
- avatar sendiri berhasil;
- avatar user lain ditolak;
- MIME invalid ditolak;
- ukuran file invalid ditolak;
- reset password berhasil;
- Nomor Induk duplikat ditolak.

Hasil smoke test:

```text
SUMMARY passed=22 failed=0
```

## Hasil Runner Utama

Command yang dijalankan:

```text
powershell -ExecutionPolicy Bypass -File scripts/run-local-backend-tests.ps1 -SupabaseUrl http://127.0.0.1:55321
```

Hasil:

```text
SUMMARY passed=40 failed=0
```

Rincian ringkas:

- target local-only: lulus;
- production guard: lulus;
- local API health: lulus;
- local DB health: lulus;
- local Docker DB container: lulus;
- migration order validation: lulus;
- seed dummy-only validation: lulus;
- no-secret scan: lulus;
- schema checks: lulus;
- runtime smoke tests: lulus.

## Test yang Belum Tercakup

Belum dicakup secara formal:

- test SQL pgTAP atau runner database-native;
- test beban/concurrency untuk rate limit;
- test upload file aktual ke Storage, karena saat ini hanya signed upload URL yang diuji;
- test lifecycle penuh create/update/deactivate user untuk semua role;
- test export laporan Excel/PDF;
- test backup/restore, karena UI backup/restore memang ditunda;
- test frontend terhadap Supabase lokal.

## Status Supabase Vector

`supabase_vector` tetap dicatat sebagai non-blocker lokal.

Log read-only menunjukkan Vector gagal membaca source Docker logs dengan error jaringan lokal:

```text
docker_logs: Listing currently running containers failed
Network unreachable
```

Tidak ada perubahan schema, migration, Edge Function, atau backend inti untuk memperbaiki Vector. Core Auth, REST, Storage, RLS, dan Edge Function tetap lulus test.

## File Berubah

File baru:

- `scripts/run-local-backend-tests.ps1`
- `docs/30-phase-3b-automated-tests-result.md`

File yang dibaca/diaudit tetapi tidak perlu diubah:

- `scripts/run-local-runtime-smoke-tests.ps1`
- `scripts/check-production-guard.ps1`
- `scripts/validate-migration-order.ps1`
- `scripts/validate-seed-dummy-only.ps1`
- `scripts/validate-no-secrets.ps1`
- `supabase/tests/rls/run-rls-tests.ps1`
- `supabase/tests/storage/run-storage-tests.ps1`
- `supabase/tests/functions/run-function-tests.ps1`

Tidak berubah:

- `src/`
- `.env.local`
- `_private_reference/`
- backup database

## Rekomendasi Menuju Integrasi Frontend Lokal

1. Jalankan `scripts/run-local-backend-tests.ps1` sebelum mulai menghubungkan frontend ke Supabase lokal.
2. Siapkan `.env.local` frontend hanya setelah keputusan integrasi dimulai, dan jangan commit file tersebut.
3. Hubungkan frontend ke Supabase lokal secara bertahap: Auth dulu, lalu data santri/guru/kelas, lalu absensi, pembayaran, dan Storage.
4. Setelah frontend mulai terhubung, tambahkan test integrasi UI ringan untuk login admin, guru, dan santri.
5. Biarkan `supabase_vector` sebagai catatan observability lokal selama core backend test tetap lulus.
