# 29 - Phase 3B Local Runtime Result

## Ringkasan

Fase 3B-2 berhasil dijalankan pada Supabase lokal.

Hasil akhir:

- `supabase db reset` berhasil menerapkan migration 0001 sampai 0018.
- Seed otomatis Supabase CLI dinonaktifkan agar `seed.sql` tidak berjalan sebelum `auth.users` dummy tersedia.
- Akun Auth dummy dibuat melalui Admin Auth API lokal.
- `supabase/seed.sql` berhasil dijalankan setelah Auth dummy tersedia.
- Seed dummy aplikasi aman dijalankan ulang dan tidak menggandakan data.
- Smoke test lokal Auth, RLS, Storage signed upload, dan Edge Function lulus `22/22`.
- Tidak ada project online, Supabase lama, migration production, data asli, service-role key di frontend, deployment, atau perubahan frontend.

## Penyebab Seed Awal Gagal

Error awal:

```text
insert or update on table "user_profiles" violates foreign key constraint "user_profiles_id_fkey"
```

Penyebab:

- `user_profiles.id` memiliki FK ke `auth.users.id`.
- `supabase/seed.sql` semula dijalankan otomatis sebelum akun Auth dummy tersedia.
- Akibatnya seed mencoba membuat profil aplikasi untuk UUID yang belum ada di `auth.users`.

Keputusan yang dipakai:

- FK ke `auth.users` tetap dipertahankan.
- Tidak membuat profil yatim.
- Tidak menyimpan password plaintext di tabel aplikasi.
- Tidak memakai data asli.

## Perubahan Workflow Local Development

Workflow lokal yang berhasil:

1. `supabase db reset` menjalankan migration tanpa seed aplikasi otomatis.
2. `scripts/bootstrap-dummy-auth-users.ps1` membuat akun Auth dummy via Admin Auth API lokal.
3. `supabase/seed.sql` dijalankan manual ke database lokal melalui `psql` di container.
4. Smoke test menjalankan Auth, RLS, Storage, dan Edge Function terhadap local stack.

`supabase/config.toml` dikonfigurasi agar seed otomatis tidak memblokir `db reset`:

```toml
[db.seed]
enabled = false
sql_paths = ["./seed.sql"]
```

`supabase/seed.sql` tetap menjadi sumber data dummy aplikasi untuk local/staging.

## Bootstrap Auth Dummy

Script:

```text
scripts/bootstrap-dummy-auth-users.ps1
```

Hasil:

- 1 admin demo dibuat.
- 2 guru demo dibuat.
- 1 pentashih demo dibuat.
- 5 santri demo dibuat.
- UUID Auth dummy deterministik dan sesuai dengan `supabase/seed.sql`.
- Email santri memakai email internal teknis dummy.
- Password dummy hanya untuk lokal dan tidak dicetak ke output.
- Service-role key lokal tidak disimpan di repository dan tidak dicetak.
- Script menolak target non-local.

## Seed Aplikasi

Seed aplikasi dijalankan setelah Auth dummy tersedia.

Hasil run pertama:

```text
INSERT berhasil untuk data dummy inti.
UPDATE 5 untuk sinkronisasi class santri dummy.
```

Hasil run ulang:

```text
INSERT 0 0 pada data yang sudah ada.
UPDATE 5 untuk sinkronisasi class santri dummy.
```

Kesimpulan:

- Seed aplikasi idempotent untuk data insert dummy.
- Update class santri tetap berjalan aman dan deterministik.

## Pemeriksaan FK dan Jumlah Data

Hasil agregat lokal:

```text
missing_profile_auth_users = 0
role_admin = 1
role_guru = 2
role_santri = 5
role_pentashih = 1
guru_rows = 3
santri_rows = 5
classes_rows = 2
memberships_rows = 5
```

Catatan:

- `guru_rows = 3` karena pentashih juga memiliki profil operasional di tabel `guru`.
- Tidak ada `user_profiles` dummy yang yatim terhadap `auth.users`.

## Diagnosis 503

Endpoint yang menghasilkan 503:

```text
functions/v1/signin-with-nomor-induk
```

Penyebab teknis:

- Edge Function berjalan, tetapi helper persistent rate limit gagal memanggil RPC.
- RPC `consume_auth_rate_limit` memiliki nama output `attempts` dan `blocked_until` yang bentrok dengan referensi kolom tidak terkualifikasi di PL/pgSQL.

Perbaikan:

- `auth_rate_limits` memakai `ip_hash` dan `alias_hash` terpisah.
- RPC memakai parameter `p_ip_hash` dan `p_alias_hash`.
- Update counter rate-limit memakai `v_row.attempts` dan `v_row.blocked_until` agar tidak ambigu.
- Edge Function mengirim IP dan Nomor Induk Qiroati secara terpisah.

Status:

