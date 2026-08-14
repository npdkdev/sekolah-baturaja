import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import BeritaBody from '@/components/sdnb/generated/BeritaBody';
import {
  NEWS_CONTENT_UPDATED_EVENT,
  NEWS_CONTENT_UPDATED_STORAGE_KEY,
  fetchPublishedAnnouncements,
  fetchPublishedNews,
  getPublicContentErrorMessage,
} from '@/lib/publicContentAdapters';
import useSdnbMotion from '@/hooks/useSdnbMotion';
import '@/styles/sdnb.css';

const CMS_GRADS = [
  'linear-gradient(150deg,#c4b7f7,#93b8f7)',
  'linear-gradient(150deg,#ffc6da,#f6a8c6)',
  'linear-gradient(150deg,#b3eee0,#8ed4ea)',
];

const fmtDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
};

const monthLabel = (value) => {
  if (!value) return 'Tanpa tanggal';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Tanpa tanggal'
    : date.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

const normalizeArticle = (item, index, forcedCategory = '') => {
  const body = String(item.content || item.body || '').trim();
  const paragraphs = body.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean);
  const summary = String(item.summary || item.excerpt || paragraphs[0] || '').trim();
  const image = item.image_url || item.cover_image_url || '';
  const gallery = Array.isArray(item.gallery) && item.gallery.length > 0
    ? item.gallery
    : (Array.isArray(item.media) ? item.media : []);
  return {
    id: item.id,
    title: item.title || 'Berita sekolah',
    category: forcedCategory || item.category || 'Umum',
    date: fmtDate(item.published_at || item.created_at),
    dateValue: item.published_at || item.created_at || '',
    minutes: Math.max(1, Math.round(body.split(/\s+/).filter(Boolean).length / 200) || 1),
    summary,
    paragraphs: paragraphs.length > 0 ? paragraphs : [summary].filter(Boolean),
    image,
    fill: image ? 'url("' + image + '") center/cover no-repeat' : CMS_GRADS[index % CMS_GRADS.length],
    author: item.author || 'Sekolah',
    authorRole: item.author_role || 'Sekolah',
    gallery,
  };
};

