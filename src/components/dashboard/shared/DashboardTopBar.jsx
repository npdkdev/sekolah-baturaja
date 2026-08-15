import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ExternalLink, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import useSchoolIdentity from '@/hooks/useSchoolIdentity';

/**
 * Bilah atas dashboard: satu-satunya jalan keluar dari portal.
 *
 * Kenapa ini ada: `/dashboard` dirender di luar `PublicLayout`, jadi `SiteNav`
 * tidak ikut. Akibatnya **tidak ada satu pun dashboard yang punya tombol keluar
 * atau tautan kembali ke situs** — pengguna yang masuk terjebak, dan satu-satunya
 * cara keluar adalah mengetik alamat sendiri di bilah browser. Diperiksa untuk
 * kelima peran: tidak ada `signOut` di komponen dashboard mana pun.
 *
 * Sengaja dipasang di `DashboardPage`, bukan di masing-masing dashboard, supaya
 * kelima peran mendapatkannya sekaligus dan tidak ada yang terlewat lagi.
 */

const LABEL_PERAN = {
  superadmin: 'Pemilik Template',
  admin: 'Administrator',
  tata_usaha: 'Tata Usaha',
  guru: 'Guru',
  pentashih: 'Wakil Kepala Sekolah',
  santri: 'Murid',
};

const ARROW = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

const PROFILE_LINKS = [
  { label: 'Tentang kami', to: '/profil' },
  { label: 'Galeri', to: '/profil/galeri' },
  { label: 'Prestasi', to: '/prestasi' },
  { label: 'Program', to: '/program' },
  { label: 'Ekstrakurikuler', to: '/ekstrakurikuler' },
  { label: 'Fasilitas', to: '/fasilitas' },
];


const DashboardTopBar = () => {
  const { role, signOut } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const sekolah = useSchoolIdentity();
  const location = useLocation();
  const navigate = useNavigate();
  const isHome = location.pathname === '/';
  const isProfileGroup = PROFILE_LINKS.some(({ to }) => location.pathname.startsWith(to));
  const at = (path) => location.pathname.startsWith(path);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <header className="site-nav dashboard-topbar" aria-label="Navigasi portal admin">
      <div className="dashboard-topbar__shell">
        <Link to="/" className="dashboard-topbar__brand">
          <span className="dashboard-topbar__mark" aria-hidden="true">{sekolah.logoAbbr}</span>
          <span className="dashboard-topbar__identity">
            <span className="dashboard-topbar__name">{sekolah.shortName}</span>
            <span className="dashboard-topbar__role">{LABEL_PERAN[role] || 'Portal sekolah'}</span>
          </span>
        </Link>

        <span className="dashboard-topbar__context" aria-current="page">
          <span className="dashboard-topbar__context-dot" aria-hidden="true" />
          Dashboard
        </span>

        <nav className="dashboard-public-nav nav-links" aria-label="Navigasi halaman publik">
          <Link to="/" className={'dashboard-public-nav__link ' + (isHome ? 'is-active' : 'h-navlink')} aria-current={isHome ? 'page' : undefined}>Beranda</Link>

          <div className="navdd">
            <Link
              to="/profil"
              className={'dashboard-public-nav__link ' + (isProfileGroup ? 'is-active' : 'h-navlink')}
              aria-current={isProfileGroup ? 'page' : undefined}
              aria-haspopup="menu"
            >
              Profil
              <svg className="ddcaret" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6-6 6" />
              </svg>
            </Link>
            <div className="ddmenu">
              <div className="ddpanel" role="menu" aria-label="Submenu Profil">
                {PROFILE_LINKS.map(({ label, to }) => (
                  <Link key={to} to={to} className="ddlink" role="menuitem">
                    {label}
                    {ARROW}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <Link to="/berita" className={'dashboard-public-nav__link ' + (at('/berita') ? 'is-active' : 'h-navlink')} aria-current={at('/berita') ? 'page' : undefined}>Berita</Link>
          <Link to="/kontak" className={'dashboard-public-nav__link ' + (at('/kontak') ? 'is-active' : 'h-navlink')} aria-current={at('/kontak') ? 'page' : undefined}>Kontak</Link>
        </nav>

        <div className="dashboard-topbar__spacer" />

        <div className="dashboard-topbar__actions">
          <button type="button" onClick={toggleTheme} aria-label="Ganti tema terang atau gelap" className="dashboard-nav-icon-button th-toggle">
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <Link to="/" aria-label="Lihat situs sekolah" className="dashboard-nav-button">
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
            <span className="dashboard-nav-button__label">Lihat situs</span>
          </Link>

          <button type="button" onClick={handleLogout} aria-label="Keluar dari akun" className="dashboard-nav-button dashboard-nav-button--danger">
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span className="dashboard-nav-button__label">Keluar</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default DashboardTopBar;
