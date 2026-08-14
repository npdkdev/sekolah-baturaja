import apiClient, { publicFetch } from '@/lib/apiClient';
import { DEFAULT_LOGO_PATH, isLegacyLogoPath } from '@/lib/schoolAssets';

const toDateText = (value) => value ? new Date(value).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

export const slugify = (value) => String(value || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80) || `konten-${Date.now()}`;

export const getPublicContentErrorMessage = (error) => {
  if (!error) return 'Terjadi kesalahan tidak diketahui.';
  if (error.code === '23505') return 'Slug sudah digunakan. Ubah judul atau slug konten.';
  if (error.code === '42501') return 'Akses ditolak oleh kebijakan keamanan.';
  return error.message || String(error);
};

const normalizeMediaItems = (value) => (Array.isArray(value) ? value : [])
  .map((item, index) => {
    if (typeof item === 'string') {
      return { id: 'media-' + index, url: item, type: 'image', caption: '', alt: '' };
    }
    if (!item || typeof item !== 'object') return null;
    const url = String(item.url || item.publicUrl || item.src || '').trim();
    if (!url) return null;
    return {
      id: String(item.id || 'media-' + index),
      url,
      type: String(item.type || 'image'),
      caption: String(item.caption || item.title || '').trim(),
      alt: String(item.alt || item.caption || item.title || '').trim(),
    };
  })
  .filter(Boolean);

export const normalizeNewsContent = (value) => {
  if (typeof value === 'string') return { body: value, gallery: [], media: [] };
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    body: String(source.body || source.text || source.isi || '').trim(),
    gallery: normalizeMediaItems(source.gallery || source.images),
    media: normalizeMediaItems(source.media),
  };
};

export const normalizeNewsRow = (row) => {
  const content = normalizeNewsContent(row.content);
  const storedMedia = normalizeNewsContent({ gallery: row.media, media: row.media });
  const gallery = storedMedia.gallery.length ? storedMedia.gallery : content.gallery;
  const media = storedMedia.media.length ? storedMedia.media : content.media;
  const displayOrder = Number(row.display_order);
  return {
    id: row.id,
    title: row.title || '',
    slug: row.slug || row.id,
    summary: row.excerpt || '',
    excerpt: row.excerpt || '',
    content: content.body,
    body: content.body,
    gallery,
    media,
    image_url: row.cover_image_url || '',
    cover_image_url: row.cover_image_url || '',
    category: row.category || 'Umum',
    author: row.author || '',
    author_role: row.author_role || '',
    status: row.status || 'draft',
    is_featured: row.is_featured === true,
    display_order: Number.isFinite(displayOrder) ? displayOrder : 0,
    is_public: row.is_public !== false,
    date: toDateText(row.published_at || row.created_at),
    published_at: row.published_at,
    created_at: row.created_at,
  };
};

export const normalizeAnnouncementRow = (row) => ({
  id: row.id,
  title: row.title || '',
  slug: row.slug || row.id,
  summary: row.excerpt || '',
  excerpt: row.excerpt || '',
  content: row.content?.body || row.content?.text || '',
  image_url: row.cover_image_url || '',
  cover_image_url: row.cover_image_url || '',
  status: row.status || 'draft',
  priority: row.priority || 'normal',
  valid_until: row.valid_until || '',
  date: toDateText(row.published_at || row.created_at),
  published_at: row.published_at,
  created_at: row.created_at,
});

export const fetchWebsiteContentMap = async ({ keys, publicOnly = true } = {}) => {
  const params = new URLSearchParams();
  if (Array.isArray(keys) && keys.length > 0) params.set('keys', keys.join(','));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const url = `/api/content/website${qs}`;
  const data = publicOnly
    ? await publicFetch(url)
    : await apiClient.get(url);
  return data || {};
};

export const WEBSITE_CONTENT_UPDATED_EVENT = 'sdnb:website-content-updated';
export const WEBSITE_CONTENT_UPDATED_STORAGE_KEY = 'sdnb:website-content-updated';

/**
 * Lets an already-open public tab refresh the small slice of CMS content it
 * displays after an admin saves. The payload contains no content or user data;
 * localStorage is only used as a cross-tab signal.
 */
export const announceWebsiteContentUpdate = (keys = []) => {
  if (typeof window === 'undefined') return;
  const normalizedKeys = Array.isArray(keys)
    ? keys.map((key) => String(key || '').trim()).filter(Boolean)
    : [];
  const detail = { keys: normalizedKeys };
  window.dispatchEvent(new CustomEvent(WEBSITE_CONTENT_UPDATED_EVENT, { detail }));
  try {
    window.localStorage.setItem(WEBSITE_CONTENT_UPDATED_STORAGE_KEY, JSON.stringify({ ...detail, at: Date.now() }));
  } catch {
    // Storage can be disabled in a private or embedded context. The in-tab
    // CustomEvent above still keeps the current page responsive.
  }
};

