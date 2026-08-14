import React, { useEffect, useState } from 'react';
import { CheckCircle2, Edit3, Eye, FileImage, ImagePlus, Loader2, Save, Star, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import {
  announceNewsContentUpdate,
  fetchAdminNews,
  getPublicContentErrorMessage,
  normalizeNewsContent,
  saveNews,
} from '@/lib/publicContentAdapters';
import { getStorageErrorMessage, uploadWebsiteAsset, validateWebsiteAssetFile } from '@/lib/storageAdapters';

export const NEWS_CATEGORIES = ['Pengumuman', 'Kegiatan', 'Prestasi', 'Fasilitas', 'PPDB', 'Umum', 'Lainnya'];

export const EMPTY_NEWS_FORM = {
  title: '',
  slug: '',
  category: 'Pengumuman',
  summary: '',
  content: '',
  image_url: '',
  gallery: [],
  media: [],
  author: '',
  author_role: '',
  published_at: '',
  status: 'draft',
  is_featured: false,
  display_order: 0,
  is_public: true,
};

const toLocalDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return date.getFullYear()
    + '-' + pad(date.getMonth() + 1)
    + '-' + pad(date.getDate())
    + 'T' + pad(date.getHours())
    + ':' + pad(date.getMinutes());
};

export const toFormState = (item) => {
  if (!item) return { ...EMPTY_NEWS_FORM };
  const rawContent = item.content && typeof item.content === 'object'
    ? item.content
    : { body: item.body || item.content, gallery: item.gallery, media: item.media };
  const content = normalizeNewsContent(rawContent);
  const gallery = Array.isArray(item.gallery) && item.gallery.length > 0 ? item.gallery : content.gallery;
  const media = Array.isArray(item.media) && item.media.length > 0 ? item.media : content.media;
  return {
    ...EMPTY_NEWS_FORM,
    ...item,
    summary: item.summary || item.excerpt || '',
    content: content.body,
    image_url: item.image_url || item.cover_image_url || '',
    gallery,
    media: media.length > 0 ? media : gallery,
    author: item.author || '',
    author_role: item.author_role || '',
    published_at: toLocalDateTime(item.published_at),
    display_order: Number.isFinite(Number(item.display_order)) ? Number(item.display_order) : 0,
    is_featured: item.is_featured === true,
    is_public: item.is_public !== false,
  };
};

const formatDate = (value) => {
  if (!value) return 'Belum dijadwalkan';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Tanggal tidak valid';
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};

const validateNewsImage = (file) => {
  validateWebsiteAssetFile(file);
  if (!file.type || !file.type.startsWith('image/')) {
    throw new Error('Media berita harus berupa JPG, PNG, atau WebP.');
  }
};

export const NewsPreview = ({ form }) => {
  const paragraphs = String(form.content || '').trim().split(/\n{2,}/).filter(Boolean);
  const gallery = Array.isArray(form.gallery) ? form.gallery : [];
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-white/10 dark:bg-white/[0.03]">
      {form.image_url ? <img src={form.image_url} alt={form.title || 'Sampul berita'} className="h-56 w-full object-cover sm:h-72" /> : <div className="flex h-56 items-center justify-center bg-slate-100 text-sm text-muted-foreground dark:bg-white/5 sm:h-72">Belum ada foto sampul</div>}
      <div className="space-y-4 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-indigo-700 dark:bg-indigo-400/10 dark:text-indigo-200">{form.category || 'Umum'}</span>
          <span className="text-muted-foreground">{formatDate(form.published_at)}</span>
          {form.is_featured && <span className="inline-flex items-center gap-1 text-amber-600"><Star className="h-3.5 w-3.5 fill-current" /> Unggulan</span>}
        </div>
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{form.title || 'Judul berita'}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{form.summary || 'Ringkasan berita belum diisi.'}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>Penulis: {form.author || 'Belum diisi'}</span>
          {form.author_role && <span>{form.author_role}</span>}
        </div>
        <div className="space-y-3 text-sm leading-7 text-slate-700 dark:text-slate-200">
          {paragraphs.length > 0 ? paragraphs.map((paragraph, index) => <p key={index} className="whitespace-pre-wrap">{paragraph}</p>) : <p className="italic text-muted-foreground">Isi berita belum diisi.</p>}
        </div>
        {gallery.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{gallery.map((media, index) => <figure key={media.id || media.url || index} className="overflow-hidden rounded-xl border border-slate-200/80 dark:border-white/10"><img src={media.url} alt={media.alt || media.caption || 'Media berita'} className="aspect-[4/3] w-full object-cover" />{media.caption && <figcaption className="p-2 text-xs text-muted-foreground">{media.caption}</figcaption>}</figure>)}</div>}
      </div>
    </article>
  );
};