- 503 sudah hilang.
- Login santri via Edge Function berhasil.

## Diagnosis Edge Function Auth 401

Setelah 503 hilang, beberapa function authenticated sempat mengembalikan 401.

Penyebab teknis:

- `service_role` lokal belum memiliki privilege eksplisit pada tabel aplikasi privat setelah revoke/grant RLS.
- Helper `getUserFromRequest` memakai client anon dengan global Authorization header dan pada runtime lokal menghasilkan respons Auth `Bad request`.

Perbaikan:

- Migration RLS memberi `service_role` privilege eksplisit pada tabel aplikasi yang dibutuhkan Edge Function.
- Helper Auth Edge Function memvalidasi JWT dengan `service_role.auth.getUser(token)` tanpa mencetak token.

Status:

- `manage-user` duplicate check lulus.
- `reset-user-password` lulus.
- Signed upload avatar santri sendiri lulus.

## Hasil Smoke Test Akhir

Command:

```text
powershell -ExecutionPolicy Bypass -File scripts/run-local-runtime-smoke-tests.ps1 -SupabaseUrl http://127.0.0.1:55321
```

Hasil:

```text
SUMMARY passed=22 failed=0
```

Test yang lulus:

- login admin via Supabase Auth;
- login guru A via Supabase Auth;
- login guru B via Supabase Auth;
- login santri via `signin-with-nomor-induk`;
- error login santri dibuat generik;
- guru A hanya melihat santri kelas A;
- guru B hanya melihat santri kelas B;
- santri hanya melihat data sendiri;
- guru tidak melihat detail pembayaran langsung;
- guru hanya melihat status pembayaran;
- guru tidak melihat expenses;
- admin melihat expenses;
- anon membaca news published;
- anon tidak membaca feedbacks;
- anon dapat insert feedback;
- signed upload avatar santri sendiri;
- signed upload avatar santri lain ditolak;
- signed upload mime invalid ditolak;
- signed upload oversize ditolak;
- `manage-user` menolak Nomor Induk duplikat;
- admin reset password;
- login dengan password reset berhasil.

## Status Container

Core service lokal berjalan:

- DB healthy.
- Auth healthy.
- REST berjalan.
- Storage healthy.
- Kong/API healthy.
- Studio healthy.
- Edge runtime berjalan.

Catatan:

- `supabase_vector` masih terlihat restart loop pada `docker ps`.
- Log `supabase_vector` menunjukkan source `docker_logs` gagal membaca Docker host dengan error `Network unreachable`.
- Smoke test Auth/RLS/Storage/Edge Function tetap lulus.
- Restart loop `supabase_vector` dicatat sebagai risiko observability/logging/analytics lokal, bukan blocker backend inti saat ini.

## Validasi Statis

Hasil:

```text
Migration order and MMQ dependency checks passed.
Seed dummy-only checks passed.
Production guard checks passed for target 'local'.
No obvious committed secrets found.
git diff --check passed.
```

Catatan:

- PowerShell profile lokal menampilkan warning modul WinGet pada beberapa command.
- Warning tersebut tidak memengaruhi hasil Supabase, Docker, migration, seed, atau smoke test.

## File yang Diperbaiki

Backend dan script:

- `supabase/config.toml`
- `supabase/migrations/20260624000300_guru_santri_and_auth_aliases.sql`
- `supabase/migrations/20260624001500_rls_helper_functions.sql`
- `supabase/migrations/20260624001600_rls_policies.sql`
- `supabase/functions/_shared/auth.ts`
- `supabase/functions/_shared/rateLimit.ts`
- `supabase/functions/signin-with-nomor-induk/index.ts`
- `supabase/functions/manage-user/index.ts`
- `supabase/seed.sql`
- `scripts/bootstrap-dummy-auth-users.ps1`
- `scripts/run-local-runtime-smoke-tests.ps1`

Dokumentasi:

- `docs/29-phase-3b-local-runtime-result.md`

Tidak berubah:

- `src/`
- `.env.local`
- `_private_reference/`
- backup database

## Risiko Tersisa

- `supabase_vector` lokal restart loop perlu ditinjau terpisah jika log analytics dibutuhkan.
- Smoke test saat ini adalah script lokal, belum test suite otomatis CI.
- Migration sudah lulus reset lokal, tetapi staging/production tetap harus memakai workflow terpisah dan tidak menjalankan seed dummy.
- Edge Function masih source lokal, belum deploy.

## Rekomendasi Berikutnya

1. Review diff Fase 3B-2.
2. Commit perubahan backend lokal dan dokumentasi jika scope sudah disetujui.
3. Lanjutkan Fase 3B-3 untuk memperluas test skeleton menjadi test otomatis yang lebih formal.
4. Jangan lanjut staging sebelum production guard, secret scan, dan checklist deploy Supabase baru disiapkan.
