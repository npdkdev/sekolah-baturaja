
import React, { useState, useEffect } from 'react';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { Helmet } from 'react-helmet';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import useAdminBodyClass from '@/hooks/useAdminBodyClass';
import AdminDashboard from '@/components/dashboard/AdminDashboard';
import GuruDashboard from '@/components/dashboard/GuruDashboard';
import SantriDashboard from '@/components/dashboard/SantriDashboard';
import PentashihDashboard from '@/components/dashboard/PentashihDashboard';
import SideRays from '@/components/reactbits/SideRays/SideRays';
import { fetchSantriDetail } from '@/lib/dataMasterAdapters';
import '@/styles/admin-dashboard.css';

const DashboardPage = () => {
  const { role, user } = useAuth();
  const { isDark } = useTheme();
  const [santriProfile, setSantriProfile] = useState(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);

  // Keep every authenticated dashboard on the neutral portal surface. Without
  // this class the santri dashboard inherits the legacy forest-green body.
  useAdminBodyClass(Boolean(role));

  useEffect(() => {
      console.log('DashboardPage mounted, Context State:', { role, userId: user?.id });

      const fetchProfile = async () => {
          setIsLoadingProfile(true);
          try {
            if (role === 'santri' && user) {
                const data = await fetchSantriDetail(user.id);
                setSantriProfile(data);
            } else {
                setSantriProfile(null);
            }
          } catch (err) {
            console.error('Error fetching dashboard profile info:', err);
          } finally {
            setIsLoadingProfile(false);
          }
      };

      if (user && role === 'santri') {
        fetchProfile();
      } else {
        setSantriProfile(null);
        setIsLoadingProfile(false);
      }
  }, [role, user]);

  const renderDashboard = () => {
    console.log('Rendering dashboard based on role:', role);

    if (isLoadingProfile) {
        return (
          <div className="admin-loading-container">
            <div className="admin-loading-spinner">
              <div className="admin-loading-spinner-ring" />
              <div className="admin-loading-spinner-ring admin-loading-spinner-ring--delay" />
            </div>
            <h2 className="admin-loading-title">Memuat Profil…</h2>
            <p className="admin-loading-subtitle">Mengambil data akun Anda</p>
            <div className="admin-loading-bar-track">
              <div className="admin-loading-bar-fill" />
            </div>
          </div>
        );
    }

    if (role === 'admin') {
      return <AdminDashboard />;
    } else if (role === 'guru') {
      return <GuruDashboard />;
    } else if (role === 'santri') {
      return <SantriDashboard isAdult={santriProfile?.kategori === 'Dewasa'} />;
    } else if (role === 'pentashih') {
      return <PentashihDashboard />;
    } else if (user && !role) {
      return (
        <div className="flex justify-center items-center h-[60vh] flex-col max-w-md mx-auto text-center">
           <div className="bg-destructive/10 text-destructive p-6 rounded-xl border border-destructive/20 mb-4">
              <h2 className="text-xl font-bold mb-2">Role Tidak Terdeteksi</h2>
              <p>Gagal mengidentifikasi role pengguna Anda. Silakan coba login ulang atau hubungi administrator.</p>
           </div>
           <button
             onClick={() => window.location.href = '/login'}
             className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
           >
             Kembali ke Login
           </button>
        </div>
      );
    }

    return (
      <div className="admin-loading-container">
        <div className="admin-loading-spinner">
          <div className="admin-loading-spinner-ring" />
          <div className="admin-loading-spinner-ring admin-loading-spinner-ring--delay" />
        </div>
        <h2 className="admin-loading-title">Menyiapkan Dashboard…</h2>
        <p className="admin-loading-subtitle">Mendeteksi hak akses Anda</p>
        <div className="admin-loading-bar-track">
          <div className="admin-loading-bar-fill" />
        </div>
      </div>
    );
  };

  // DndProvider dipasang di sini, bukan di root aplikasi.
  //
  // react-dnd hanya dipakai empat komponen dashboard (ClassManagement,
  // AdultClassManagement, HafalanItemDraggable, HafalanDisplay), tapi
  // sebelumnya membungkus seluruh App — sehingga setiap pengunjung halaman
  // publik ikut mengunduh dan menginisialisasinya tanpa pernah memakainya.
  // Di sini ia ikut chunk DashboardPage yang memang lazy.
  return (
    <DndProvider backend={HTML5Backend}>
      <Helmet>
        <title>Dashboard - LPQ Al-Fath Maulana</title>
        <meta name="description" content="Dashboard sistem manajemen LPQ Al-Fath Maulana" />
      </Helmet>

      <div className="lpq-admin-surface min-h-screen py-8 relative">
        {/* SideRays — dark mode only, behind content. Surface is transparent
            so rays show through the gaps between cards and panels. */}
        {isDark && (
          <div className="fixed inset-0 pointer-events-none" style={{ zIndex: 0 }}>
            <SideRays
              speed={1.2}
              rayColor1="#06b6d4"
              rayColor2="#8b5cf6"
              intensity={2.0}
              spread={2.5}
              origin="top-right"
              tilt={5}
              saturation={1.5}
              blend={0.6}
              falloff={1.4}
              opacity={0.5}
            />
          </div>
        )}
        <div className="relative" style={{ zIndex: 1 }}>
          {renderDashboard()}
        </div>
      </div>
    </DndProvider>
  );
};

export default DashboardPage;
