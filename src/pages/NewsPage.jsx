import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import BeritaBody from '@/components/sdnb/generated/BeritaBody';
import { fetchPublicTeachers, fetchPublishedAnnouncements, fetchPublishedNews } from '@/lib/publicContentAdapters';
import { inisialNama, sebutanStaf, stafKe } from '@/lib/staf';
import useSdnbMotion from '@/hooks/useSdnbMotion';
import '@/styles/sdnb.css';

/**
 * Legacy-compatible renderer kept for imports outside the active route.
 * The /berita route uses NewsPageCms, which reads published CMS content only.
 */


const N_MOCKUP = [];
const KAT = ['Semua', 'Pengumuman', 'Kegiatan', 'Prestasi', 'Fasilitas', 'PPDB'];
const CMS_GRADS = ['linear-gradient(150deg,#c4b7f7,#93b8f7)', 'linear-gradient(150deg,#ffc6da,#f6a8c6)', 'linear-gradient(150deg,#b3eee0,#8ed4ea)'];

const fmtDate = (v) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

/** Map a CMS article onto the mockup's tuple shape so both render identically. */
const cmsToTuple = (item, i) => {
  const body = item.content || item.body || item.isi || '';
  const paragraphs = String(body).split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const ringkas = item.excerpt || item.summary || item.ringkasan || paragraphs[0] || '';
  const img = item.image_url || item.cover_image_url;
  return [
    item.title || item.judul || 'Berita sekolah',
    item.category || 'Pengumuman',
    fmtDate(item.date || item.published_at || item.created_at),
    Math.max(1, Math.round(String(body).split(/\s+/).length / 200)) || 2,
    ringkas,
    paragraphs.length ? paragraphs : [ringkas].filter(Boolean),
    img ? `url("${img}") center/cover no-repeat` : CMS_GRADS[i % CMS_GRADS.length],
    item.author || 'Tata Usaha',
    item.author_role || 'Sekolah',
  ];
};

const AGENDA = [
  ['03', 'Jun', 'Pendaftaran murid baru dibuka', '07.30 di ruang tata usaha'],
  ['12', 'Jun', 'Rapat wali murid kelas VI', '09.00 di aula sekolah'],
  ['20', 'Jun', 'Pengumuman hasil seleksi PPDB', 'Papan pengumuman dan daring'],
  ['27', 'Jun', 'Batas akhir daftar ulang', '15.00 di ruang tata usaha'],
  ['13', 'Jul', 'Hari pertama tahun ajaran baru', '07.15 upacara di halaman'],
];
const AGENDA_GRAD = ['var(--sekolah-aksen),var(--sekolah-aksen-tengah)', 'var(--sekolah-aksen-tengah),var(--sekolah-aksen-ujung)', 'var(--sekolah-aksen-tengah-2),var(--sekolah-aksen-ujung)', 'var(--sekolah-aksen-ujung),var(--sekolah-aksen-hangat)', 'var(--sekolah-aksen-pekat),#9fb6f8'];