export const normalizeWebsiteContentValue = (value) => {
  if (value === undefined || value === null) return {};
  if (typeof value === 'string') return value.trim();
  return value;
};

export const assertNonEmptyWebsiteContentString = (key, value) => {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw new Error(`${key} tidak boleh kosong.`);
  return normalized;
};

export const saveWebsiteContentItem = async ({ key, content, isPublic = true }) => {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) throw new Error('Key konten wajib diisi.');
  const normalizedContent = normalizeWebsiteContentValue(content);
  return apiClient.put(`/api/content/website/${encodeURIComponent(normalizedKey)}`, {
    content: normalizedContent,
    is_public: isPublic,
  });
};

export const saveWebsiteContentItems = async (items) => {
  const payload = (items || [])
    .map((item) => ({
      key: String(item.key || '').trim(),
      content: normalizeWebsiteContentValue(item.content),
      is_public: item.is_public ?? item.isPublic ?? true,
    }))
    .filter((item) => item.key);
  if (payload.length === 0) return [];
  return Promise.all(
    payload.map((item) =>
      apiClient.put(`/api/content/website/${encodeURIComponent(item.key)}`, {
        content: item.content,
        is_public: item.is_public,
      })
    )
  );
};

const blobToDataUrl = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
  reader.onerror = () => reject(new Error('Gagal membaca gambar logo.'));
  reader.readAsDataURL(blob);
});

export const getEmbeddableImageUrl = async (url, fallback = DEFAULT_LOGO_PATH) => {
  const candidate = typeof url === 'string' ? url.trim() : '';
  const target = candidate && !isLegacyLogoPath(candidate) ? candidate : fallback;
  if (target.startsWith('data:') || target.startsWith('/')) return target;
  try {
    const response = await fetch(target, { mode: 'cors', cache: 'no-store' });
    if (!response.ok) throw new Error(`Logo tidak dapat dimuat (${response.status}).`);
    const blob = await response.blob();
    return await blobToDataUrl(blob);
  } catch {
    return fallback;
  }
};

export const fetchReceiptLogoDataUrl = async (fallback = DEFAULT_LOGO_PATH) => {
  try {
    const contentMap = await fetchWebsiteContentMap({ keys: ['logoUrl'], publicOnly: true });
    return await getEmbeddableImageUrl(contentMap.logoUrl, fallback);
  } catch {
    return fallback;
  }
};

export const waitForImagesToLoad = async (rootElement) => {
  if (!rootElement) return;
  const images = Array.from(rootElement.querySelectorAll('img'));
  await Promise.all(images.map((image) => {
    if (image.complete && image.naturalWidth > 0) return Promise.resolve();
    return new Promise((resolve) => {
      image.onload = () => resolve();
      image.onerror = () => resolve();
    });
  }));
};

export const fetchPublishedNews = async ({ limit } = {}) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await publicFetch(`/api/content/news${qs}`);
  return (data || []).map(normalizeNewsRow);
};

export const fetchNewsDetail = async (slugOrId) => {
  const data = await publicFetch(`/api/content/news/${encodeURIComponent(slugOrId)}`);
  return data ? normalizeNewsRow(data) : null;
};

export const fetchPublishedAnnouncements = async ({ limit } = {}) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  const qs = params.toString() ? `?${params.toString()}` : '';
  const data = await publicFetch(`/api/content/announcements${qs}`);
  return (data || []).map(normalizeAnnouncementRow);
};

export const fetchAnnouncementDetail = async (slugOrId) => {
  const data = await publicFetch(`/api/content/announcements/${encodeURIComponent(slugOrId)}`);
  if (!data) return null;
  if (data.valid_until && data.valid_until < new Date().toISOString().slice(0, 10)) return null;
  return normalizeAnnouncementRow(data);
};

export const fetchAdminNews = async () => {
  const data = await apiClient.get('/api/content/news');
  return (data || []).map(normalizeNewsRow);
};

export const fetchAdminAnnouncements = async () => {
  const data = await apiClient.get('/api/content/announcements');
  return (data || []).map(normalizeAnnouncementRow);
};

