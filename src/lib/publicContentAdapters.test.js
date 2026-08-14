import { describe, expect, it } from 'vitest';
import { normalizeNewsContent, normalizeNewsRow } from './publicContentAdapters';

describe('public news contract', () => {
  it('normalizes body and gallery/media content from the CMS', () => {
    expect(normalizeNewsContent({
      body: 'Isi berita',
      gallery: ['https://example.test/gallery.jpg'],
      media: [{ url: 'https://example.test/media.jpg', caption: 'Keterangan' }],
    })).toEqual({
      body: 'Isi berita',
      gallery: [{ id: 'media-0', url: 'https://example.test/gallery.jpg', type: 'image', caption: '', alt: '' }],
      media: [{ id: 'media-0', url: 'https://example.test/media.jpg', type: 'image', caption: 'Keterangan', alt: 'Keterangan' }],
    });
  });

  it('keeps lifecycle and author metadata while reading legacy content', () => {
    const row = normalizeNewsRow({
      id: 'news-1',
      title: 'Berita CMS',
      slug: 'berita-cms',
      excerpt: 'Ringkasan',
      content: { text: 'Isi lama' },
      media: [{ url: 'https://example.test/cover.jpg', alt: 'Cover' }],
      category: 'Kegiatan',
      author: 'Humas',
      author_role: 'Sekolah',
      status: 'published',
      is_featured: true,
      display_order: 2,
      is_public: true,
      published_at: '2026-08-11T10:00:00Z',
      created_at: '2026-08-10T10:00:00Z',
    });

    expect(row).toMatchObject({
      id: 'news-1',
      content: 'Isi lama',
      category: 'Kegiatan',
      author: 'Humas',
      author_role: 'Sekolah',
      status: 'published',
      is_featured: true,
      display_order: 2,
      is_public: true,
    });
    expect(row.gallery).toHaveLength(1);
    expect(row.media).toHaveLength(1);
  });
});

