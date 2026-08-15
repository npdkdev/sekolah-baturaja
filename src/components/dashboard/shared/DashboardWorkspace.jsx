import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Users, DollarSign, TrendingDown, Fingerprint, Tv, Gamepad2, Shuffle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';

import SantriManagement from '../admin/SantriManagement';
import GuruManagement from '../admin/GuruManagement';
import MMQManagement from '../admin/MMQManagement';
import TahfizhConfiguration from '../admin/TahfizhConfiguration';
import PaymentSystem from '../admin/PaymentSystem';
import PaymentRecap from '../admin/PaymentRecap';
import PaymentHistory from '../admin/PaymentHistory';
import ContentManagement from '../admin/ContentManagement';
import PpdbRegistrations from '../admin/PpdbRegistrations';
import LoginLogs from '../admin/LoginLogs';
import ExpenseManagement from '../admin/ExpenseManagement';
import ClassManagement from '../admin/ClassManagement';
import JadwalPelajaran from '../admin/JadwalPelajaran';
import AttendanceRecap from '../admin/AttendanceRecap';
import GuruAttendanceRecap from '../admin/GuruAttendanceRecap';
import TvDisplaySettings from '../admin/TvDisplaySettings';
import GameConfiguration from '../admin/GameConfiguration';
import CalendarManagement from '../admin/CalendarManagement';
import BackupRestoreManagement from '../admin/BackupRestoreManagement';

import GlobalSearch from './GlobalSearch';
import SantriDetailModal from './SantriDetailModal';
import AdminPageHeader from './AdminPageHeader';
import AdminStatCard from './AdminStatCard';
import AdminModuleNav from './AdminModuleNav';

import { fetchSantriCount, fetchSantriDetail } from '@/lib/dataMasterAdapters';
import { FINANCE_DATA_CHANGED_EVENT, fetchCashflowSummary } from '@/lib/financeAdapters';
import { resolveAvatarRecord } from '@/lib/storageAdapters';
import { enableGameFeatures } from '@/lib/featureFlags';
import { fetchAppConfig, APP_CONFIG_KEYS } from '@/lib/appConfigAdapters';
import { applyTahfizhConfig } from '@/lib/tahfizhLevels';
import '@/styles/sdnb-dashboard.css';

// Shared registry: Admin and Tata Usaha render from this, so the two never drift apart.
const renderModule = (value) => {
  switch (value) {
    case 'santri': return <SantriManagement />;
    case 'ppdb': return <PpdbRegistrations />;
    case 'kelas': return <ClassManagement />;
    case 'jadwal-pelajaran': return <JadwalPelajaran />;
    case 'rapat-guru': return <MMQManagement />;
    case 'metode-mengaji': return <TahfizhConfiguration />;
    case 'guru': return <GuruManagement />;
    case 'rekap-absensi': return <AttendanceRecap />;
    case 'rekap-guru': return <GuruAttendanceRecap />;
    /* `salary` (Bisyaroh) dicabut permanen — panelnya tidak pernah menyimpan
     * apa pun dan tarifnya memakai istilah sekolah Al-Qur'an. Lihat catatan di
     * AdminDashboard.jsx. */
    case 'academic-calendar': return <CalendarManagement />;
    case 'payment': return <PaymentSystem />;
    case 'recap': return <PaymentRecap />;
    case 'history': return <PaymentHistory />;
    case 'expense': return <ExpenseManagement />;
    case 'content': return <ContentManagement />;
    case 'tv-settings': return <TvDisplaySettings />;
    case 'game-config': return <GameConfiguration />;
    case 'backup': return <BackupRestoreManagement />;
    case 'logs': return <LoginLogs />;
    default: return null;
  }
};

/**
 * DashboardWorkspace — the shared shell for role-based back-office dashboards.
 *
 * Both the Admin dashboard and the Tata Usaha dashboard render this component;
 * they differ only in the `title`, `subtitle`, and the `tabs` they pass in.
 * Layout, styling, stats, global search, quick actions, and the module registry
 * are identical across roles by construction and follow the SDN Baturaja
 * public-site design system.
 *
 * Props:
 * - title, subtitle: page header text
 * - tabs: Array<{ value, label, icon, group }> — the modules to expose. Only the
 *   modules listed here are rendered, so permission scoping happens by choosing
 *   which tabs to pass (backend still enforces the real authorization).
 */
