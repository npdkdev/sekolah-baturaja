# Hasil Integrasi Frontend Storage Inti

Tanggal: 2026-06-24

## Ringkasan

Integrasi Storage inti sudah diarahkan ke kontrak Supabase lokal final untuk:

- avatar santri;
- avatar guru dan pentashih;
- aset konten website.

Bucket yang digunakan:

- `avatars`
- `website-assets`

Tidak ada bucket baru, tidak ada service-role di frontend, dan tidak ada perubahan policy/RLS.

## File yang Berubah

- `src/lib/storageAdapters.js`
  - Adapter baru untuk validasi file, path avatar deterministik, signed upload, signed avatar display URL, hapus avatar, dan upload aset website.
  - Avatar memakai path:
    - `santri/<auth-user-id>/profile.webp`
    - `guru/<auth-user-id>/profile.webp`
  - Signed URL lokal dinormalisasi dari host internal Docker `kong` ke `VITE_SUPABASE_URL`.

- `src/lib/dataMasterAdapters.js`
  - `avatar_path` santri ikut disimpan saat profile disubmit.

- `src/components/dashboard/SantriDashboard.jsx`
  - Santri upload, mengganti, dan menghapus avatar miliknya melalui signed upload.
  - Avatar ditampilkan ulang dengan signed URL segar saat dashboard dimuat.

- `src/components/dashboard/GuruDashboard.jsx`
  - Guru/pentashih upload, mengganti, dan menghapus avatar miliknya melalui signed upload.
  - Avatar ditampilkan ulang dengan signed URL segar saat dashboard dimuat.

- `src/components/dashboard/admin/SantriManagement.jsx`
  - Admin upload avatar santri existing memakai path final dan `avatar_path`.
  - Upload avatar ditahan untuk akun baru sampai UUID akun tersedia.

- `src/components/dashboard/admin/SantriDewasaManagement.jsx`
  - Jalur upload avatar santri dewasa disamakan dengan path final.

- `src/components/dashboard/admin/GuruManagement.jsx`
  - Admin upload avatar guru/pentashih existing memakai path final.
  - Upload avatar ditahan untuk akun baru sampai UUID akun tersedia.

- `src/components/dashboard/admin/ContentManagement.jsx`
  - Upload aset website memakai `website-assets`.
  - Logo, CTA background, dan hero slide memakai key deterministik agar upload baru mengganti file lama.
  - Asset list memakai nama path aman yang tidak berasal langsung dari nama file user.

## Operasi Storage yang Berhasil

Test lokal Storage lulus `14/14`:

- santri upload avatar sendiri;
- santri mengganti avatar sendiri;
- avatar santri bisa dimuat ulang dengan signed URL setelah upload;
- santri ditolak upload ke path avatar santri lain;
- guru upload avatar sendiri;
- avatar guru/pentashih bisa dimuat ulang dengan signed URL setelah upload;
- guru ditolak upload avatar santri luar kelas;
- admin upload aset website;
- public membaca aset website;
- non-admin ditolak menulis `website-assets`;
- MIME avatar tidak valid ditolak;
- file avatar lebih dari 2 MB ditolak;
- halaman tetap aman saat avatar kosong karena fallback avatar tetap tersedia.

## Operasi yang Ditahan Karena Policy

- Update kolom profil mandiri untuk `guru`/`santri` masih dapat ditolak oleh RLS tabel jika backend belum memberi policy update profil sendiri. Persistensi avatar tidak bergantung pada update row profil: frontend menurunkan path avatar deterministik dari `auth.uid()` dan membuat signed URL baru saat dashboard dimuat ulang.
- Upload avatar untuk akun baru di admin ditahan sampai akun memiliki UUID Auth, karena path Storage wajib berbasis user id.

## Hasil Validasi

- `npm run build`: lulus.
- Backend runner lokal: lulus `49/49`.
- Test Storage lokal: lulus `14/14`.
- `scripts/validate-no-secrets.ps1`: lulus.
- Runtime scan service-role pada folder React runtime: bersih.

## Catatan Teknis

- Edge Function `generate-signed-upload-url` lokal mengembalikan signed URL dengan host internal Docker `kong`. Adapter frontend menormalkan host tersebut ke `VITE_SUPABASE_URL` agar browser lokal dapat upload.
- `website-assets` tetap public-read sesuai migration.
- Bucket `avatars` tetap private; tampilan avatar memakai signed URL, bukan `getPublicUrl`.

## Masalah Tersisa

- Perlu keputusan backend berikutnya apakah `guru` dan `santri` boleh update kolom foto profil sendiri secara terbatas melalui RLS tabel, atau tetap melalui Edge Function khusus.
- Belum ada integrasi rekaman audio murojaah; ini sengaja di luar scope.
- Fitur music/deferred tidak diubah.
