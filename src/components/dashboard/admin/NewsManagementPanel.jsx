import React, { useEffect, useMemo, useState } from 'react';
import { Archive, CheckCircle2, Edit3, Eye, FileImage, ImagePlus, Loader2, Plus, RefreshCw, Save, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/components/ui/use-toast';
import {
  announceNewsContentUpdate,
  archiveNews,
  deleteNews,
  fetchAdminNews,
  getPublicContentErrorMessage,
  normalizeNewsContent,
  saveNews,
  slugify,
} from '@/lib/publicContentAdapters';
import { getStorageErrorMessage, uploadWebsiteAsset, validateWebsiteAssetFile } from '@/lib/storageAdapters';
import { EMPTY_NEWS_FORM, NEWS_CATEGORIES, NewsPreview, toFormState } from './NewsEditorDialog';

const formatDate = (value) => value ? new Date(value).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : 'Belum dijadwalkan';
const statusLabel = { draft: 'Draft', published: 'Terbit', archived: 'Arsip' };
const statusClass = { draft: 'border-amber-200 bg-amber-50 text-amber-700', published: 'border-emerald-200 bg-emerald-50 text-emerald-700', archived: 'border-slate-200 bg-slate-100 text-slate-600' };
const validateNewsImage = (file) => { validateWebsiteAssetFile(file); if (!file.type || !file.type.startsWith('image/')) throw new Error('Media berita harus berupa JPG, PNG, atau WebP.'); };
const sameNews = (left, right) => String(left?.id || '') === String(right?.id || '');
const NewsManagementPanel = ({ items = [], onItemsChange }) => {
  const [newsItems, setNewsItems] = useState(Array.isArray(items) ? items : []);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_NEWS_FORM });
  const [isPreview, setIsPreview] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [formError, setFormError] = useState('');

  const applyItems = (nextItems) => {
    const normalized = Array.isArray(nextItems) ? nextItems : [];
    setNewsItems(normalized);
    onItemsChange?.(normalized);
  };

  const refreshItems = async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const nextItems = await fetchAdminNews();
      applyItems(nextItems);
    } catch (error) {
      setLoadError(getPublicContentErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    fetchAdminNews()
      .then((nextItems) => {
        if (active) applyItems(nextItems);
      })
      .catch((error) => {
        if (active) setLoadError(getPublicContentErrorMessage(error));
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (Array.isArray(items)) setNewsItems(items);
  }, [items]);

  const orderedItems = useMemo(() => [...newsItems].sort((left, right) => {
    if (Boolean(right.is_featured) !== Boolean(left.is_featured)) return Number(right.is_featured) - Number(left.is_featured);
    const orderDifference = Number(left.display_order || 0) - Number(right.display_order || 0);
    if (orderDifference !== 0) return orderDifference;
    return new Date(right.published_at || right.created_at || 0).getTime() - new Date(left.published_at || left.created_at || 0).getTime();
  }), [newsItems]);

  const openEditor = (item = null) => {
    setForm(toFormState(item));
    setFormError('');
    setIsPreview(false);
    setEditorOpen(true);
  };

  const closeEditor = () => {
    if (isSaving || busyAction) return;
    setEditorOpen(false);
    setIsPreview(false);
  };

  const updateField = (field, value) => {
    setForm((previous) => ({ ...previous, [field]: value }));
    setFormError('');
  };

  const validateForm = () => {
    const title = String(form.title || '').trim();
    const slug = String(form.slug || slugify(title)).trim();
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
        slug: String(form.slug || slugify(form.title)).trim(),
        summary: String(form.summary || '').trim(),
        content: String(form.content || '').trim(),
        gallery: Array.isArray(form.gallery) ? form.gallery : [],
        media: Array.isArray(form.media) ? form.media : [],
      });
      let nextItems = newsItems;
      try {
        nextItems = await fetchAdminNews();
      } catch {
        nextItems = form.id
          ? newsItems.map((item) => sameNews(item, saved) ? saved : item)
          : [saved, ...newsItems];
      }
      applyItems(nextItems);
      announceNewsContentUpdate(saved);
      setEditorOpen(false);
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

  const handleArchive = async (item) => {
    if (!window.confirm('Arsipkan berita ini? Berita tidak akan tampil di halaman publik.')) return;
    setBusyAction('archive-' + item.id);
    try {
      await archiveNews(item.id);
      const nextItems = await fetchAdminNews();
      applyItems(nextItems);
      announceNewsContentUpdate(item);
      toast({ title: 'Berita diarsipkan', description: 'Berita dipindahkan ke arsip.' });
    } catch (error) {
      setLoadError(getPublicContentErrorMessage(error));
    } finally {
      setBusyAction('');
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm('Hapus berita ini secara permanen? Tindakan ini tidak dapat dibatalkan.')) return;
    setBusyAction('delete-' + item.id);
    try {
      await deleteNews(item.id);
      const nextItems = await fetchAdminNews();
      applyItems(nextItems);
      announceNewsContentUpdate(item);
      toast({ title: 'Berita dihapus', description: 'Berita sudah dihapus dari CMS.' });
    } catch (error) {
      setLoadError(getPublicContentErrorMessage(error));
    } finally {
      setBusyAction('');
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
        uploaded.push({
          id: 'upload-' + Date.now() + '-' + index,
          url: asset.publicUrl,
          type: 'image',
          caption: '',
          alt: file.name,
        });
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

  const publishedCount = newsItems.filter((item) => item.status === 'published' && item.is_public !== false).length;
  const draftCount = newsItems.filter((item) => item.status === 'draft').length;
  const archivedCount = newsItems.filter((item) => item.status === 'archived').length;

  return (
    <section className="admin-card space-y-5 p-4 md:p-5" aria-labelledby="news-management-title">
      <div className="flex flex-col gap-4 border-b border-slate-200/70 pb-4 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 id="news-management-title" className="flex items-center gap-2 text-xl font-bold"><FileImage className="h-5 w-5" /> Berita</h3>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Kelola isi, media, status, visibilitas, dan urutan berita dari satu tempat.</p>
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-200">{publishedCount} terbit</span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-200">{draftCount} draft</span>
            <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-1 text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">{archivedCount} arsip</span>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={refreshItems} disabled={isLoading || Boolean(busyAction)}>
            <RefreshCw className="mr-2 h-4 w-4" /> Muat ulang
          </Button>
          <Button onClick={() => openEditor()}>
            <Plus className="mr-2 h-4 w-4" /> Tambah berita
          </Button>
        </div>
      </div>

      {loadError && (
        <div className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200 sm:flex-row sm:items-center sm:justify-between" role="alert">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={refreshItems}>Coba lagi</Button>
        </div>
      )}

      {isLoading && newsItems.length === 0 && (
        <div className="space-y-3" aria-label="Memuat berita" aria-busy="true">
          {[1, 2, 3].map((key) => <div key={key} className="h-20 animate-pulse rounded-xl bg-slate-100 dark:bg-white/5" />)}
        </div>
      )}

      {!isLoading && !loadError && newsItems.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center dark:border-white/15">
          <FileImage className="mx-auto h-9 w-9 text-muted-foreground" />
          <p className="mt-3 font-semibold">Belum ada berita</p>
          <p className="mt-1 text-sm text-muted-foreground">Buat berita pertama, simpan sebagai draft, lalu terbitkan setelah pratinjau.</p>
          <Button className="mt-4" onClick={() => openEditor()}><Plus className="mr-2 h-4 w-4" /> Buat berita</Button>
        </div>
      )}

      {newsItems.length > 0 && (
        <div className="space-y-3">
          {orderedItems.map((item) => {
            const itemBusy = busyAction === 'archive-' + item.id || busyAction === 'delete-' + item.id;
            const visible = item.status === 'published' && item.is_public !== false;
            const galleryCount = Array.isArray(item.gallery) ? item.gallery.length : (Array.isArray(item.media) ? item.media.length : 0);
            return (
              <div key={item.id} className="flex flex-col gap-3 rounded-xl border border-slate-200/80 bg-background p-3 sm:flex-row sm:items-center dark:border-white/10">
                {item.image_url ? <img src={item.image_url} alt="" className="h-20 w-full rounded-lg object-cover sm:h-16 sm:w-28" /> : <div className="flex h-20 w-full items-center justify-center rounded-lg bg-slate-100 text-muted-foreground dark:bg-white/5 sm:h-16 sm:w-28"><FileImage className="h-6 w-6" /></div>}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="truncate font-semibold">{item.title || 'Tanpa judul'}</h4>
                    <span className={'rounded-full border px-2 py-0.5 text-[11px] font-semibold ' + (statusClass[item.status] || statusClass.draft)}>{statusLabel[item.status] || item.status || 'Draft'}</span>
                    {visible ? <span className="text-[11px] font-medium text-emerald-600">Tampil publik</span> : <span className="text-[11px] font-medium text-muted-foreground">Disembunyikan</span>}
                    {item.is_featured && <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600"><Star className="h-3 w-3 fill-current" /> Unggulan</span>}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{item.category || 'Umum'} · {item.author || 'Sekolah'} · urutan {item.display_order || 0} · {galleryCount} media · {formatDate(item.published_at || item.created_at)}</p>
                </div>
                <div className="flex shrink-0 items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openEditor(item)}><Edit3 className="mr-1.5 h-4 w-4" /> Edit</Button>
                  <Button variant="ghost" size="icon" title="Arsipkan berita" onClick={() => handleArchive(item)} disabled={itemBusy || item.status === 'archived'}><Archive className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" title="Hapus permanen" onClick={() => handleDelete(item)} disabled={itemBusy}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={editorOpen} onOpenChange={(open) => (open ? setEditorOpen(true) : closeEditor())}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit berita' : 'Tambah berita'}</DialogTitle>
            <DialogDescription>Isi field berita, atur visibilitas, lalu pratinjau sebelum menyimpan atau menerbitkan.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center justify-between rounded-lg border border-slate-200/80 bg-slate-50 p-1 dark:border-white/10 dark:bg-white/5">
            <span className="px-3 text-xs font-semibold text-muted-foreground">{isPreview ? 'Mode pratinjau' : 'Mode editor'}</span>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsPreview((value) => !value)}>
              {isPreview ? <><Edit3 className="mr-2 h-4 w-4" /> Kembali ke editor</> : <><Eye className="mr-2 h-4 w-4" /> Pratinjau</>}
            </Button>
          </div>

          {isPreview ? (
            <NewsPreview form={form} />
          ) : (
            <div className="space-y-5">
              {formError && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-400/20 dark:bg-red-400/10 dark:text-red-200" role="alert">{formError}</div>}

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-sm font-medium md:col-span-2">
                  Judul berita
                  <Input value={form.title} onChange={(event) => updateField('title', event.target.value)} placeholder="Contoh: Siswa SDN Baturaja Raih Prestasi..." />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Slug
                  <Input value={form.slug} onChange={(event) => updateField('slug', slugify(event.target.value))} placeholder="judul-berita" />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Kategori
                  <Select value={form.category || 'Pengumuman'} onValueChange={(value) => updateField('category', value)}>
                    <SelectTrigger><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                    <SelectContent>{NEWS_CATEGORIES.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Penulis
                  <Input value={form.author} onChange={(event) => updateField('author', event.target.value)} placeholder="Nama penulis atau sekolah" />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Peran penulis
                  <Input value={form.author_role} onChange={(event) => updateField('author_role', event.target.value)} placeholder="Contoh: Humas Sekolah" />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Status
                  <Select value={form.status || 'draft'} onValueChange={(value) => updateField('status', value)}>
                    <SelectTrigger><SelectValue placeholder="Pilih status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="published">Terbit</SelectItem>
                      <SelectItem value="archived">Arsip</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Tanggal publikasi
                  <Input type="datetime-local" value={form.published_at || ''} onChange={(event) => updateField('published_at', event.target.value)} />
                </label>
                <label className="space-y-1.5 text-sm font-medium">
                  Urutan tampil
                  <Input type="number" min="0" step="1" value={form.display_order} onChange={(event) => updateField('display_order', event.target.value)} />
                </label>
              </div>

              <div className="flex flex-wrap gap-5 rounded-xl border border-slate-200/80 p-3 text-sm dark:border-white/10">
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.is_public} onChange={(event) => updateField('is_public', event.target.checked)} />
                  Tampilkan di halaman publik
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.is_featured} onChange={(event) => updateField('is_featured', event.target.checked)} />
                  Tandai sebagai berita unggulan
                </label>
              </div>

              <label className="block space-y-1.5 text-sm font-medium">
                Ringkasan
                <Textarea value={form.summary} onChange={(event) => updateField('summary', event.target.value)} rows={3} placeholder="Ringkasan singkat yang tampil pada daftar berita." />
              </label>
              <label className="block space-y-1.5 text-sm font-medium">
                Isi berita
                <Textarea value={form.content} onChange={(event) => updateField('content', event.target.value)} rows={12} placeholder="Tulis isi berita. Pisahkan paragraf dengan baris kosong." />
              </label>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
                  <div>
                    <p className="text-sm font-semibold">Foto sampul</p>
                    <p className="text-xs text-muted-foreground">Unggah foto baru atau gunakan URL media yang sudah tersedia.</p>
                  </div>
                  <Input value={form.image_url} onChange={(event) => updateField('image_url', event.target.value)} placeholder="https://..." />
                  <Input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverUpload} disabled={busyAction === 'cover' || isSaving} />
                  {busyAction === 'cover' && <p className="flex items-center gap-2 text-xs text-primary" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengunggah sampul…</p>}
                  {form.image_url && <img src={form.image_url} alt="Pratinjau sampul" className="aspect-video w-full rounded-lg object-cover" />}
                </div>

                <div className="space-y-3 rounded-xl border border-slate-200/80 p-3 dark:border-white/10">
                  <div>
                    <p className="text-sm font-semibold">Galeri / media pendukung</p>
                    <p className="text-xs text-muted-foreground">Pilih satu atau beberapa foto. Urutan mengikuti susunan di bawah.</p>
                  </div>
                  <Input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={handleGalleryUpload} disabled={busyAction === 'gallery' || isSaving} />
                  {busyAction === 'gallery' && <p className="flex items-center gap-2 text-xs text-primary" role="status"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Mengunggah galeri…</p>}
                  <div className="space-y-2">
                    {(form.gallery || []).map((media, index) => (
                      <div key={media.id || media.url || index} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-start gap-2 rounded-lg border border-slate-200/80 p-2 dark:border-white/10">
                        <img src={media.url} alt="" className="h-14 w-14 rounded object-cover" />
                        <div className="grid gap-2">
                          <Input value={media.caption || ''} onChange={(event) => updateGalleryItem(index, 'caption', event.target.value)} placeholder="Keterangan media" />
                          <Input value={media.alt || ''} onChange={(event) => updateGalleryItem(index, 'alt', event.target.value)} placeholder="Teks alternatif" />
                        </div>
                        <Button type="button" variant="ghost" size="icon" title="Hapus media" onClick={() => removeGalleryItem(index)}><X className="h-4 w-4" /></Button>
                      </div>
                    ))}
                    {(form.gallery || []).length === 0 && <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">Belum ada media pendukung.</p>}
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:justify-between">
            <div className="text-xs text-muted-foreground">
              {form.status === 'published' && form.is_public !== false ? <span className="inline-flex items-center gap-1 text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" /> Siap tampil setelah disimpan</span> : <span>Perubahan belum tampil publik</span>}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={closeEditor} disabled={isSaving || Boolean(busyAction)}>Batal</Button>
              <Button type="button" onClick={handleSave} disabled={isSaving || Boolean(busyAction)} aria-busy={isSaving}>
                {isSaving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Menyimpan…</> : <><Save className="mr-2 h-4 w-4" /> Simpan berita</>}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default NewsManagementPanel;