const NewsPageCms = () => {
  const [category, setCategory] = useState('Semua');
  const [query, setQuery] = useState('');
  const [articleIndex, setArticleIndex] = useState(-1);
  const [news, setNews] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  useSdnbMotion([]);

  const loadContent = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [newsRows, announcementRows] = await Promise.all([
        fetchPublishedNews({ limit: 100 }),
        fetchPublishedAnnouncements({ limit: 100 }),
      ]);
      setNews(Array.isArray(newsRows) ? newsRows : []);
      setAnnouncements(Array.isArray(announcementRows) ? announcementRows : []);
    } catch (error) {
      setLoadError(getPublicContentErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContent();
    const refresh = () => loadContent();
    const onStorage = (event) => {
      if (event.key === NEWS_CONTENT_UPDATED_STORAGE_KEY) refresh();
    };
    window.addEventListener(NEWS_CONTENT_UPDATED_EVENT, refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(NEWS_CONTENT_UPDATED_EVENT, refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, [loadContent]);

  const articles = useMemo(() => [
    ...announcements.map((item, index) => normalizeArticle(item, index, 'Pengumuman')),
    ...news.map((item, index) => normalizeArticle(item, index + announcements.length)),
  ], [announcements, news]);

  const categories = useMemo(() => [
    'Semua',
    ...Array.from(new Set(articles.map((article) => article.category).filter(Boolean))),
  ], [articles]);

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return articles
      .map((article, index) => ({ article, index }))
      .filter(({ article }) => (category === 'Semua' || article.category === category)
        && (!normalizedQuery || [article.title, article.summary, article.category, article.author].join(' ').toLowerCase().includes(normalizedQuery)));
  }, [articles, category, query]);

  const move = useCallback((direction) => {
    const candidates = filtered.length > 0 ? filtered : articles.map((article, index) => ({ article, index }));
    if (candidates.length === 0) return;
    setArticleIndex((current) => {
      const position = candidates.findIndex((entry) => entry.index === current);
      return candidates[(position + direction + candidates.length) % candidates.length].index;
    });
  }, [articles, filtered]);

  useEffect(() => {
    const onKey = (event) => {
      if (articleIndex < 0) return;
      if (event.key === 'Escape') setArticleIndex(-1);
      if (event.key === 'ArrowRight') move(1);
      if (event.key === 'ArrowLeft') move(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [articleIndex, move]);

  const card = useCallback((entry) => ({
    judul: entry.article.title,
    kat: entry.article.category,
    tanggal: entry.article.date,
    baca: entry.article.minutes,
    ringkas: entry.article.summary,
    penulis: entry.article.author,
    open: () => setArticleIndex(entry.index),
    fill: 'position:absolute;inset:0;background:' + entry.article.fill,
  }), []);

  const currentArticle = articleIndex >= 0 ? articles[articleIndex] : null;
  const tickerBase = articles.slice(0, 6).map((article) => article.title);
  const agenda = announcements
    .map((item, index) => {
      const date = new Date(item.published_at || item.created_at || 0);
      return {
        d: Number.isNaN(date.getTime()) ? '--' : String(date.getDate()).padStart(2, '0'),
        m: Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('id-ID', { month: 'short' }),
        judul: item.title,
        jam: item.published_at ? 'Terbit ' + fmtDate(item.published_at) : 'Informasi sekolah',
        chip: 'flex:none;width:52px;padding:10px 0;border-radius:14px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:#fff;background:linear-gradient(140deg,var(--sekolah-aksen),var(--sekolah-aksen-ujung));box-shadow:0 12px 26px -12px rgba(90,100,200,.8),inset 0 1px 0 rgba(255,255,255,.5)',
        index,
      };
    });
  const archiveMap = new Map();
  articles.forEach((article) => {
    const key = monthLabel(article.dateValue);
    archiveMap.set(key, (archiveMap.get(key) || 0) + 1);
  });
  const archive = Array.from(archiveMap, ([bulan, n]) => ({ bulan, n }));
  const list = filtered;
  const featured = category === 'Semua' && !query.trim();
  const rest = featured && list.length > 3 ? list.slice(3) : list;
  const emptyArticle = { judul: '', kat: '', tanggal: '', baca: '', ringkas: '', isi: [], penulis: '', peran: '', pos: '', inisial: '', hero: '', avatar: '', media: [] };

  if (loading) {
    return (
      <div className="sdnb-berita">
        <Helmet><title>Berita — Sekolah Dasar Negeri Baturaja</title></Helmet>
        <section className="mx-auto max-w-5xl px-7 py-16" aria-busy="true" aria-label="Memuat berita">
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-slate-200/70" />
          <div className="mt-6 h-56 animate-pulse rounded-3xl bg-slate-200/70" />
          <div className="mt-6 grid gap-5 md:grid-cols-2"><div className="h-48 animate-pulse rounded-3xl bg-slate-200/70" /><div className="h-48 animate-pulse rounded-3xl bg-slate-200/70" /></div>
        </section>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="sdnb-berita">
        <Helmet><title>Berita — Sekolah Dasar Negeri Baturaja</title></Helmet>
        <section className="mx-auto max-w-3xl px-7 py-20 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Berita belum dapat dimuat</h1>
          <p className="mt-3 text-sm text-slate-600">{loadError}</p>
          <button type="button" onClick={loadContent} className="mt-6 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white">Coba lagi</button>
        </section>
      </div>
    );
  }

  if (articles.length === 0) {
    return (
      <div className="sdnb-berita">
        <Helmet><title>Berita — Sekolah Dasar Negeri Baturaja</title></Helmet>
        <section className="mx-auto max-w-3xl px-7 py-20 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Belum ada berita</h1>
          <p className="mt-3 text-sm text-slate-600">Berita dan pengumuman sekolah akan tampil di sini setelah diterbitkan.</p>
        </section>
      </div>
    );
  }

  const values = {
    tickerCls: 'mq-track',
    ticker: [...tickerBase, ...tickerBase],
    lead: card({ article: articles[0], index: 0 }),
    sekunder: articles.slice(1, 3).map((article, index) => card({ article, index: index + 1 })),
    kategori: categories.map((item) => ({
      label: item,
      pick: () => setCategory(item),
      style: 'padding:11px 16px;border-radius:14px;cursor:pointer;font-family:inherit;font-size:13.5px;font-weight:700;transition:background .3s ease,color .3s ease,box-shadow .3s ease,transform .3s cubic-bezier(.4,1.3,.4,1);' + (category === item
        ? 'border:0;color:#fff;background:linear-gradient(135deg,var(--sekolah-aksen),var(--sekolah-aksen-tengah-2) 60%,var(--sekolah-aksen-ujung));box-shadow:0 14px 30px -12px rgba(95,105,235,.95),inset 0 1px 0 rgba(255,255,255,.5);transform:translateY(-1px)'
        : 'border:1px solid rgba(255,255,255,.85);color:#3d4166;background:rgba(255,255,255,.5)'),
    })),
    search: (event) => setQuery(event.target.value),
    unggulanTampil: featured,
    hitung: rest.length + ' dari ' + articles.length + ' berita',
    judulDaftar: featured ? 'Semua berita' : 'Hasil pencarian',
    berita: rest.map(card),
    kosong: rest.length === 0,
    agenda,
    arsip: archive,
    bacaOpen: articleIndex >= 0,
    artikel: currentArticle ? {
      judul: currentArticle.title,
      kat: currentArticle.category,
      tanggal: currentArticle.date,
      baca: currentArticle.minutes,
      ringkas: currentArticle.summary,
      isi: currentArticle.paragraphs,
      penulis: currentArticle.author,
      peran: currentArticle.authorRole,
      pos: articleIndex + 1 + ' dari ' + articles.length,
      inisial: currentArticle.author.slice(0, 1).toUpperCase() || 'S',
      hero: 'position:relative;height:296px;overflow:hidden;background:' + currentArticle.fill,
      avatar: 'flex:none;width:42px;height:42px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;background:linear-gradient(140deg,var(--sekolah-aksen),var(--sekolah-aksen-tengah-2) 45%,var(--sekolah-aksen-ujung));box-shadow:inset 0 1px 0 rgba(255,255,255,.8)',
      media: currentArticle.gallery,
    } : emptyArticle,
    prev: () => move(-1),
    next: () => move(1),
    close: () => setArticleIndex(-1),
    stop: (event) => event.stopPropagation(),
  };

  return (
    <div className="sdnb-berita">
      <Helmet>
        <title>Berita — Sekolah Dasar Negeri Baturaja</title>
        <meta name="description" content="Kabar terbaru, pengumuman, prestasi, dan agenda Sekolah Dasar Negeri Baturaja." />
      </Helmet>
      {BeritaBody(values)}
    </div>
  );
};

export default NewsPageCms;

