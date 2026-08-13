# Phase 1.5 Baseline Plan

## Tujuan

Fase 1.5 bertujuan menyiapkan baseline repository lokal setelah Fase 1, memastikan build berjalan konsisten, dan membuat titik aman yang dapat dilacak sebelum masuk ke desain backend/Supabase baru.

Tahap ini belum membuat Supabase project baru, migration SQL, restore database, deployment, atau commit Git.

## Diagnosis Masalah `npm run build`

Script build saat ini di `package.json`:

```json
"build": "node tools/generate-llms.js || true && vite build"
```

Temuan:

- `npx vite build` berhasil dan menghasilkan folder `dist`.
- `npm run build` pernah mengembalikan exit code 0 tetapi tidak menghasilkan `dist`.
- Script build mengandalkan kombinasi operator shell `|| true && vite build`.
- Pola tersebut rapuh di Windows/PowerShell/cmd karena urutan evaluasi dan short-circuit shell dapat berbeda dari ekspektasi POSIX.
- Npm yang terdeteksi adalah wrapper PowerShell Windows: `C:\Program Files\nodejs\npm.ps1`.
- Ada warning PowerShell profile terkait `Microsoft.WinGet.CommandNotFound`; warning ini tidak terlihat sebagai penyebab utama, tetapi menambah noise output.
- `.npmrc` hanya berisi `legacy-peer-deps=true`, tidak mengubah script-shell.
- `vite.config.js` masih memuat plugin/handler Horizon untuk dev/runtime overlay, tetapi tidak ditemukan bukti plugin tersebut menyebabkan `vite build` gagal. `npx vite build` berjalan sukses.
- `tools/generate-llms.js` menulis `public/llms.txt` dan akan `process.exit(1)` jika tidak menemukan halaman dengan Helmet. Karena itu, script build lama tampaknya mencoba menjadikan generator ini opsional dengan `|| true`, tetapi caranya membuat hasil build tidak konsisten.

Kesimpulan sementara:

Masalah paling mungkin berasal dari script build yang tidak portabel, bukan dari Vite itu sendiri. Build Vite terbukti berhasil jika dipanggil langsung.

## Perubahan Minimal yang Diperlukan

Perubahan belum dijalankan pada tahap analisis ini. Rekomendasi minimal untuk fase implementasi berikutnya:

1. Pisahkan generate LLMS dan build Vite agar hasilnya jelas.

Opsi aman:

```json
"scripts": {
  "dev": "vite --host :: --port 3000",
  "generate:llms": "node tools/generate-llms.js",
  "build": "node tools/generate-llms.js && vite build",
  "preview": "vite preview --host :: --port 3000",
  "lint": "eslint . --quiet"
}
```

2. Jika `llms.txt` dianggap opsional, buat wrapper Node khusus yang menjalankan generator secara best-effort lalu tetap menjalankan Vite, dan exit code akhir harus mengikuti hasil Vite. Ini lebih aman daripada `|| true &&`.

3. Tambahkan checklist verifikasi:

- hapus `dist` lama;
- jalankan `npm run build`;
- pastikan `dist/index.html` terbentuk;
- pastikan output Vite muncul;
- pastikan exit code gagal jika Vite gagal.

## Status Git Saat Ini

Temuan:

- Ada folder `.git`, tetapi `git status` sebelumnya mengembalikan `fatal: not a git repository`.
- `.git/config` tidak ditemukan.
- Artinya metadata Git saat ini kosong/tidak lengkap.

Rencana:

- Jalankan `git init` pada fase berikutnya untuk membuat atau memperbaiki metadata Git lokal.
- Jika `git init` gagal karena folder `.git` rusak, minta persetujuan user sebelum mengganti nama atau membersihkan folder `.git` kosong tersebut.

## Proteksi `.gitignore`

Sudah dilindungi:

- `.env`
- `.env.*`
- `.env.local` tercakup oleh `.env.*`
- `.env.example` tetap diizinkan lewat `!.env.example`
- `_private_reference/`
- `*.backup`
- `*.dump`
- `node_modules/`
- `dist/`

Tambahan yang direkomendasikan sebelum commit baseline:

- `.agents/`
- `.codex/`
- `*.bak`
- `*.sql.gz`
- `*.dump.gz`
- `*.backup.gz`
- `*.tar`
- `*.tar.gz`
- `*.zip`
- `*.7z`
- `*.rar`
- `*.log`
- `npm-debug.log*`
- `yarn-debug.log*`
- `yarn-error.log*`
- `pnpm-debug.log*`

Catatan:

- Jangan abaikan semua `*.sql` secara otomatis sebelum direview. Beberapa file SQL di `src/` tampaknya merupakan schema/export/diagnostic dari Horizon dan mungkin masih berguna sebagai referensi teknis. Namun file SQL harus diperiksa sebelum commit karena bisa memuat konfigurasi lama, policy lama, atau referensi sensitif.

## File Sensitif dan Backup

Backup database lama:

- `_private_reference/lpq_full.backup`

Status:

- Berada di dalam `_private_reference/`.
- `_private_reference/` sudah masuk `.gitignore`.
- File backup tidak boleh dihapus dan tidak boleh ditambahkan ke Git.