const NewsPage = () => {
  const [kat, setKat] = useState('Semua');
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(-1);
  const [cmsNews, setCmsNews] = useState([]);
  const [pengumuman, setPengumuman] = useState([]);
  const [staf, setStaf] = useState([]);

  useSdnbMotion([]);

  useEffect(() => {
    let mounted = true;
    fetchPublishedNews()
      .then((rows) => { if (mounted && Array.isArray(rows) && rows.length) setCmsNews(rows); })
      .catch(() => {});
    fetchPublishedAnnouncements({ limit: 20 })
      .then((rows) => { if (mounted && Array.isArray(rows) && rows.length) setPengumuman(rows); })
      .catch(() => { /* pengumuman opsional; halaman tetap tampil tanpa itu */ });
    fetchPublicTeachers()
      .then((rows) => { if (mounted && Array.isArray(rows)) setStaf(rows); })
      .catch(() => { /* penulis jatuh ke sebutan umum, halaman tetap tampil */ });
    return () => { mounted = false; };
  }, []);

  // Published CMS articles come first, then the mockup's own set.
  //
  // Pakai guru nyata bila tersedia; tanpa data guru, penulis contoh tetap netral.
  const N = useMemo(() => {
    const contoh = N_MOCKUP.map((baris, i) => {
      const guru = stafKe(staf, i);
      if (!guru) return baris;
      const salinan = [...baris];
      salinan[7] = String(guru.nama || '').trim() || 'Tata Usaha';
      salinan[8] = sebutanStaf(guru);
      return salinan;
    });
    // Pengumuman resmi dari panel admin muncul paling depan (backend sudah
    // mengurutkan prioritas tinggi lebih dulu), lalu berita CMS, lalu contoh
    // bawaan. Kategori dipaksa 'Pengumuman' agar tampil di filter Pengumuman
    // dan memakai kartu/reader yang sama dengan berita.
    const pengumumanTuples = pengumuman.map((item, i) => cmsToTuple({
      ...item,
      category: 'Pengumuman',
      author: item.author || 'Sekolah',
      author_role: item.author_role || 'Pengumuman Resmi',
    }, i));
    return [...pengumumanTuples, ...cmsNews.map(cmsToTuple), ...contoh];
  }, [pengumuman, cmsNews, staf]);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return N.map((n, i) => ({ n, i })).filter((o) => (kat === 'Semua' || o.n[1] === kat)
      && (!query || `${o.n[0]} ${o.n[4]} ${o.n[1]} ${o.n[7]}`.toLowerCase().includes(query)));
  }, [N, kat, q]);

  const move = useCallback((dir) => {
    const l = list.length ? list : N.map((n, i) => ({ n, i }));
    setIdx((current) => {
      const at = l.findIndex((o) => o.i === current);
      return l[(at + dir + l.length) % l.length].i;
    });
  }, [list, N]);

  useEffect(() => {
    const onKey = (e) => {
      if (idx < 0) return;
      if (e.key === 'Escape') setIdx(-1);
      if (e.key === 'ArrowRight') move(1);
      if (e.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [idx, move]);

  const card = (o) => ({
    judul: o.n[0], kat: o.n[1], tanggal: o.n[2], baca: o.n[3], ringkas: o.n[4], penulis: o.n[7],
    open: () => setIdx(o.i),
    fill: `position:absolute;inset:0;background:${o.n[6]}`,
  });

  const polos = kat === 'Semua' && !q.trim();
  const rest = polos ? list.filter((o) => o.i > 2) : list;
  const a = idx >= 0 ? N[idx] : null;
  const pos = idx >= 0 ? `${idx + 1} dari ${N.length}` : '';

  const vals = {
    tickerCls: 'mq-track',
    ticker: [
      'PPDB 2026/2027 dibuka 3 Juni', 'Adiwiyata tingkat nasional diraih Mei 2026',
      'Dua juara MTQ kabupaten dari kelas VI', 'Rapat wali murid kelas VI 12 Juni',
      'Perpustakaan buka sampai pukul 14.00', 'Kantin tanpa minuman berpemanis',
      'PPDB 2026/2027 dibuka 3 Juni', 'Adiwiyata tingkat nasional diraih Mei 2026',
      'Dua juara MTQ kabupaten dari kelas VI', 'Rapat wali murid kelas VI 12 Juni',
      'Perpustakaan buka sampai pukul 14.00', 'Kantin tanpa minuman berpemanis',
    ],

    lead: card({ n: N[0], i: 0 }),
    sekunder: [1, 2].map((i) => card({ n: N[i], i })),

    kategori: KAT.map((k) => {
      const on = kat === k;
      return {
        label: k,
        pick: () => setKat(k),
        style: 'padding:11px 16px;border-radius:14px;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:700;transition:background .3s ease,color .3s ease,box-shadow .3s ease,transform .3s cubic-bezier(.4,1.3,.4,1);' + (on
          ? 'border:0;color:#fff;background:linear-gradient(135deg,var(--sekolah-aksen),var(--sekolah-aksen-tengah-2) 60%,var(--sekolah-aksen-ujung));box-shadow:0 14px 30px -12px rgba(95,105,235,.95),inset 0 1px 0 rgba(255,255,255,.5);transform:translateY(-1px)'
          : 'border:1px solid rgba(255,255,255,.85);color:#3d4166;background:rgba(255,255,255,.5)'),
      };
    }),
    search: (e) => setQ(e.target.value),
    unggulanTampil: polos,
    hitung: `${rest.length} dari ${N.length} berita`,
    judulDaftar: polos ? 'Semua berita' : 'Hasil pencarian',
    berita: rest.map((o) => card(o)),
    kosong: rest.length === 0,

    agenda: AGENDA.map(([d, m, judul, jam], i) => ({
      d, m, judul, jam,
      chip: `flex:none;width:52px;padding:10px 0;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#fff;background:linear-gradient(140deg,${AGENDA_GRAD[i]});box-shadow:0 12px 26px -12px rgba(90,100,200,.8),inset 0 1px 0 rgba(255,255,255,.5)`,
    })),

    arsip: [
      { bulan: 'Mei 2026', n: 4 }, { bulan: 'April 2026', n: 6 }, { bulan: 'Maret 2026', n: 5 },
      { bulan: 'Februari 2026', n: 7 }, { bulan: 'Januari 2026', n: 3 },
    ],

    bacaOpen: idx >= 0,
    artikel: a ? {
      judul: a[0], kat: a[1], tanggal: a[2], baca: a[3], ringkas: a[4], isi: a[5],
      penulis: a[7], peran: a[8], pos,
      inisial: inisialNama(a[7]),
      hero: `position:relative;height:296px;overflow:hidden;background:${a[6]}`,
      avatar: 'flex:none;width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;background:linear-gradient(140deg,var(--sekolah-aksen),var(--sekolah-aksen-tengah-2) 45%,var(--sekolah-aksen-ujung));box-shadow:inset 0 1px 0 rgba(255,255,255,.8)',
    } : { judul: '', kat: '', tanggal: '', baca: '', ringkas: '', isi: [], penulis: '', peran: '', pos: '', inisial: '', hero: '', avatar: '' },
    prev: () => move(-1),
    next: () => move(1),
    close: () => setIdx(-1),
    stop: (e) => e.stopPropagation(),
  };

  return (
    <div className="sdnb-berita">
      <Helmet>
        <title>Berita — Sekolah Dasar Negeri Baturaja</title>
        <meta name="description" content="Kabar terbaru, pengumuman, prestasi, dan agenda Sekolah Dasar Negeri Baturaja." />
      </Helmet>
      {BeritaBody(vals)}
    </div>
  );
};

export default NewsPage;
