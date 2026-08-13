# 36 - Phase 4 Risks and Gates

## Status

Dokumen ini mencatat risiko dan gate sebelum frontend React dihubungkan ke Supabase lokal.

Fase 4A hanya dokumentasi. Tidak ada perubahan frontend, backend, env, deploy, restore, atau project online.

## Risiko Repository

Risiko:

- Worktree saat audit masih memiliki file Fase 3B-3 untracked:
  - `docs/30-phase-3b-automated-tests-result.md`
  - `scripts/run-local-backend-tests.ps1`

Dampak:

- Commit Fase 4A bisa tercampur dengan hasil Fase 3B-3 jika tidak hati-hati.

Mitigasi:

- Sebelum commit Fase 4A, jalankan `git status --short`.
- Stage hanya `docs/31` sampai `docs/36` jika user meminta commit Fase 4A.
- Jangan mengubah atau menghapus file Fase 3B-3 tanpa instruksi baru.

Gate:

- Scope Git jelas sebelum commit.

## Risiko Auth

Risiko:

- AuthContext masih mengambil role dari metadata/email.
- Login santri masih memakai RPC `signin_with_username`.
- Dashboard pentashih masih memakai `guru.roles`.

Dampak:

- Role bisa salah.
- Santri belum memakai Supabase Auth resmi via Edge Function baru.
- Pentashih tidak mengikuti desain role final.

Mitigasi:

- Fase 4B harus menjadikan `user_profiles.role` sebagai sumber role tunggal.
- Ganti login santri ke `signin-with-nomor-induk`.
- Pentashih menjadi role top-level.

Gate:

- Tidak ada fallback role dari email.
- Tidak ada RPC `signin_with_username` pada runtime auth.
- Tidak ada mock session.
- Session tetap session Supabase Auth resmi.

## Risiko Query Legacy

Object legacy/deferred yang masih muncul di source:

- `mmq_absensi`
- `login_logs`
- `music_files`
- `media_player_settings`
- `forum_topics`
- `forum_replies`
- `hafalan_doa`
- `hafalan_sholat`
- `hafalan_surat`
- `whatsapp_group_links`

Dampak:

- Runtime error jika komponen termount.
- Fitur bisa membaca schema lama yang tidak dibuat di backend baru.
- Fitur deferred bisa menjalankan request yang seharusnya tidak aktif.

Mitigasi:

- Mapping ulang `mmq_absensi` ke `mmq_attendance`.
- Sembunyikan atau guard `login_logs` sampai desain audit log baru ada.
- Pastikan fitur forum/music/game/quiz/random/top score tetap deferred.
- Mapping hafalan legacy ke `hafalan_items` dan `hafalan_progress` bila masih dibutuhkan.

Gate:

- Static scan object legacy selesai.
- Tidak ada query legacy yang aktif pada route launch.

## Risiko Schema Kelas

Risiko:

- Frontend banyak memakai `santri.id_kelas`.
- Backend baru memakai gabungan `santri.current_class_id` dan `class_memberships`.

Dampak:

- Dashboard kelas, mutasi, absensi, dan guru scope bisa salah.

Mitigasi:

- Buat adapter/query layer kecil pada Fase 4B atau mapping langsung yang konsisten.
- Update mutasi kelas agar membership aktif dan `current_class_id` sinkron.
- Hindari update `id_kelas` bila kolom tidak menjadi field final.

Gate:

- Satu santri hanya punya satu membership aktif.
- Guru hanya melihat santri kelas yang diampu.
- Mutasi kelas tercatat di `class_mutations`.

## Risiko Pembayaran

Risiko:

- Beberapa UI guru/global search berpotensi membaca `payments`.
- Guru tidak boleh melihat nominal, metode pembayaran, catatan transaksi, atau transaction ID.

Dampak:

- Kebocoran data keuangan.

Mitigasi:

- Admin boleh memakai `payments`.
- Santri boleh membaca pembayaran sendiri sesuai RLS.
- Guru harus memakai `payment_status_summary`.
- Jangan select `*` dari `payments` pada UI guru.

Gate:

- Test guru gagal membaca detail `payments`.
- Guru hanya melihat `Lunas` atau `Belum Lunas`.
- Export guru tidak berisi detail keuangan.

## Risiko Storage

Risiko:

- Frontend saat ini memakai upload langsung dan `getPublicUrl`.
- Policy final avatar santri membatasi path `avatars/santri/<auth.uid()>/profile.webp`.
- Bucket tertentu bisa private.

Dampak:

- Upload ditolak RLS/Storage policy.
- File avatar bisa menumpuk.
- User bisa mencoba path orang lain jika frontend tidak divalidasi.

Mitigasi:

