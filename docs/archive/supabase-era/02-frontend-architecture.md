# 02 - Frontend Architecture

## Framework dan Dependency

Frontend memakai:

- React 18.
- Vite 7.
- React Router DOM v6.
- Tailwind CSS.
- Radix UI + komponen lokal di `src/components/ui`.
- Supabase JS v2.
- Framer Motion untuk animasi.
- Recharts untuk grafik.
- jsPDF, jspdf-autotable, xlsx untuk laporan/export.
- qrcode, html-to-image, canvas-confetti, react-dnd untuk fitur tambahan.

## Entry Point

Alur utama:

1. `src/main.jsx` memuat aplikasi.
2. `src/App.jsx` memasang provider:
   - `ThemeProvider`
   - `AuthProvider`
   - `DndProvider`
   - `BrowserRouter`
3. Routing didefinisikan langsung di `App.jsx`.
4. Supabase client dipakai dari `src/lib/customSupabaseClient.js`.

## Routing

### Route Publik

| Route | Halaman |
|---|---|
| `/` | `HomePage` |
| `/login` | `LoginPage` |
| `/profil` | `ProfilePage` |
| `/profil/galeri` | `GalleryPage` |
| `/pendaftaran/informasi` | `RegistrationInfoPage` |
| `/pendaftaran/brosur` | `BrochurePage` |
| `/pendaftaran/sistem` | `SystemPage` |
| `/parenting` | `ParentingPage` |
| `/parenting/:articleId` | `ParentingArticlePage` |
| `/parenting/media-edukatif` | `EduMediaPage` |
| `/parenting/diskusi-wali` | `WaliDiscussionPage` |
| `/forum` | `ForumPage` |
| `/forum/:topicId` | `ForumTopicPage` |
| `/kontak` | `ContactPage` |
| `/status-pembayaran/:paymentId` | `PaymentStatusPage` |
| `/berita` | `NewsPage` |
| `/berita/:id` | `NewsDetailPage` |
| `/pengumuman` | `AnnouncementPage` |
| `/pengumuman/:id` | `AnnouncementDetailPage` |
| `/metode-qiroati` | `QiroatiMethodPage` |
| `/fasilitas` | `FacilitiesPage` |

### Route Terproteksi

| Route | Halaman |
|---|---|
| `/dashboard` | Dashboard sesuai role |
| `/absensi-digital` | Mode absensi digital |
| `/tv-display-mode` | TV display |
| `/quiz-hafalan` | Quiz hafalan |
| `/gatcha-game` | Game poin |
| `/random-name` | Acak nama |
| `/top-score` | Leaderboard |

Proteksi dilakukan oleh `src/components/ProtectedRoute.jsx`, yang hanya memeriksa apakah `user` ada. Pembatasan role dilakukan di dalam halaman/komponen, bukan di route guard.

## Komponen Utama

| Komponen | Fungsi |
|---|---|
| `Navbar` | Navigasi publik, logo dari `website_content.logoUrl`, tombol login/dashboard. |
| `Footer` | Footer website. |
| `DashboardPage` | Memilih dashboard admin/guru/santri/pentashih berdasarkan role. |
| `AdminDashboard` | Pusat fitur admin: santri, kelas, guru, pembayaran, pengeluaran, konten, kalender, MMQ, game, backup, log. |
| `GuruDashboard` | Profil guru, kelas yang diampu, hafalan, murojaah, absensi, MMQ. |
| `SantriDashboard` | Profil santri, kelas, absensi, pembayaran, hafalan, murojaah, video. |
| `ContentManagement` | Pengelolaan konten berbasis `website_content` dan upload `website-assets`. |
| `DigitalAttendancePage` | Absensi berbasis RFID/tag untuk santri/guru/MMQ. |
| `TvDisplayPage` | Tampilan TV/kiosk; masih ada branding lama. |

## Autentikasi

Autentikasi ada di `src/contexts/SupabaseAuthContext.jsx`:

- Email/password standar untuk admin/guru.
- RPC `signin_with_username` untuk login santri.
- Fallback mock session santri di `localStorage` jika RPC gagal.
- Role diambil dari `user_metadata.role`, `app_metadata.role`, atau fallback email yang mengandung admin.

Catatan risiko: fallback mock session membuat pengguna bisa dianggap login di frontend tanpa session Supabase valid. Ini harus dihapus atau diganti sebelum produksi baru.

## Environment Variable

Tidak ditemukan penggunaan `VITE_SUPABASE_URL` atau `VITE_SUPABASE_ANON_KEY`. URL project dan key Supabase masih hard-code di:

- `src/lib/customSupabaseClient.js`
- `lib/customSupabaseClient.js`

Untuk LPQ Al-Fath Maulana 2, koneksi harus dipindahkan ke `.env.local` dan `.env.example`, tanpa menulis key asli ke repo.

## Realtime

Realtime dipakai terbatas:

- `HomePage` subscribe perubahan `website_content`.
- `LoginPage` subscribe perubahan `website_content` untuk logo.

Fitur lain lebih banyak memakai fetch manual daripada subscription realtime.
