import React, { Suspense, lazy, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from '@/components/ui/toaster';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import HomePage from '@/pages/HomePage';

// Setiap halaman dipecah jadi chunk sendiri.
//
// Sebelumnya 30 halaman diimpor statis, jadi Vite menggabungkan seluruh
// dashboard admin, panel manajemen, dan game ke satu bundle 3,4 MB yang
// diunduh bahkan oleh pengunjung yang cuma membuka beranda. Lighthouse
// melaporkan 3,3 MB di antaranya tidak terpakai.
//
// HomePage sengaja TIDAK di-lazy: itu elemen LCP untuk pengunjung pertama,
// dan me-lazy-kannya menambah satu roundtrip tepat di jalur kritis.
const LoginPage = lazy(() => import('@/pages/LoginPage'));
const DashboardPage = lazy(() => import('@/pages/DashboardPage'));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));
const RegistrationInfoPage = lazy(() => import('@/pages/RegistrationInfoPage'));
const BrochurePage = lazy(() => import('@/pages/BrochurePage'));
const ContactPage = lazy(() => import('@/pages/ContactPage'));
const PaymentStatusPage = lazy(() => import('@/pages/PaymentStatusPage'));
const NewsPage = lazy(() => import('@/pages/NewsPage'));
const NewsDetailPage = lazy(() => import('@/pages/NewsDetailPage'));
const AnnouncementPage = lazy(() => import('@/pages/AnnouncementPage'));
const AnnouncementDetailPage = lazy(() => import('@/pages/AnnouncementDetailPage'));
const QiroatiMethodPage = lazy(() => import('@/pages/QiroatiMethodPage'));
const FacilitiesPage = lazy(() => import('@/pages/FacilitiesPage'));
const ParentingPage = lazy(() => import('@/pages/ParentingPage'));
const ParentingArticlePage = lazy(() => import('@/pages/ParentingArticlePage'));
const ForumPage = lazy(() => import('@/pages/ForumPage'));
const ForumTopicPage = lazy(() => import('@/pages/ForumTopicPage'));
const EduMediaPage = lazy(() => import('@/pages/EduMediaPage'));
const SystemPage = lazy(() => import('@/pages/SystemPage'));
const WaliDiscussionPage = lazy(() => import('@/pages/WaliDiscussionPage'));
const DigitalAttendancePage = lazy(() => import('@/pages/DigitalAttendancePage'));
const TvDisplayPage = lazy(() => import('@/pages/TvDisplayPage'));
const QuizHafalanPage = lazy(() => import('@/pages/QuizHafalanPage'));
const GatchaGamePage = lazy(() => import('@/pages/GatchaGamePage'));
const GalleryPage = lazy(() => import('@/pages/GalleryPage'));
const RandomNamePage = lazy(() => import('@/pages/RandomNamePage'));
const TopScorePage = lazy(() => import('@/pages/TopScorePage'));
import ProtectedRoute from '@/components/ProtectedRoute';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { publicFetch } from '@/lib/apiClient';
import { enableDeferredFeatures, enableGameFeatures } from '@/lib/featureFlags';

// Fallback rute. Sengaja minimal dan tanpa animasi: muncul hanya selama chunk
// halaman diunduh, dan spinner yang berkedip sesaat justru terasa lebih lambat
// daripada ruang kosong.
const RouteFallback = () => (
  <div className="min-h-[50vh] flex items-center justify-center" role="status" aria-live="polite">
    <span className="sr-only">Memuat halaman…</span>
  </div>
);

const RouteLogger = () => {
  const location = useLocation();
  useEffect(() => {
    console.log(`App Routing to: ${location.pathname}${location.search}`);
  }, [location]);
  return null;
};

/* ------------------------------------------------------------------ */
/* Dynamic logo crossfade helper                                      */
/* Shows the official local logo first, then crossfades to the remote logo. */
/* ------------------------------------------------------------------ */
const DynamicLogo = ({ className = '', width = 48, height = 48 }) => {
  const [dynamicUrl, setDynamicUrl] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchLogo = async () => {
      try {
        const data = await publicFetch('/api/content/website?keys=logoUrl');
        const url = data?.logoUrl;
        if (!cancelled && url && url !== '/logo-lpq-al-fath-maulana.webp') {
          const img = new Image();
          img.onload = () => { if (!cancelled) { setDynamicUrl(url); setReady(true); } };
          img.src = url;
        }
      } catch { /* keep local logo */ }
    };
    fetchLogo();
    return () => { cancelled = true; };
  }, []);

  return (
    <span className={`relative inline-block ${className}`} style={{ width, height }}>
      {/* Local logo — always present */}
      <img
        src="/logo-lpq-al-fath-maulana.webp"
        alt="Logo LPQ Al-Fath Maulana"
        width={width}
        height={height}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ opacity: ready ? 0 : 1, transition: 'opacity 0.5s ease' }}
      />
      {/* Dynamic logo — crossfades in when loaded */}
      {dynamicUrl && (
        <img
          src={dynamicUrl}
          alt="Logo LPQ Al-Fath Maulana"
          width={width}
          height={height}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ opacity: ready ? 1 : 0, transition: 'opacity 0.5s ease' }}
        />
      )}
    </span>
  );
};