const NewsEditorDialog = ({ open, item, onClose, onSaved }) => {
  const [form, setForm] = useState({ ...EMPTY_NEWS_FORM });
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    if (open) {
      setForm(toFormState(item));
      setIsPreview(false);
      setFormError('');
    }
  }, [open, item]);

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setFormError('');
  };

  const validateForm = () => {
    const title = String(form.title || '').trim();
    const slug = String(form.slug || '').trim();
    if (!title) return 'Judul berita wajib diisi.';
    if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return 'Slug hanya boleh berisi huruf kecil, angka, dan tanda hubung.';
    if (!String(form.category || '').trim()) return 'Kategori berita wajib dipilih.';
    if (!String(form.content || '').trim()) return 'Isi berita wajib diisi.';
    return '';
  };

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }
    setIsSaving(true);
    setFormError('');
    try {
      const saved = await saveNews({
        ...form,
        title: String(form.title).trim(),
        slug: String(form.slug).trim(),
        summary: String(form.summary || '').trim(),
        content: String(form.content || '').trim(),
        gallery: Array.isArray(form.gallery) ? form.gallery : [],
        media: Array.isArray(form.media) ? form.media : [],
      });
      let nextItems = null;
      try {
        nextItems = await fetchAdminNews();
      } catch {
        // The saved row is still useful if a follow-up refresh is unavailable.
      }
      onSaved?.({ saved, items: nextItems });
      announceNewsContentUpdate(saved);
      onClose();
      toast({
        title: form.status === 'published' && form.is_public !== false ? 'Berita diterbitkan' : 'Berita tersimpan',
        description: 'Perubahan berita sudah tersinkron ke halaman publik.',
      });
    } catch (error) {
      setFormError(getPublicContentErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCoverUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setBusyAction('cover');
    setFormError('');
    try {
      validateNewsImage(file);
      const asset = await uploadWebsiteAsset({ folder: 'article-images', file });
      updateField('image_url', asset.publicUrl);
      toast({ title: 'Sampul berhasil diunggah', description: 'Simpan berita untuk menerapkan perubahan.' });
    } catch (error) {
      setFormError(getStorageErrorMessage(error));
    } finally {
      setBusyAction('');
    }
  };

  const handleGalleryUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (files.length === 0) return;
    setBusyAction('gallery');
    setFormError('');
    try {
      const uploaded = [];
      for (const [index, file] of files.entries()) {
        validateNewsImage(file);
        const asset = await uploadWebsiteAsset({ folder: 'article-images', file });
        uploaded.push({ id: 'upload-' + Date.now() + '-' + index, url: asset.publicUrl, type: 'image', caption: '', alt: file.name });
      }
      setForm((previous) => ({
        ...previous,
        gallery: [...(previous.gallery || []), ...uploaded],
        media: [...(previous.media || []), ...uploaded],
      }));
      toast({ title: 'Galeri berhasil diunggah', description: uploaded.length + ' media siap disimpan.' });
    } catch (error) {
      setFormError(getStorageErrorMessage(error));
    } finally {
      setBusyAction('');
    }
  };

  const updateGalleryItem = (index, field, value) => {
    setForm((previous) => {
      const gallery = [...(previous.gallery || [])];
      gallery[index] = { ...gallery[index], [field]: value };
      return { ...previous, gallery, media: gallery };
    });
  };

  const removeGalleryItem = (index) => {
    setForm((previous) => {
      const gallery = (previous.gallery || []).filter((_, itemIndex) => itemIndex !== index);
      return { ...previous, gallery, media: gallery };
    });
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen && !isSaving && !busyAction) onClose(); }}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{form.id ? 'Edit berita' : 'Tambah berita'}</DialogTitle>
          <DialogDescription>Isi field berita, atur visibilitas, lalu pratinjau sebelum menyimpan atau menerbitkan.</DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5">
          <span className="px-3 text-xs font-semibold text-muted-foreground">{isPreview ? 'Mode pratinjau' : 'Mode editor'}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setIsPreview((value) => !value)}>{isPreview ? <><Edit3 className="mr-2 h-4 w-4" /> Kembali ke editor</> : <><Eye className="mr-2 h-4 w-4" /> Pratinjau</>}</Button>
        </div>

        {isPreview ? <NewsPreview form={form} /> : <div className="space-y-5">
          {formError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200" role="alert">{formError}</div>}
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium md:col-span-2">Judul berita<Input value={form.title} onChange={(event) => updateField('title', event.target.value)} placeholder="Contoh: Siswa SDN Baturaja Raih Prestasi..." /></label>
            <label className="space-y-1.5 text-sm font-medium">Slug<Input value={form.slug} onChange={(event) => updateField('slug', event.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''))} placeholder="judul-berita" /></label>
            <label className="space-y-1.5 text-sm font-medium">Kategori<Select value={form.category || 'Pengumuman'} onValueChange={(value) => updateField('category', value)}><SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger><SelectContent>{NEWS_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></label>
            <label className="space-y-1.5 text-sm font-medium">Penulis<Input value={form.author} onChange={(event) => updateField('author', event.target.value)} placeholder="Nama penulis atau sekolah" /></label>
            <label className="space-y-1.5 text-sm font-medium">Peran penulis<Input value={form.author_role} onChange={(event) => updateField('author_role', event.target.value)} placeholder="Contoh: Humas Sekolah" /></label>
            <label className="space-y-1.5 text-sm font-medium">Status<Select value={form.status || 'draft'} onValueChange={(value) => updateField('status', value)}><SelectTrigger><SelectValue placeholder="Pilih status" /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="published">Terbit</SelectItem><SelectItem value="archived">Arsip</SelectItem></SelectContent></Select></label>
            <label className="space-y-1.5 text-sm font-medium">Tanggal publikasi<Input type="datetime-local" value={form.published_at || ''} onChange={(event) => updateField('published_at', event.target.value)} /></label>
            <label className="space-y-1.5 text-sm font-medium">Urutan tampil<Input type="number" min="0" step="1" value={form.display_order} onChange={(event) => updateField('display_order', event.target.value)} /></label>
          </div>
          <div className="flex flex-wrap gap-5 rounded-xl border border-slate-200/80 p-3 text-sm dark:border-white/10">
            <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={form.is_public} onChange={(event) => updateField('is_public', event.target.checked)} /> Tampilkan di halaman publik</label>
            <label className="inline-flex items-center gap-2"><input type="checkbox" className="h-4 w-4 accent-primary" checked={form.is_featured} onChange={(event) => updateField('is_featured', event.target.checked)} /> Tandai sebagai berita unggulan</label>
          </div>
          <label className="block space-y-1.5 text-sm font-medium">Ringkasan<Textarea value={form.summary} onChange={(event) => updateField('summary', event.target.value)} rows={3} placeholder="Ringkasan singkat yang tampil pada daftar berita." /></label>
          <label className="block space-y-1.5 text-sm font-medium">Isi berita<Textarea value={form.content} onChange={(event) => updateField('content', event.target.value)} rows={12} placeholder="Tulis isi berita. Pisahkan paragraf dengan baris kosong." /></label>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3 rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
              <div><p className="text-sm font-semibold">Foto sampul</p><p className="text-xs text-muted-foreground">Unggah foto baru atau gunakan URL media yang sudah tersedia.</p></div>
              <Input value={form.image_url} onChange={(event) => updateField('image_url', event.target.value)} placeholder="https://..." />
              <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverUpload} disabled={busyAction === 'cover' || isSaving} />
              {busyAction === 'cover' && <p className="flex items-center gap-2 text-xs text-primary" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengunggah sampul…</p>}
              {form.image_url && <img src={form.image_url} alt="Pratinjau sampul" className="aspect-video w-full rounded-lg object-cover" />}
            </div>
            <div className="space-y-3 rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
              <div><p className="text-sm font-semibold">Galeri / media pendukung</p><p className="text-xs text-muted-foreground">Pilih satu atau beberapa foto. Urutan mengikuti susunan di bawah.</p></div>
              <Input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleGalleryUpload} disabled={busyAction === 'gallery' || isSaving} />
              {busyAction === 'gallery' && <p className="flex items-center gap-2 text-xs text-primary" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengunggah galeri…</p>}
              <div className="space-y-2">
                {(form.gallery || []).map((media, index) => <div key={media.id || media.url || index} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-slate-200/80 p-2 dark:border-white/10"><img src={media.url} alt="" className="h-14 w-14 rounded object-cover" /><div className="grid gap-2"><Input value={media.caption || ''} onChange={(event) => updateGalleryItem(index, 'caption', event.target.value)} placeholder="Keterangan media" /><Input value={media.alt || ''} onChange={(event) => updateGalleryItem(index, 'alt', event.target.value)} placeholder="Teks alternatif" /></div><Button type="button" variant="ghost" size="icon" title="Hapus media" onClick={() => removeGalleryItem(index)}><X className="h-4 w-4" /></Button></div>)}
                {(form.gallery || []).length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Belum ada media pendukung.</p>}
              </div>
            </div>
          </div>
        </div>}

        <DialogFooter className="gap-2 sm:justify-between">
          <div className="text-xs text-muted-foreground">{form.status === 'published' && form.is_public !== false ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Siap tampil setelah disimpan</span> : <span>Perubahan belum tampil publik</span>}</div>
          <div className="flex gap-2"><Button type="button" variant="outline" onClick={onClose} disabled={isSaving || Boolean(busyAction)}>Batal</Button><Button type="button" onClick={handleSave} disabled={isSaving || Boolean(busyAction)} aria-busy={isSaving}>{isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan…</> : <><Save className="mr-2 h-4 w-4" /> Simpan berita</>}</Button></div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default NewsEditorDialog;

