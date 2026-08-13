# 31 - Phase 4A Frontend Integration Audit

## Status

Dokumen ini adalah audit awal integrasi frontend React dengan Supabase lokal LPQ Al-Fath Maulana.

Fase 4A hanya membuat dokumentasi. Tidak ada perubahan pada `src/`, tidak membuat `.env.local`, tidak menjalankan deploy, tidak memakai Supabase online, tidak restore backup, dan tidak menyentuh database lama.

## Preflight Repository

Hasil orientasi sebelum dokumen dibuat:

```text
?? docs/30-phase-3b-automated-tests-result.md
?? scripts/run-local-backend-tests.ps1
```

Catatan:

- Dua file tersebut berasal dari Fase 3B-3 dan tidak disentuh oleh Fase 4A.
- Jika Fase 4A nanti akan dikomit, commit harus hanya memasukkan dokumen `docs/31` sampai `docs/36`, kecuali user memberi instruksi berbeda.
- Kondisi ini berbeda dari asumsi awal "git status bersih", sehingga perlu menjadi gate sebelum commit.

## Stack Frontend Aktual

Frontend memakai:

- React 18.
- Vite 7.
- React Router v6.
- Supabase JS `@supabase/supabase-js` versi 2.30.
- Tailwind, Radix UI, lucide-react, framer-motion.
- Export laporan memakai `xlsx`, `jspdf`, dan `jspdf-autotable`.

Script penting di `package.json`:

```text
npm run dev       -> vite --host :: --port 3000
npm run build     -> node tools/build.js
npm run preview   -> vite preview --host :: --port 3000
npm run lint      -> eslint . --quiet
```

## Entry Point dan Provider

Entry point utama:

- `src/main.jsx`
- `src/App.jsx`

Provider utama:

- `ThemeProvider`
- `AuthProvider`
- `DndProvider`
- `BrowserRouter`
- `Toaster`

`src/App.jsx` juga menjalankan:

- loading screen dengan logo dari `website_content.logoUrl`;
- `DatabaseHealthCheck` untuk role admin;
- route public dan protected;
- guard fitur deferred memakai `enableDeferredFeatures`.

## Supabase Client

Client resmi saat ini:

```text
src/lib/customSupabaseClient.js
```

Status:

- Sudah membaca env hanya dari `VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`.
- Sudah menyediakan `isSupabaseConfigured`.
- Saat env kosong, client tidak crash saat import.
- Saat env kosong, request backend gagal ramah melalui stub.
- Export lama masih ada: default, `customSupabaseClient`, dan `supabase`.

Catatan integrasi:

- Fase 4B tetap harus memakai file ini sebagai satu-satunya client resmi.
- Jangan membuat client Supabase baru di file lain.
- `.env.local` baru boleh dibuat manual oleh user pada fase integrasi runtime, dan tidak boleh dikomit.

## Feature Flags

File:

```text
src/lib/featureFlags.js
```

Flag yang tersedia:

- `enableEdgeFunctions`
- `enableDeferredFeatures`
- `edgeFunctionDisabledMessage`

Nilai hanya aktif jika env string persis `"true"`.

Status:

- Route game, quiz, random name, top score, dan forum sudah diarahkan ke halaman fitur belum aktif saat deferred disabled.
- Admin dashboard sudah menyembunyikan `game-config` dan `backup`.
- TV Display tetap aktif.

Risiko:

- Beberapa file fitur deferred masih mengandung query backend. Selama route/nav tidak membuka fitur itu, query tidak berjalan. Fase 4B perlu menjaga agar fitur deferred tetap tidak dimount.
- Music player dan media settings masih perlu dipastikan tidak berjalan otomatis ketika deferred disabled.

## Routing Aktual

Route protected langsung:

- `/absensi-digital`
- `/tv-display-mode`
- `/quiz-hafalan` jika deferred aktif
- `/gatcha-game` jika deferred aktif
- `/random-name` jika deferred aktif
- `/top-score` jika deferred aktif
- `/dashboard`

Route public utama:

- `/`
- `/login`
- `/profil`
- `/profil/galeri`
- `/pendaftaran/informasi`
- `/pendaftaran/brosur`
- `/pendaftaran/sistem`
- `/parenting`
- `/parenting/:articleId`
- `/parenting/media-edukatif`
- `/parenting/diskusi-wali`
- `/kontak`
- `/status-pembayaran/:paymentId`
- `/berita`
- `/berita/:id`
- `/pengumuman`
- `/pengumuman/:id`
- `/metode-qiroati`
- `/fasilitas`

Route deferred:

- `/forum`
- `/forum/:topicId`
- `/quiz-hafalan`
- `/gatcha-game`
- `/random-name`
- `/top-score`

## Auth Aktual

File utama:

- `src/contexts/SupabaseAuthContext.jsx`
- `src/pages/LoginPage.jsx`
- `src/components/ProtectedRoute.jsx`
- `src/pages/DashboardPage.jsx`