File yang perlu direview sebelum commit:

- `.env.example`: aman sebagai template kosong.
- File SQL di `src/`: perlu review karena berisi schema, function, atau policy lama.
- Dokumen audit lama di `src/` dan `docs/`: boleh dilacak jika tidak mengandung data pribadi/credential.
- `package-lock.json`: tersentuh oleh `npm install`; perlu diputuskan apakah masuk baseline. Umumnya sebaiknya ikut dicommit untuk reproducible install.

## Scan Credential

Scan file-name-only untuk pola credential umum menemukan beberapa file yang mengandung kata seperti `password`, `token`, atau `key`, tetapi tidak menampilkan nilai rahasia.

Kategori temuan:

- kode auth/login yang memang memakai variabel password input;
- dokumentasi analisis;
- file SQL/schema lama;
- client Supabase baru yang hanya membaca env;
- `.env.example` yang kosong.

Hasil penting:

- Tidak ditemukan hard-code domain Supabase lama di runtime setelah Fase 1.
- Tidak ditemukan `service-role` key di runtime scan.
- Tidak ditemukan `mock_santri_session`.
- Backup database berada di folder yang di-ignore.

Sebelum commit baseline, lakukan scan ulang:

```bash
rg -n "PROJECT_REF_SUMBER_DIHAPUS|PROJECT_REF_LAMA_DIHAPUS_2|supabase\\.co|sb_publishable|mock_santri_session|service[_-]?role|SERVICE_ROLE" src lib public index.html docs .env.example -g "!*.backup" -g "!*.dump"
```

Jika ditemukan nilai credential, jangan commit sebelum nilai tersebut dihapus atau file terkait di-ignore.

## Perintah Git yang Direncanakan

Jangan jalankan sebelum checklist sensitif selesai.

```bash
git init
git status --short
git add .gitignore .env.example package.json package-lock.json index.html src lib public docs tools vite.config.js jsconfig.json components.json eslint.config.mjs postcss.config.js tailwind.config.js .npmrc .nvmrc .version
git status --short
git commit -m "chore: establish safe frontend baseline after phase 1"
```

Catatan:

- Jangan membuat GitHub repository.
- Jangan push.
- Jangan pakai `git add .` sebelum yakin ignore dan scan sensitif sudah benar.
- Jika file SQL diputuskan masuk baseline, tambahkan eksplisit setelah review.

## Checklist Sebelum Commit

- [ ] `.gitignore` sudah ditambah pola ignore rekomendasi.
- [ ] `_private_reference/lpq_full.backup` tidak muncul di `git status`.
- [ ] `node_modules/` tidak muncul di `git status`.
- [ ] `dist/` tidak muncul di `git status`.
- [ ] `.env`, `.env.local`, dan `.env.*` tidak muncul di `git status`.
- [ ] `.env.example` muncul dan hanya berisi placeholder kosong.
- [ ] Static scan credential tidak menemukan hard-code Supabase lama, service-role key, token, database URL, atau password rahasia.
- [ ] File SQL lama sudah diputuskan: track sebagai referensi atau exclude dulu.
- [ ] `npm run build` sudah diperbaiki dan diverifikasi menghasilkan `dist`.
- [ ] `npx vite build` tetap berhasil sebagai pembanding.
- [ ] Tidak ada backend, migration, restore, atau deployment yang dijalankan.

## Checklist Setelah Commit

- [ ] `git status --short` bersih.
- [ ] Commit baseline memiliki pesan `chore: establish safe frontend baseline after phase 1`.
- [ ] `git log --oneline -1` menampilkan commit baseline.
- [ ] Backup database tetap tidak terlacak.
- [ ] `.env.local` tetap tidak dibuat atau tidak terlacak.
- [ ] Build masih berhasil setelah commit.

## Risiko

- Folder `.git` saat ini tidak lengkap; `git init` mungkin perlu memperbaiki metadata.
- File SQL lama bisa berisi konfigurasi atau policy Supabase lama, sehingga perlu review sebelum ditrack.
- Script build lama bisa memberi false positive karena exit code 0 tidak selalu berarti `dist` dibuat.
- Npm audit masih memiliki vulnerability; jangan jalankan `npm audit fix` di fase baseline karena bisa mengubah dependency besar-besaran.
- Plugin Horizon di `vite.config.js` masih ada; saat ini tidak memblokir build, tetapi perlu dievaluasi di fase cleanup frontend lanjutan.

## Kriteria Selesai Fase 1.5

- Git repository lokal berhasil diinisialisasi atau metadata Git yang rusak berhasil ditangani dengan persetujuan user.
- File sensitif dan backup database tidak terlacak Git.
- `.gitignore` melindungi env, backup, private reference, build output, dependency, dan file lokal sensitif.
- Script build sudah konsisten dan menghasilkan `dist` lewat `npm run build`.
- Baseline commit dibuat dengan pesan:

```text
chore: establish safe frontend baseline after phase 1
```

- Tidak ada GitHub repository dibuat dan tidak ada push.
- Tidak ada Supabase project baru, migration SQL, restore database, deployment, atau perubahan database produksi.