- Gunakan path final yang deterministik.
- Validasi MIME dan ukuran di frontend.
- Gunakan `generate-signed-upload-url` untuk upload yang butuh validasi server.
- Upload baru mengganti file lama.

Gate:

- Santri avatar sendiri berhasil.
- Santri avatar user lain ditolak.
- Guru hanya avatar santri kelasnya.
- Admin bisa menghapus avatar tidak pantas.
- Signed URL tidak dicetak.

## Risiko Edge Function Contract

Risiko:

- Payload frontend lama untuk `manage-user` dan `generate-signed-upload-url` tidak sama dengan kontrak backend lokal.

Dampak:

- Create/update user gagal.
- Upload avatar gagal.

Mitigasi:

- Sesuaikan payload frontend dengan `docs/24-edge-function-contracts.md`.
- `manage-user` memakai `action`, `role`, `profile`, dan `initial_password` sesuai kebutuhan.
- `generate-signed-upload-url` memakai `bucket`, `path`, `content_type`, `size`, dan `purpose`.

Gate:

- Duplicate Nomor Induk ditolak.
- Create user hanya admin.
- Reset password tidak log password.
- Upload signed URL menolak path/MIME/ukuran invalid.

## Risiko Public Content

Risiko:

- Berita dan pengumuman masih dibaca dari `website_content`.
- Backend final memisahkan `news` dan `announcements`.

Dampak:

- Konten public tidak muncul atau tidak mengikuti RLS published/draft.

Mitigasi:

- `website_content` tetap untuk logo, hero, profil, kontak, TV config, dan konten global.
- News page memakai `news`.
- Announcement page memakai `announcements`.

Gate:

- Anon hanya membaca published news/announcements.
- Draft tidak tampil ke publik.
- Admin dapat mengelola konten.

## Risiko Deferred Features

Risiko:

- Komponen deferred masih ada dan mengandung query backend.
- Music player hook bisa berjalan dari layout/global jika tidak dijaga.

Dampak:

- Request ke tabel yang tidak tersedia.
- Error runtime.

Mitigasi:

- Pastikan route/nav/dashboard tidak memount fitur deferred saat `VITE_ENABLE_DEFERRED_FEATURES=false`.
- Jangan buat bucket/table deferred di backend inti hanya untuk memuaskan frontend lama.
- Backup/restore UI tetap disabled.

Gate:

- Forum, journey, music player, game/gatcha, quiz, top score, random name, backup/restore UI tidak aktif.
- TV Display tetap aktif.

## Risiko Observability Lokal

Risiko:

- `supabase_vector` restart loop pada local stack.

Dampak:

- Observability/log analytics lokal tidak lengkap.
- Core Auth, REST, Storage, RLS, dan Edge Function tidak terdampak selama test tetap lulus.

Mitigasi:

- Dokumentasikan sebagai non-blocker lokal.
- Jangan mengubah schema/backend inti hanya untuk Vector.

Gate:

- Backend runner tetap lulus.
- Smoke test tetap lulus.

## Gate Sebelum Fase 4B

Fase 4B baru aman dimulai jika:

- Dokumen `docs/31` sampai `docs/36` selesai.
- Mapping query frontend sudah jelas.
- Backend lokal test tetap lulus atau hasil terakhir yang valid sudah tersedia.
- Scope Git bersih atau perubahan Fase sebelumnya sengaja dipisahkan.
- Tidak ada `.env.local` di Git.
- Tidak ada rencana menggunakan Supabase lama.
- Tidak ada fitur deferred yang akan diaktifkan diam-diam.

## Gate Sebelum Commit Fase 4A

Jika user meminta commit Fase 4A:

1. Jalankan:

```powershell
git status --short
git diff --check
```

2. Stage hanya:

```text
docs/31-phase-4a-frontend-integration-audit.md
docs/32-frontend-backend-query-mapping.md
docs/33-frontend-auth-and-route-guard-plan.md
docs/34-phase-4-implementation-waves.md
docs/35-frontend-local-test-plan.md
docs/36-phase-4-risks-and-gates.md
```

3. Jangan stage:

```text
docs/30-phase-3b-automated-tests-result.md
scripts/run-local-backend-tests.ps1
.env
.env.local
src/
supabase/
_private_reference/
```

## Kriteria Selesai Fase 4A

Fase 4A selesai jika:

- Enam dokumen audit/rencana tersedia.
- Tidak ada perubahan pada `src/`.
- Tidak ada `.env.local`.
- Tidak ada deploy.
- Tidak ada Supabase online/link.
- Tidak ada restore backup.
- Tidak ada data asli dipakai.
- Risiko dan gate menuju Fase 4B terdokumentasi.