Status yang sudah baik:

- Tidak ditemukan penggunaan runtime `mock_santri_session`.
- Login page tidak lagi punya pendaftaran guru mandiri.
- Login page tidak memanggil `manage-user`.
- Jika Supabase belum dikonfigurasi, auth menampilkan pesan ramah.

Masalah yang perlu diperbaiki pada Fase 4B:

- Role masih dibaca dari `user.user_metadata.role`, `user.app_metadata.role`, atau fallback email berisi `admin`.
- Login santri masih memakai RPC `signin_with_username`.
- Login santri belum memakai Edge Function lokal `signin-with-nomor-induk`.
- `ProtectedRoute` hanya mengecek user login, belum membatasi role.
- `DashboardPage` masih mendeteksi pentashih dari `guru.roles` berisi `Pentashih`, belum dari role top-level `user_profiles.role = pentashih`.
- Ada komentar lama pada logout yang menyebut mock session walau logic mock sudah tidak ada.

## Dashboard Aktual

Dashboard dipilih di `DashboardPage.jsx` berdasarkan `role` dari AuthContext:

- `admin` -> `AdminDashboard`
- `guru` -> `GuruDashboard`, kecuali `guru.roles` berisi `Pentashih`
- `santri` -> `SantriDashboard`

Admin dashboard memuat modul:

- data santri;
- kelas;
- data guru;
- rekap absensi santri;
- rekap guru;
- MMQ;
- bisyaroh;
- kalender;
- pembayaran;
- rekap SPP;
- riwayat bayar;
- pengeluaran;
- pengaturan TV;
- konten;
- log login;
- game config jika deferred aktif;
- backup jika deferred aktif.

Risiko:

- `LoginLogs` masih memakai tabel `login_logs`, yang tidak menjadi data migrasi baru.
- `SalaryCalculation` atau modul bisyaroh perlu dicek ulang terhadap schema backend baru.
- Admin dashboard membaca detail `payments` dan `expenses`, boleh untuk admin tetapi harus tetap berada di role admin.
- Guru dashboard harus diarahkan agar tidak membaca detail pembayaran.

## Public Pages Aktual

Public pages banyak membaca `website_content` untuk:

- logo;
- hero;
- profil;
- fasilitas;
- berita;
- pengumuman;
- parenting;
- galeri;
- video qiroati;
- konten diskusi wali.

Keputusan backend final:

- `website_content` hanya untuk konten global.
- `news` dan `announcements` harus dipisah.

Konsekuensi:

- News page dan announcement page perlu dipindah dari `website_content` ke tabel `news` dan `announcements`.
- Konten global tetap dapat memakai `website_content`.

## Fitur yang Tetap Aktif untuk Launch

Fitur inti yang harus dipetakan ke backend lokal:

- website publik;
- login admin, guru, santri, pentashih;
- data santri;
- data guru;
- kelas dan membership;
- absensi RFID;
- pembayaran;
- pengeluaran;
- konten website;
- kalender akademik;
- MMQ;
- laporan Excel/PDF;
- TV Display.

## Fitur Deferred

Fitur berikut tetap ditunda:

- forum;
- journey;
- music player;
- game/gatcha;
- quiz;
- top score;
- random name;
- backup/restore UI.

Aturan:

- Tidak dihapus permanen.
- Tidak boleh menjalankan request backend saat disabled.
- Tidak menjadi syarat integrasi Fase 4B awal.

## Risiko Integrasi Utama

- Query frontend masih memakai kolom legacy seperti `id_kelas`, sementara backend baru memakai kombinasi `santri.current_class_id` dan `class_memberships`.
- Login santri harus berganti dari RPC lama ke Edge Function.
- Role frontend harus bersumber dari `user_profiles`.
- Beberapa tabel legacy masih muncul di runtime atau util: `mmq_absensi`, `login_logs`, `music_files`, `media_player_settings`, `forum_topics`, `forum_replies`, `hafalan_doa`, `hafalan_sholat`, `hafalan_surat`, `whatsapp_group_links`.
- Guru tidak boleh membaca detail pembayaran, jadi semua UI guru yang butuh status pembayaran harus memakai `payment_status_summary`.
- Storage avatar harus mengikuti policy backend baru, terutama path `avatars/santri/<auth.uid()>/profile.webp`.
- Payload lama untuk `manage-user` dan `generate-signed-upload-url` perlu disesuaikan ke kontrak Edge Function lokal.

## Kesimpulan Audit

Frontend sudah punya dasar konfigurasi aman dari Fase 1, tetapi belum siap langsung dihubungkan ke backend lokal tanpa penyesuaian.

Fase 4B sebaiknya dimulai dari auth dan role guard, lalu query inti admin/guru/santri, lalu storage dan laporan. Jangan mulai dari fitur deferred.