const publicationTimestamp = (status, explicitPublishedAt, existingPublishedAt = null) => {
  if (explicitPublishedAt === '') return null;
  if (explicitPublishedAt) {
    const parsed = new Date(explicitPublishedAt);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  if (status !== 'published') return existingPublishedAt || null;
  return existingPublishedAt || new Date().toISOString();
};

export const saveNews = async (item) => {
  const status = item.status || 'draft';
  const normalizedContent = normalizeNewsContent(
    item.content && typeof item.content === 'object'
      ? item.content
      : { body: item.content || item.body, gallery: item.gallery, media: item.media },
  );
  const displayOrder = Number.parseInt(item.display_order, 10);
  const payload = {
    title: String(item.title || '').trim(),
    slug: String(item.slug || slugify(item.title)).trim(),
    excerpt: String(item.summary || item.excerpt || '').trim() || null,
    content: normalizedContent,
    media: normalizedContent.gallery.length > 0 ? normalizedContent.gallery : normalizedContent.media,
    cover_image_url: String(item.image_url || item.cover_image_url || '').trim() || null,
    category: String(item.category || 'Umum').trim() || 'Umum',
    author: String(item.author || '').trim() || null,
    author_role: String(item.author_role || '').trim() || null,
    status,
    is_featured: item.is_featured === true,
    display_order: Number.isFinite(displayOrder) && displayOrder >= 0 ? displayOrder : 0,
    is_public: item.is_public !== false,
    published_at: publicationTimestamp(status, item.published_at, item.published_at),
  };
  if (!payload.title) throw new Error('Judul berita wajib diisi.');
  if (!payload.slug) throw new Error('Slug berita wajib diisi.');
  if (!payload.content.body) throw new Error('Isi berita wajib diisi.');
  const data = item.id
    ? await apiClient.put(`/api/content/news/${item.id}`, payload)
    : await apiClient.post('/api/content/news', payload);
  return normalizeNewsRow(data);
};

export const saveAnnouncement = async (item) => {
  const status = item.status || 'draft';
  const payload = {
    title: String(item.title || '').trim(),
    slug: String(item.slug || slugify(item.title)).trim(),
    excerpt: String(item.summary || item.excerpt || '').trim() || null,
    content: { body: String(item.content || '').trim() },
    cover_image_url: String(item.image_url || item.cover_image_url || '').trim() || null,
    status,
    priority: item.priority || 'normal',
    valid_until: item.valid_until || null,
    published_at: publicationTimestamp(status, item.published_at),
  };
  if (!payload.title) throw new Error('Judul pengumuman wajib diisi.');
  const data = item.id
    ? await apiClient.put(`/api/content/announcements/${item.id}`, payload)
    : await apiClient.post('/api/content/announcements', payload);
  return normalizeAnnouncementRow(data);
};

export const archiveNews = async (id) => {
  await apiClient.put(`/api/content/news/${id}`, { status: 'archived' });
};

export const deleteNews = async (id) => {
  await apiClient.delete(`/api/content/news/${id}`);
};

export const archiveAnnouncement = async (id) => {
  await apiClient.put(`/api/content/announcements/${id}`, { status: 'archived' });
};

export const submitPublicFeedback = async ({ nama, name, email, phone, no_hp, message, pesan }) => {
  const payload = {
    nama: String(nama || name || '').trim() || null,
    email: String(email || '').trim() || null,
    phone: String(phone || no_hp || '').trim() || null,
    message: String(message || pesan || '').trim(),
  };
  if (!payload.message) throw new Error('Pesan wajib diisi.');
  const apiUrl = `${import.meta.env.VITE_API_URL || 'http://localhost:8080'}/api/content/feedback`;
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Gagal mengirim pesan (${res.status}).`);
  }
};

// Public teacher roster for the profile page. /api/guru sits behind RequireAuth,
// so the public profile page uses this unauthenticated, reduced-field endpoint.
export const fetchPublicTeachers = async () => {
  const data = await publicFetch('/api/content/teachers');
  return data || [];
};

export const normalizeFeedback = (row) => ({
  id: row?.id,
  nama: row?.nama || '',
  email: row?.email || '',
  phone: row?.phone || '',
  message: row?.message || '',
  status: row?.status || 'new',
  created_at: row?.created_at || '',
});

export const fetchAdminFeedbacks = async () => {
  const data = await apiClient.get('/api/content/feedback');
  return (data || []).map(normalizeFeedback);
};

export const updateFeedbackStatus = async (id, status) => normalizeFeedback(
  await apiClient.put(`/api/content/feedback/${id}`, { status }),
);

export const deleteFeedback = async (id) => {
  await apiClient.delete(`/api/content/feedback/${id}`);
};

export const NEWS_CONTENT_UPDATED_EVENT = 'sdnb:news-content-updated';
export const NEWS_CONTENT_UPDATED_STORAGE_KEY = 'sdnb:news-content-updated';

export const announceNewsContentUpdate = (news = null) => {
  if (typeof window === 'undefined') return;
  const detail = { id: news?.id ? String(news.id) : null };
  window.dispatchEvent(new CustomEvent(NEWS_CONTENT_UPDATED_EVENT, { detail }));
  try {
    window.localStorage.setItem(
      NEWS_CONTENT_UPDATED_STORAGE_KEY,
      JSON.stringify({ ...detail, at: Date.now() }),
    );
  } catch {
    // The in-tab event above is enough when storage is unavailable.
  }
};