const DashboardWorkspace = ({ title, subtitle, tabs }) => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(tabs[0]?.value);
  const [stats, setStats] = useState({
    totalSantri: 0,
    totalPemasukanBulanIni: 0,
    totalPengeluaranBulanIni: 0,
  });

  const [showIncome, setShowIncome] = useState(false);
  const [showExpense, setShowExpense] = useState(false);

  const [selectedSantri, setSelectedSantri] = useState(null);
  const [isSantriModalOpen, setIsSantriModalOpen] = useState(false);

  const hasSantriTab = tabs.some((t) => t.value === 'santri');

  useEffect(() => {
    let active = true;
    let latestRequest = 0;

    fetchAppConfig(APP_CONFIG_KEYS.TAHFIZH)
      .then((stored) => { if (stored) applyTahfizhConfig(stored); })
      .catch(() => { /* daftar tingkat bawaan tetap dipakai */ });

    const fetchStats = async () => {
      const requestId = ++latestRequest;
      setIsLoading(true);
      setError(null);

      try {
        // The dashboard period is a local calendar period. Payment dates are
        // stored as SQL DATE values, so deriving year/month from local time
        // keeps the card correct around midnight and at month boundaries.
        const today = new Date();
        const currentMonth = today.getMonth() + 1;
        const currentYear = today.getFullYear();

        const [santriCount, financeSummary] = await Promise.all([
          fetchSantriCount().then(d => d?.total || 0),
          fetchCashflowSummary({ year: currentYear, month: currentMonth }),
        ]);

        if (!active || requestId !== latestRequest) return;
        setStats({
          totalSantri: santriCount,
          totalPemasukanBulanIni: financeSummary.totalPemasukan,
          totalPengeluaranBulanIni: financeSummary.totalPengeluaran,
        });
      } catch (err) {
        if (!active || requestId !== latestRequest) return;
        setError(err.message);
        toast({
          title: 'Gagal memuat data',
          description: 'Terjadi kesalahan saat memuat statistik dashboard. ' + err.message,
          variant: 'destructive',
        });
      } finally {
        if (active && requestId === latestRequest) setIsLoading(false);
      }
    };

    fetchStats();

    const handleFinanceDataChanged = () => fetchStats();
    window.addEventListener(FINANCE_DATA_CHANGED_EVENT, handleFinanceDataChanged);

    return () => {
      active = false;
      window.removeEventListener(FINANCE_DATA_CHANGED_EVENT, handleFinanceDataChanged);
    };
  }, []);

  const handleGlobalSearchNavigate = async (item, category) => {
    try {
      switch (category) {
        case 'santri': {
          const fullSantri = await fetchSantriDetail(item.id).catch(() => null);
          if (fullSantri) {
            setSelectedSantri(await resolveAvatarRecord(fullSantri, { ownerType: 'santri' }));
            setIsSantriModalOpen(true);
          } else {
            toast({ title: 'Gagal', description: 'Data murid tidak ditemukan.', variant: 'destructive' });
          }
          break;
        }
        case 'guru':
          if (tabs.some((t) => t.value === 'guru')) setActiveTab('guru');
          toast({ title: 'Navigasi', description: `Menuju profil guru: ${item.nama}` });
          break;
        case 'kelas':
          if (tabs.some((t) => t.value === 'kelas')) setActiveTab('kelas');
          toast({ title: 'Navigasi', description: `Menuju kelas: ${item.nama_kelas}` });
          break;
        case 'pembayaran':
          if (tabs.some((t) => t.value === 'history')) setActiveTab('history');
          toast({ title: 'Navigasi', description: `Menuju riwayat pembayaran ${item.santri?.nama_lengkap || ''}` });
          break;

        default:
          break;
      }
    } catch (err) {
      console.error('Navigation error:', err);
      toast({ title: 'Error', description: 'Terjadi kesalahan saat navigasi.', variant: 'destructive' });
    }
  };

  return (
    // `sdnb-dash` mirrors the public light shell and switches to a solid,
    // token-driven dark workspace (see sdnb-dashboard.css).
    <div className="sdnb-dash">
      <div className="sdnb-dash__bg" aria-hidden="true" />
      <div className="sdnb-dash__orb sdnb-dash__orb--a" aria-hidden="true" />
      <div className="sdnb-dash__orb sdnb-dash__orb--b" aria-hidden="true" />
      <div className="sdnb-dash__orb sdnb-dash__orb--c" aria-hidden="true" />

      <div className="sdnb-dash__content max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 pt-8 sm:pt-10">

      {/* Global Search Section — below navbar */}
      <div className="mb-6">
        <GlobalSearch onNavigate={handleGlobalSearchNavigate} />
      </div>

      {/* Page Header with Quick Actions */}
      <AdminPageHeader title={title} subtitle={subtitle}>
        <button
          type="button"
          onClick={() => navigate('/tv-display-mode')}
          className="attendance-header__action-btn attendance-header__action-btn--tv school-shine-button"
        >
          <Tv className="w-4 h-4"/><span>TV Display</span>
        </button>
        {enableGameFeatures && (
          <>
            <button
              type="button"
              onClick={() => navigate('/gatcha-game')}
              className="attendance-header__action-btn attendance-header__action-btn--gatcha school-shine-button"
            >
              <Gamepad2 className="w-4 h-4"/><span>Play Gatcha</span>
            </button>

            <button
              type="button"
              onClick={() => navigate('/random-name')}
              className="attendance-header__action-btn attendance-header__action-btn--random school-shine-button"
            >
              <Shuffle className="w-4 h-4"/><span>Acak Nama</span>
            </button>
          </>
        )}
      </AdminPageHeader>

      {/* Error State */}
      {error && (
        <div className="admin-error-state mb-6" role="alert">
          <p className="text-sm font-medium">{error}</p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()} className="flex-shrink-0 ml-auto">
            Coba Lagi
          </Button>
        </div>
      )}

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 mb-8 relative z-10">
        {isLoading ? (
          <>
            <Skeleton className="h-28 rounded-xl admin-skeleton-shimmer" />
            <Skeleton className="h-28 rounded-xl admin-skeleton-shimmer" />
            <Skeleton className="h-28 rounded-xl admin-skeleton-shimmer" />
            <Skeleton className="h-28 rounded-xl admin-skeleton-shimmer" />
          </>
        ) : (
          <>
            <AdminStatCard
              label="Murid Aktif"
              value={stats.totalSantri}
              icon={Users}
              variant="students"
            />
            <AdminStatCard
              label="Pemasukan"
              value={stats.totalPemasukanBulanIni}
              icon={DollarSign}
              variant="income"
              masked
              showMask={showIncome}
              onToggleMask={() => setShowIncome(!showIncome)}
            />
            <AdminStatCard
              label="Pengeluaran"
              value={stats.totalPengeluaranBulanIni}
              icon={TrendingDown}
              variant="expense"
              masked
              showMask={showExpense}
              onToggleMask={() => setShowExpense(!showExpense)}
            />
            <AdminStatCard
              label="MODE KIOSK"
              value="Absensi Digital"
              icon={Fingerprint}
              variant="kiosk"
              onClick={() => navigate('/absensi-digital')}
            />
          </>
        )}
      </div>

      {/* Module Navigation */}
      <AdminModuleNav
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Tab Content — only the modules passed in `tabs` are rendered */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6 mt-6">
        <div>
          {tabs.map((tab) => (
            <TabsContent key={tab.value} value={tab.value}>
              {renderModule(tab.value)}
            </TabsContent>
          ))}
        </div>
      </Tabs>

      {/* Global Modals for Search Navigation */}
      <SantriDetailModal
        santri={selectedSantri}
        isOpen={isSantriModalOpen}
        onOpenChange={setIsSantriModalOpen}
      />
      </div>
    </div>
  );
};

export default DashboardWorkspace;
