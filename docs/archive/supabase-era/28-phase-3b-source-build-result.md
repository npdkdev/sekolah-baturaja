# 28 - Phase 3B Source Build Result

## Ringkasan

Fase 3B-1 telah membuat source backend Supabase lokal untuk direview.

Yang dibuat:

- struktur `supabase/`;
- migration SQL timestamp resmi Supabase;
- Edge Function inti;
- shared helper Edge Function;
- seed dummy local/staging;
- skeleton test;
- script validasi keamanan;
- dokumentasi hasil ini.

Yang tidak dilakukan:

- tidak menjalankan Supabase CLI;
- tidak menjalankan Docker;
- tidak menjalankan SQL;
- tidak menjalankan migration;
- tidak menjalankan seed;
- tidak menjalankan Edge Function;
- tidak membuat project Supabase online;
- tidak membuat `.env.local`;
- tidak mengubah frontend `src/`;
- tidak membaca backup untuk membuat seed;
- tidak deploy;
- tidak push Git.

## File yang Dibuat

Konfigurasi:

- `supabase/config.toml`

Migration:

- `supabase/migrations/20260624000100_extensions_and_types.sql`
- `supabase/migrations/20260624000200_user_profiles_and_roles.sql`
- `supabase/migrations/20260624000300_guru_santri_and_auth_aliases.sql`
- `supabase/migrations/20260624000400_classes_memberships_and_mutations.sql`
- `supabase/migrations/20260624000500_class_assignments.sql`
- `supabase/migrations/20260624000600_attendance.sql`
- `supabase/migrations/20260624000700_payments_expenses_and_payment_status.sql`
- `supabase/migrations/20260624000800_hafalan_and_murojaah.sql`
- `supabase/migrations/20260624000900_academic_calendar.sql`
- `supabase/migrations/20260624001000_mmq_core.sql`
- `supabase/migrations/20260624001100_mmq_assignments_extension.sql`
- `supabase/migrations/20260624001200_content_news_announcements_feedbacks.sql`
- `supabase/migrations/20260624001300_notifications_and_santri_notes.sql`
- `supabase/migrations/20260624001400_audit_triggers_and_updated_at.sql`
- `supabase/migrations/20260624001500_rls_helper_functions.sql`
- `supabase/migrations/20260624001600_rls_policies.sql`
- `supabase/migrations/20260624001700_storage_buckets_and_policies.sql`
- `supabase/migrations/20260624001800_indexes_and_final_constraints.sql`

Edge Function inti:

- `supabase/functions/signin-with-nomor-induk/index.ts`
- `supabase/functions/manage-user/index.ts`
- `supabase/functions/reset-user-password/index.ts`
- `supabase/functions/generate-signed-upload-url/index.ts`

Shared helper:

- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/cors.ts`
- `supabase/functions/_shared/rateLimit.ts`
- `supabase/functions/_shared/response.ts`
- `supabase/functions/_shared/roles.ts`
- `supabase/functions/_shared/safeLogger.ts`
- `supabase/functions/_shared/supabaseAdmin.ts`
- `supabase/functions/_shared/validation.ts`

Seed dan test:

- `supabase/seed.sql`
- `supabase/tests/fixtures/README.md`
- `supabase/tests/fixtures/auth-and-seed-safety.md`
- `supabase/tests/functions/run-function-tests.ps1`
- `supabase/tests/rls/run-rls-tests.ps1`
- `supabase/tests/storage/run-storage-tests.ps1`

Script:

- `scripts/bootstrap-dummy-auth-users.ps1`
- `scripts/check-production-guard.ps1`
- `scripts/validate-migration-order.ps1`
- `scripts/validate-no-secrets.ps1`
- `scripts/validate-seed-dummy-only.ps1`

Dokumentasi:

- `docs/28-phase-3b-source-build-result.md`

## Migration yang Dibuat

Migration mengikuti pola resmi Supabase:

```text
<timestamp>_<name>.sql
```

Urutan logis 0001-0018 ditulis sebagai komentar di bagian atas setiap file.

Koreksi dependency yang sudah diterapkan:

- `20260624000500_class_assignments.sql` hanya membuat assignment kelas.
- Tidak ada referensi `mmq_schedule` sebelum `20260624001000_mmq_core.sql`.
- `20260624001000_mmq_core.sql` membuat tabel MMQ.
- `20260624001100_mmq_assignments_extension.sql` baru menambahkan kolom/FK assignment MMQ.
- Tidak ada migration seed.

## Edge Function yang Dibuat

Function inti yang dibuat:

- `signin-with-nomor-induk`
- `manage-user`
- `reset-user-password`
- `generate-signed-upload-url`

Function yang sengaja tidak dibuat:

- `import-master-data`
- `export-sensitive-report`

Alasan:

- Keduanya deferred/opsional.
- Prompt meminta tidak membuat source kosong yang terlihat siap dipakai.

## Helper yang Dibuat

Helper Edge Function mencakup:

- CORS dengan allowlist origin;
- response JSON konsisten;
- verifikasi Authorization user;
- pembacaan role dari backend;
- client service-role server-side;
- validasi input;
- logging aman;
- rate limit persisten via RPC database.

Catatan rate limit:

- Tidak memakai memory process.
- `signin-with-nomor-induk` memakai RPC `consume_auth_rate_limit`.
- Jika RPC rate limit tidak tersedia, login ditolak dengan pesan bahwa function belum siap production.

## Seed Dummy

Seed dibuat di:

- `supabase/seed.sql`

Prinsip seed:

- hanya untuk local/staging;
- bukan migration;
- tidak boleh dijalankan di production;
- memakai identitas `Demo` dan `Dummy`;
- tidak memakai data dari backup;
- tidak memakai NIK, nomor KK, nomor HP, alamat asli, RFID asli, avatar asli, atau data pribadi.

Catatan Auth:

- `seed.sql` mengasumsikan akun Auth dummy sudah dibuat.
- Script `scripts/bootstrap-dummy-auth-users.ps1` dibuat sebagai skeleton aman dan belum mengimplementasikan operasi Auth sampai Supabase local tersedia.

## Test Skeleton

Skeleton test dibuat untuk:

- RLS;
- Storage;
- Edge Function;
- fixture dan seed safety.

Status:

- Test skeleton belum dijalankan.
- File test sengaja keluar dengan exit code non-zero agar tidak ada klaim palsu bahwa test sudah lulus.

## Script Validasi

Script yang dibuat:

- `validate-no-secrets.ps1`
- `validate-migration-order.ps1`
- `validate-seed-dummy-only.ps1`
- `check-production-guard.ps1`

Semua script dirancang gagal dengan exit code non-zero jika menemukan pelanggaran.

## Hasil Validasi Statis

Validasi yang dijalankan:

```text
powershell -ExecutionPolicy Bypass -File scripts/validate-migration-order.ps1
```

Hasil:

```text
Migration order and MMQ dependency checks passed.
```

```text
powershell -ExecutionPolicy Bypass -File scripts/validate-seed-dummy-only.ps1
```

Hasil:

```text
Seed dummy-only checks passed.
```

```text
powershell -ExecutionPolicy Bypass -File scripts/check-production-guard.ps1
```

Hasil:

```text
Production guard checks passed for target 'local'.
```

```text
powershell -ExecutionPolicy Bypass -File scripts/validate-no-secrets.ps1
```

Hasil:

```text
No obvious committed secrets found.
```

Validasi tambahan:

- nama migration mengikuti pola timestamp;
- tidak ada file migration `0001_*.sql`;
- tidak ada migration seed;
- tidak ada perubahan pada `src/`;
- `git diff --check` tidak menemukan whitespace error.

## Hal yang Belum Diuji

Belum diuji karena dilarang pada Fase 3B-1:

- Supabase CLI;
- Docker;
- eksekusi migration;
- eksekusi SQL;
- `supabase db reset`;
- `supabase start`;
- Edge Function runtime;
- RLS runtime dengan token asli;
- Storage policy runtime;
- seed runtime;
- integrasi frontend.

Backend belum boleh dianggap berhasil berjalan sampai Fase 3B-2 menjalankan Supabase lokal dan test.

## Risiko Tersisa

- SQL belum divalidasi oleh parser/database PostgreSQL karena belum dijalankan.
- Beberapa policy RLS dan Storage mungkin perlu koreksi setelah diuji di Supabase lokal.
- Edge Function belum dikompilasi/dijalankan oleh Deno runtime.
- Bootstrap Auth dummy masih skeleton dan perlu implementasi setelah Supabase lokal tersedia.
- `payment_status_summary` perlu diuji runtime untuk memastikan guru mendapat status saja dan tidak detail transaksi.
- Storage policy perlu diuji untuk memastikan path UUID invalid tidak menghasilkan error tak terduga.

## Daftar File yang Berubah

Area yang berubah:

- `supabase/`
- `scripts/`
- `docs/28-phase-3b-source-build-result.md`

Area yang tidak berubah:

- `src/`
- `.env.local`
- `_private_reference/`
- backup database lokal

## Rekomendasi Fase 3B-2

Langkah berikutnya:

1. Review source backend secara manual.
2. Jalankan validasi statis ulang.
3. Jika disetujui, jalankan Supabase lokal dengan `supabase start`.
4. Jalankan migration di local melalui `supabase db reset`.
5. Perbaiki SQL yang gagal parsing/runtime.
6. Implementasikan bootstrap Auth dummy lokal.
7. Jalankan seed dummy hanya di local.
8. Jalankan test RLS, Storage, dan Edge Function.
9. Dokumentasikan hasil runtime tanpa data asli.

Fase 3B-2 tetap tidak boleh menyentuh database produksi lama atau memakai data dari backup asli.