const DeferredFeaturePage = () => (
  <div className="min-h-screen flex items-center justify-center bg-background px-4">
    <div className="max-w-md text-center space-y-3">
      <h1 className="text-2xl font-bold text-foreground">Fitur belum diaktifkan</h1>
      <p className="text-muted-foreground">
        Fitur ini belum tersedia.
      </p>
    </div>
  </div>
);

const allDashboardRoles = ['admin', 'guru', 'santri', 'pentashih'];
const operationalDisplayRoles = ['admin', 'guru', 'pentashih'];

function App() {
  /* ----------------------------------------------------------------
   * Dismiss the inline loading shell that lives in index.html.
   * The shell is pure HTML+CSS and appears instantly before React.
   * We remove it on mount so there is zero additional delay.
   * ---------------------------------------------------------------- */
  useEffect(() => {
    const shell = document.getElementById('lpq-loading');
    if (shell) {
      shell.classList.add('lpq-loading-hide');
      // Remove from DOM after transition completes
      const onEnd = () => shell.remove();
      shell.addEventListener('transitionend', onEnd, { once: true });
      // Fallback removal if transitionend doesn't fire
      setTimeout(() => shell.remove(), 600);
    }
    try {
      sessionStorage.setItem('lpq_initial_load_done', 'true');
    } catch {
      // sessionStorage can be unavailable in restricted browser modes.
    }
  }, []);

  return (
    <ThemeProvider>
      <AuthProvider>
        <DndProvider backend={HTML5Backend}>
          <Router>
            <RouteLogger />
            <div className="min-h-screen flex flex-col bg-background text-foreground transition-colors duration-300">
              {/* Satu Suspense di sekeliling seluruh pohon rute: setiap halaman
                  kini chunk terpisah, jadi ada jeda unduh saat berpindah rute. */}
              <Suspense fallback={<RouteFallback />}>
              <Routes>
                <Route path="/absensi-digital" element={<ProtectedRoute allowedRoles={operationalDisplayRoles}><DigitalAttendancePage /></ProtectedRoute>} />
                <Route path="/tv-display-mode" element={<ProtectedRoute allowedRoles={operationalDisplayRoles}><TvDisplayPage /></ProtectedRoute>} />
                {enableGameFeatures ? (
                  <>
                    <Route path="/quiz-hafalan" element={<ProtectedRoute><QuizHafalanPage /></ProtectedRoute>} />
                    <Route path="/gatcha-game" element={<ProtectedRoute><GatchaGamePage /></ProtectedRoute>} />
                    <Route path="/random-name" element={<ProtectedRoute><RandomNamePage /></ProtectedRoute>} />
                    <Route path="/top-score" element={<ProtectedRoute><TopScorePage /></ProtectedRoute>} />
                  </>
                ) : (
                  <>
                    <Route path="/quiz-hafalan" element={<ProtectedRoute><DeferredFeaturePage /></ProtectedRoute>} />
                    <Route path="/gatcha-game" element={<ProtectedRoute><DeferredFeaturePage /></ProtectedRoute>} />
                    <Route path="/random-name" element={<ProtectedRoute><DeferredFeaturePage /></ProtectedRoute>} />
                    <Route path="/top-score" element={<ProtectedRoute><DeferredFeaturePage /></ProtectedRoute>} />
                  </>
                )}

                <Route path="*" element={
                  <>
                    <Navbar />
                    <main className="flex-grow">
                      <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/login" element={<LoginPage />} />
                        <Route path="/profil" element={<ProfilePage />} />
                        <Route path="/profil/galeri" element={<GalleryPage />} />
                        <Route path="/pendaftaran/informasi" element={<RegistrationInfoPage />} />
                        <Route path="/pendaftaran/brosur" element={<BrochurePage />} />
                        <Route path="/pendaftaran/sistem" element={<SystemPage />} />
                        <Route path="/parenting" element={<ParentingPage />} />
                        <Route path="/parenting/:articleId" element={<ParentingArticlePage />} />
                        <Route path="/parenting/media-edukatif" element={<EduMediaPage />} />
                        <Route path="/parenting/diskusi-wali" element={<WaliDiscussionPage />} />
                        {enableDeferredFeatures ? (
                          <>
                            <Route path="/forum" element={<ForumPage />} />
                            <Route path="/forum/:topicId" element={<ForumTopicPage />} />
                          </>
                        ) : (
                          <>
                            <Route path="/forum" element={<DeferredFeaturePage />} />
                            <Route path="/forum/:topicId" element={<DeferredFeaturePage />} />
                          </>
                        )}
                        <Route path="/kontak" element={<ContactPage />} />
                        <Route path="/status-pembayaran/:paymentId" element={<PaymentStatusPage />} />
                        <Route path="/berita" element={<NewsPage />} />
                        <Route path="/berita/:id" element={<NewsDetailPage />} />
                        <Route path="/pengumuman" element={<AnnouncementPage />} />
                        <Route path="/pengumuman/:id" element={<AnnouncementDetailPage />} />
                        <Route path="/metode-qiroati" element={<QiroatiMethodPage />} />
                        <Route path="/fasilitas" element={<FacilitiesPage />} />
                        <Route path="/dashboard" element={<ProtectedRoute allowedRoles={allDashboardRoles}><DashboardPage /></ProtectedRoute>} />
                      </Routes>
                    </main>
                    <Footer />
                  </>
                } />
              </Routes>
              </Suspense>
              <Toaster />
              <ScrollToTopButton />
            </div>
          </Router>
        </DndProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
