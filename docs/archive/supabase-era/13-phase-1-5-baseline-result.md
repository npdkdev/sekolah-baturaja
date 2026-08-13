# Phase 1.5 Baseline Result

## Ringkasan

Fase 1.5 sudah dijalankan untuk membuat baseline repository lokal yang aman, memperbaiki script build agar lintas shell, menjalankan scan credential, dan membuat commit baseline setelah Fase 1.

Tidak ada Supabase project baru, migration SQL, restore database, deployment, `.env.local`, `npm audit fix`, penghapusan backup, GitHub remote, atau push.

## Diagnosis Final Masalah Build

Masalah lama ada pada script:

```json
"build": "node tools/generate-llms.js || true && vite build"
```

Pola tersebut bergantung pada operator shell `||` dan `&&`. Di Windows/PowerShell dan lingkungan sandbox, perilakunya tidak konsisten: `npm run build` pernah mengembalikan exit code 0 tanpa menghasilkan `dist`, sedangkan `npx vite build` berhasil.

Diagnosis final:

- Vite tidak bermasalah; `npx vite build` berhasil.
- `tools/generate-llms.js` bersifat tambahan dan bisa gagal jika tidak menemukan Helmet/page yang diharapkan.
- Script lama mencoba membuat generator LLMS opsional dengan `|| true`, tetapi pendekatan shell tersebut rapuh.
- Npm memakai wrapper Windows `npm.ps1`; ini memperbesar risiko perbedaan perilaku shell.

## File Dibuat

- `tools/build.js`
- `docs/13-phase-1-5-baseline-result.md`

Catatan: dokumen hasil ini dibuat setelah commit baseline agar dapat mencatat hash commit baseline yang benar.

## File Diubah

- `.gitignore`
- `package.json`

## Perubahan Script Build

Script lama:

```json
"build": "node tools/generate-llms.js || true && vite build"
```

Script baru:

```json
"generate:llms": "node tools/generate-llms.js",
"build": "node tools/build.js"
```

`tools/build.js` sekarang:

- menjalankan `tools/generate-llms.js`;
- jika generator gagal, menampilkan warning dan tetap melanjutkan;
- menjalankan Vite build melalui Node tanpa operator shell;
- mengembalikan exit code Vite, sehingga build gagal jika Vite gagal.

## Hasil `npm run build`

Berhasil.

Output Vite muncul dengan ringkasan:

- 2936 modules transformed.
- `dist/index.html` dibuat.
- build selesai dalam sekitar 9 detik.
- Vite memberi warning ukuran chunk besar pada bundle utama, tetapi bukan error.

Setelah build:

- `dist/index.html`: ada.

## Hasil `npx vite build`

Berhasil sebagai pembanding.

Output Vite muncul dan `dist/index.html` terbentuk.

## Hasil Scan Credential

Scan wajib dijalankan terhadap `src`, `lib`, `public`, `index.html`, `docs`, dan `.env.example`.

Temuan:

- Domain Supabase lama: tidak ditemukan di runtime aktif.
- Key lama / `sb_publishable`: tidak ditemukan.
- `mock_santri_session`: ditemukan hanya di dokumen analisis lama sebagai catatan historis, bukan runtime.
- `service_role`: ditemukan di dokumen dan SQL lama sebagai nama role/policy PostgreSQL, bukan service-role key.
- JWT token literal: tidak ditemukan.
- Database connection string: tidak ditemukan.
- Private key: tidak ditemukan.
- `.env.local`: tidak ada.
- File backup di luar `_private_reference/`: tidak ditemukan.

Scan tambahan menemukan satu pola angka 16 digit di `src/pages/ContactPage.jsx`, tetapi itu adalah bagian dari URL embed Google Maps, bukan NIK atau nomor KK.

Kesimpulan:

Tidak ditemukan credential rahasia atau data pribadi yang perlu menghentikan commit baseline.

## Status File SQL Lama

File SQL lama yang masuk baseline:

- `src/RLS_DISABLED_POLICIES_BACKUP.sql`
- `src/SupabaseEdgeFunctions.sql`
- `src/database_schema_export.sql`
- `src/fix_mmq_rls_policies.sql`
- `src/full_database_migration.sql`
- `src/inspect_database.sql`
- `src/inspect_mmq_constraint.sql`

Alasan:

- File SQL tersebut adalah referensi lama/schema/diagnostic dari export Horizon.
- Tidak ditemukan credential rahasia seperti service-role key, database URL, JWT secret, atau password database.
- Beberapa file mengandung istilah `service_role` sebagai role PostgreSQL/policy, bukan key rahasia.
- File SQL tidak boleh dijalankan sebagai migration pada fase ini.

## Hasil `git init`

Berhasil.

Sebelumnya folder `.git` ada tetapi tidak lengkap dan `git status` gagal. Setelah `git init`, repository lokal dibuat ulang dengan metadata valid.

Catatan lingkungan:

- Git menolak status biasa karena `dubious ownership`.
- Untuk menghindari perubahan global Git config, perintah Git dijalankan dengan opsi per-command:

```bash
git -c safe.directory=D:/Project/LPQ-Al-Fath-Maulana-2 ...
```

## Daftar File yang Masuk Commit

Commit baseline berisi 246 file.

Kategori yang masuk:

- konfigurasi root: `.gitignore`, `.env.example`, `.npmrc`, `.nvmrc`, `.version`, config Vite/Tailwind/PostCSS/ESLint;
- dependency manifest: `package.json`, `package-lock.json`;
- source frontend: `src/`;
- client/re-export helper: `lib/`;
- public assets aman: `public/`;
- plugin lokal yang dibutuhkan `vite.config.js`: `plugins/`;
- tools build: `tools/`;
- dokumentasi sampai `docs/12-phase-1-5-baseline-plan.md`.

Tidak memakai `git add .`; staging dilakukan secara eksplisit.

## Konfirmasi Backup dan Env Tidak Terlacak

Dicek setelah staging dan setelah commit:

- `_private_reference/lpq_full.backup` tidak terlacak.
- File `.backup` dan `.dump` tidak terlacak.
- `.env` tidak terlacak.
- `.env.local` tidak ada dan tidak terlacak.
- `node_modules/` tidak terlacak.
- `dist/` tidak terlacak.
- `.agents/` tidak terlacak.

## Commit Baseline

Hash dan pesan:

```text
91d1af2 chore: establish safe frontend baseline after phase 1
```

Commit dibuat lokal saja. Tidak ada remote GitHub dan tidak ada push.

## Hasil `git status` Setelah Commit

Sebelum dokumen hasil ini dibuat, `git status --short` kosong.

Setelah dokumen ini dibuat, working tree akan menampilkan `docs/13-phase-1-5-baseline-result.md` sebagai file baru karena dokumen hasil memang harus mencatat hash commit baseline yang sudah ada.

## Masalah yang Masih Tersisa

- Ada warning PowerShell profile tentang `Microsoft.WinGet.CommandNotFound`; tidak mengganggu build/Git, tetapi membuat output terminal bising.
- Git membutuhkan `safe.directory` per-command di lingkungan ini jika global config tidak diubah.
- Vite masih memberi warning ukuran chunk besar.
- Npm audit dari Fase 1 masih melaporkan vulnerability dependency; belum ditangani karena `npm audit fix` dilarang pada fase ini.
- Beberapa plugin Horizon masih ada di `vite.config.js`; build berhasil, tetapi cleanup plugin bisa dipertimbangkan nanti.

## Rekomendasi Fase 2

1. Mulai desain backend Supabase baru secara terpisah dari repository baseline ini.
2. Rancang schema final, RLS final, dan role final sebelum membuat migration.
3. Buat strategi Supabase Auth untuk admin, guru, santri, dan pentashih.
4. Buat desain RPC `signin_with_username` baru tanpa password plaintext.
5. Rancang Edge Function baru untuk manajemen user dan signed upload.
6. Jangan aktifkan `VITE_ENABLE_EDGE_FUNCTIONS` atau `VITE_ENABLE_DEFERRED_FEATURES` sebelum backend baru siap.
