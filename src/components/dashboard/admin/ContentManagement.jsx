import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Edit, Video, Users, BookCopy, MessageSquare, FileText, Library, Building, Mail, Info, Image as ImageIcon, Home, Save, Phone } from 'lucide-react';
import { fetchSantriList, fetchGuruList } from '@/lib/dataMasterAdapters';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ClipboardList, Building2, BookMarked, Award, Sparkles, GraduationCap } from 'lucide-react';
import SchoolIdentitySettings from '@/components/dashboard/admin/SchoolIdentitySettings';
import HomeContentSettings from '@/components/dashboard/admin/HomeContentSettings';
import ProfileContentSettings from '@/components/dashboard/admin/ProfileContentSettings';
import PpdbContentSettings from '@/components/dashboard/admin/PpdbContentSettings';
import PrestasiContentSettings from '@/components/dashboard/admin/PrestasiContentSettings';
import EkskulContentSettings from '@/components/dashboard/admin/EkskulContentSettings';
import ProgramContentSettings from '@/components/dashboard/admin/ProgramContentSettings';
import SchoolInfoSettings from '@/components/dashboard/admin/SchoolInfoSettings';
import ContactContentSettings from '@/components/dashboard/admin/ContactContentSettings';
import GalleryHeroMosaicSettings from '@/components/dashboard/admin/GalleryHeroMosaicSettings';
import { useAuth } from '@/contexts/AuthContext';
import { getSchoolIdentity } from '@/lib/schoolIdentity';
import HafalanDisplay from '@/components/dashboard/shared/HafalanDisplay';
import { createHafalanItem, deactivateHafalanItem, fetchHafalanItems, getAcademicErrorMessage, updateHafalanItem, HAFALAN_SCOPE_PER_KELAS, HAFALAN_SCOPE_PER_JUZ } from '@/lib/academicAdapters';
import { getStorageErrorMessage, uploadWebsiteAsset } from '@/lib/storageAdapters';
import { buildGlobalContentSaveItems } from '@/lib/contentManagementSave';
import { defaultContent, mergeHomepageContent } from '@/components/public/home/homeUtils';
import { DEFAULT_GALLERY_HERO_MOSAIC, GALLERY_HERO_MOSAIC_KEY, normalizeGalleryAlbums, normalizeGalleryHeroMosaic, normalizeGalleryPhotos } from '@/lib/galleryContent';
import {
  archiveAnnouncement,
  archiveNews,
  fetchAdminAnnouncements,
  fetchAdminNews,
  fetchWebsiteContentMap,
  getPublicContentErrorMessage,
  announceWebsiteContentUpdate,
  assertNonEmptyWebsiteContentString,
  saveAnnouncement,
  saveNews,
  saveWebsiteContentItem,
  saveWebsiteContentItems,
  slugify
} from '@/lib/publicContentAdapters';
import NewsManagementPanel from '@/components/dashboard/admin/NewsManagementPanel';
import FeedbackInboxPanel from '@/components/dashboard/admin/FeedbackInboxPanel';

// Enam tahap, dipakai sebagai Kelas 1-6 untuk sekolah dasar.
const KELAS_LEVELS = [1, 2, 3, 4, 5, 6].map(String);
const JUZ_LEVELS = ['Juz 1', 'Juz 2', 'Juz 28', 'Juz 29', 'Juz 30'];

const CONTENT_TAB_GROUPS = [
  {
    id: 'sekolah',
    label: 'Sekolah',
    description: 'Identitas dan informasi dasar yang menjadi rujukan seluruh situs.',
    icon: Building2,
    tabs: [
      { id: 'identitas', label: 'Identitas Sekolah', icon: Building2, superadminOnly: true },
      { id: 'info', label: 'Info Sekolah', icon: Info },
    ],
  },
  {
    id: 'publik',
    label: 'Halaman Publik',
    description: 'Narasi utama yang tampil di beranda dan halaman profil sekolah.',
    icon: Home,
    tabs: [
      { id: 'homepage', label: 'Halaman Depan', icon: Home },
      { id: 'profil', label: 'Halaman Profil', icon: BookMarked },
    ],
  },
  {
    id: 'program',
    label: 'Program & Kegiatan',
    description: 'Program pembelajaran, prestasi, dan kegiatan pengembangan murid.',
    icon: GraduationCap,
    tabs: [
      { id: 'program', label: 'Program', icon: GraduationCap },
      { id: 'prestasi', label: 'Prestasi', icon: Award },
      { id: 'ekskul', label: 'Ekstrakurikuler', icon: Sparkles },
    ],
  },
  {
    id: 'media',
    label: 'Media & Pendaftaran',
    description: 'Aset publik, galeri, dan informasi penerimaan murid baru.',
    icon: ImageIcon,
    tabs: [
      { id: 'media', label: 'Media & Galeri', icon: ImageIcon },
      { id: 'enrollment', label: 'Informasi Pendaftaran', icon: ClipboardList },
    ],
  },
  {
    id: 'komunikasi',
    label: 'Komunikasi',
    description: 'Kelola tampilan halaman Kontak dan pesan yang dikirim pengunjung.',
    icon: Mail,
    tabs: [
      { id: 'kontak', label: 'Halaman Kontak', icon: Phone },
      { id: 'pesan', label: 'Pesan Masuk', icon: Mail },
    ],
  },
  {
    id: 'akademik',
    label: 'Hafalan',
    description: 'Daftar materi hafalan berdasarkan kelas dan juz.',
    icon: BookCopy,
    tabs: [
      { id: 'hafalan', label: 'Hafalan', icon: BookCopy },
    ],
  },
];

const HafalanItemManager = ({
  category,
  programScope = HAFALAN_SCOPE_PER_KELAS,
  title = category,
  levels = KELAS_LEVELS,
  levelPrefix = 'Kelas'
}) => {
  const [items, setItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [targetJilid, setTargetJilid] = useState(String(levels[0]));
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchItems();
  }, [category, programScope]);

  const fetchItems = async () => {
    setIsLoading(true);
    try {
      const data = await fetchHafalanItems(category, programScope);
      setItems(data || []);
    } catch (error) {
      toast({ title: "Gagal memuat item hafalan", description: getAcademicErrorMessage(error), variant: "destructive" });
    }
    setIsLoading(false);
  };

  const handleAddItem = async () => {
    if (!newItemName.trim()) return;
    try {
      await createHafalanItem({
        category,
        programScope,
        itemName: newItemName,
        itemOrder: items.length + 1,
        jilid: targetJilid
      });
      setNewItemName('');
      fetchItems();
      toast({ title: "Berhasil", description: "Item hafalan baru ditambahkan." });
    } catch (error) {
      toast({ title: "Gagal menambah item", description: getAcademicErrorMessage(error), variant: "destructive" });
    }
  };

  const handleDeleteItem = async (id) => {
    if (!window.confirm('Yakin ingin menghapus item ini?')) return;
    try {
      await deactivateHafalanItem(id);
      fetchItems();
      toast({ title: "Berhasil", description: "Item hafalan telah dinonaktifkan." });
    } catch (error) {
      toast({ title: "Gagal menghapus item", description: getAcademicErrorMessage(error), variant: "destructive" });
    }
  };

  const handleItemDrop = async (itemId, newJilid) => {
    // Optimistic update
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, jilid: newJilid } : item));

    try {
        await updateHafalanItem(itemId, { jilid: newJilid });
      toast({ title: "Berhasil", description: `Item dipindahkan ke ${[levelPrefix, newJilid].filter(Boolean).join(' ')}` });
    } catch (error) {
        toast({ title: "Gagal memindahkan item", description: getAcademicErrorMessage(error), variant: "destructive" });
        fetchItems(); // Revert on error
    }
  };

  // Group items by Jilid for display
  const itemsByJilid = Object.fromEntries(levels.map((level, index) => [
    String(level),
    items.filter((item) => {
      const itemLevel = String(item.jilid || '');
      return itemLevel === String(level) || (index === 0 && !itemLevel);
    })
  ]));

  return (
    <section className="space-y-6 rounded-lg border bg-muted/20 p-4 sm:p-6" aria-labelledby={`hafalan-${programScope}-${category}`}>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b pb-4">
          <div>
            <h4 id={`hafalan-${programScope}-${category}`} className="text-xl font-black text-foreground sm:text-2xl">{title}</h4>
            <p className="mt-1 text-sm text-muted-foreground">
              {programScope === HAFALAN_SCOPE_PER_JUZ
                ? 'Hafalan Al-Qur’an per juz, dinilai dengan skala 1–4. Terbuka untuk semua murid.'
                : 'Atur urutan hafalan bertahap berdasarkan kelas 1–6. Terbuka untuk semua murid.'}
            </p>
          </div>
          <div className="flex gap-2 w-full md:w-auto">
            <Select value={targetJilid} onValueChange={setTargetJilid}>
                <SelectTrigger className="w-[120px] bg-background"><SelectValue placeholder={levelPrefix || 'Target'} /></SelectTrigger>
                <SelectContent>
                    {levels.map((level) => (
                      <SelectItem key={level} value={String(level)}>
                        {[levelPrefix, level].filter(Boolean).join(' ')}
                      </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            <Input placeholder="Nama hafalan baru..." value={newItemName} onChange={e => setNewItemName(e.target.value)} className="min-w-[200px] flex-1 bg-background" />
            <Button onClick={handleAddItem}><Plus className="w-4 h-4 mr-2"/> Tambah</Button>
          </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {levels.map(jilid => (
              <HafalanDisplay
                  key={jilid}
                  jilid={jilid}
                  titlePrefix={levelPrefix}
                  items={itemsByJilid[jilid]}
                  isDraggable={true}
                  onItemDrop={handleItemDrop}
                  onDeleteItem={handleDeleteItem}
                  isLoading={isLoading}
              />
          ))}
      </div>

      <p className="text-xs text-muted-foreground text-center pt-2">
          Tarik dan lepas item hafalan untuk memindahkannya ke target lain.
      </p>
    </section>
  );
};

const ContentManagement = () => {
  const { role } = useAuth();
  const isSuperadmin = role === 'superadmin';
  /* Sebagian kunci di bawah TIDAK punya kendali di panel lagi: slideshow
   * (`heroSlides`), latar CTA, kuota, jadwal pembelajaran, keunggulan, FAQ lama,
   * video qiroati, artikel parenting, diskusi wali murid, dan pengaturan model 3D.
   * Semuanya peninggalan desain beranda sebelumnya dan tidak dirender halaman
   * publik mana pun, jadi kendalinya dicabut — pembeli tidak lagi menyimpan
   * sesuatu yang tak mengubah apa pun.
   *
   * Kuncinya sengaja DIBIARKAN di bentuk data ini. Kalau dihapus, "Simpan Semua
   * Perubahan" akan menimpa isi tersimpan pembeli dengan kekosongan; dibiarkan,
   * data lama tetap utuh sampai ada keputusan memakainya lagi. */
  const [content, setContent] = useState({
    ...defaultContent, schoolBuildingPhoto: '', brochures: [], pustaka: [], news: [], announcements: [], qiroatiVideos: [], hafalanVideos: [], waliDiscussions: [], santriOfTheMonth: [], guruOfTheMonth: null, leaderboard: [], parentingArticles: [], galleryAlbums: [], [GALLERY_HERO_MOSAIC_KEY]: { ...DEFAULT_GALLERY_HERO_MOSAIC }, model3dSettings: { autoRotate: false, autoRotateSpeed: 0.34, rotationX: 0, rotationY: 0, rotationZ: 0 }
  });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [modalType, setModalType] = useState('');
  const [formState, setFormState] = useState({});
  const [santriList, setSantriList] = useState([]);
  const [guruList, setGuruList] = useState([]);
  const [activeGroup, setActiveGroup] = useState('publik');
  const [activeSubTabs, setActiveSubTabs] = useState({
    sekolah: isSuperadmin ? 'identitas' : 'info',
    publik: 'homepage',
    program: 'program',
    media: 'media',
    komunikasi: 'kontak',
    akademik: 'hafalan',
  });
  const [assetUploadType, setAssetUploadType] = useState(null);
  const [buildingPhotoPreviewError, setBuildingPhotoPreviewError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveState, setSaveState] = useState('idle');

  useEffect(() => { fetchContent(); fetchSantriAndGuru(); }, []);

  const fetchSantriAndGuru = async () => {
    try {
      const [santriData, guruData] = await Promise.all([
        fetchSantriList({ status: 'Aktif' }),
        fetchGuruList(),
      ]);
      setSantriList(santriData || []);
      setGuruList(guruData || []);
    } catch (error) {
      toast({ title: "Gagal Memuat Data Murid/Guru", description: getPublicContentErrorMessage(error), variant: "destructive" });
    }
  };

  const fetchContent = async () => {
    let newContent = {};
    try {
      newContent = { ...(await fetchWebsiteContentMap({ publicOnly: false })) };
    } catch (error) {
      toast({ title: "Gagal Memuat Konten", description: getPublicContentErrorMessage(error), variant: "destructive" });
      return;
    }
    const arrayKeys = ['heroSlides', 'brochures', 'pustaka', 'facilities', 'qiroatiVideos', 'hafalanVideos', 'waliDiscussions', 'santriOfTheMonth', 'leaderboard', 'parentingArticles', 'galleryPhotos', 'galleryAlbums', 'schedules', 'faqs'];
    arrayKeys.forEach(key => { if (!newContent[key] || !Array.isArray(newContent[key])) newContent[key] = []; });
    if (typeof newContent.schoolBuildingPhoto !== 'string') newContent.schoolBuildingPhoto = '';
    if(!newContent.quotas) newContent.quotas = { pagi: 0, siang: 0, sore: 0, dewasaPagi: 0, dewasaSiang: 0, dewasaMalam: 0 };
    Object.assign(newContent, mergeHomepageContent(newContent));
    newContent.galleryPhotos = normalizeGalleryPhotos(newContent.galleryPhotos);
    newContent.galleryAlbums = normalizeGalleryAlbums(newContent.galleryAlbums);
    newContent[GALLERY_HERO_MOSAIC_KEY] = normalizeGalleryHeroMosaic(newContent[GALLERY_HERO_MOSAIC_KEY]);
    if(!newContent.model3dSettings || typeof newContent.model3dSettings !== 'object' || Array.isArray(newContent.model3dSettings)) {
      newContent.model3dSettings = { autoRotate: false, autoRotateSpeed: 0.34, rotationX: 0, rotationY: 0, rotationZ: 0 };
    }
    try {
      const [news, announcements] = await Promise.all([fetchAdminNews(), fetchAdminAnnouncements()]);
      setContent(prev => ({ ...prev, ...newContent, news, announcements }));
    } catch (contentError) {
      toast({ title: "Gagal Memuat Berita/Pengumuman", description: getPublicContentErrorMessage(contentError), variant: "destructive" });
      setContent(prev => ({ ...prev, ...newContent, news: [], announcements: [] }));
    }
  };

  const handleSaveAll = async () => {
    if (isSaving) return;
    const dataToUpsert = buildGlobalContentSaveItems(content);
    setIsSaving(true);
    setSaveState('saving');
    try {
      await saveWebsiteContentItems(dataToUpsert);
      announceWebsiteContentUpdate(dataToUpsert.map((item) => item.key));
      setSaveState('success');
      toast({ title: "Konten Disimpan!", description: `Semua perubahan telah berhasil disimpan.` });
    } catch (error) {
      setSaveState('error');
      toast({ title: "Gagal Menyimpan!", description: getPublicContentErrorMessage(error), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e, type) => {
    const file = e.target.files[0];
    if (!file) return;
    setAssetUploadType(type);
    let folder = 'general';
    if (['news', 'announcements', 'parentingArticles'].includes(type)) folder = 'article-images';
    else if (type === 'facilities') folder = 'facilities-images';
    else if (['brochures', 'pustaka'].includes(type)) folder = type;
    else if (type === 'logoUrl') folder = 'logos';
    else if (type === 'ctaBackgroundUrl') folder = 'backgrounds';
    else if (type === 'heroSlides') folder = 'hero-slides';
    else if (type === 'galleryPhotos') folder = 'gallery';
    else if (type === 'schoolBuildingPhoto') folder = 'homepage';

    const assetKey = type === 'logoUrl'
      ? 'logo'
      : (type === 'ctaBackgroundUrl'
        ? 'cta-background'
        : (type === 'schoolBuildingPhoto' ? 'school-building' : null));
    let publicUrl = '';
    try {
      const result = await uploadWebsiteAsset({ folder, key: assetKey, file });
      publicUrl = result.publicUrl;
      if (!publicUrl || !String(publicUrl).trim()) {
        throw new Error('Upload berhasil, tetapi URL aset tidak tersedia.');
      }
    } catch (error) {
      toast({ title: "Upload Gagal!", description: getStorageErrorMessage(error), variant: "destructive" });
      setAssetUploadType(null);
      return;
    }

    if (type === 'logoUrl') {
      try {
        const logoUrl = assertNonEmptyWebsiteContentString('logoUrl', publicUrl);
        const saved = await saveWebsiteContentItem({ key: 'logoUrl', content: logoUrl, isPublic: true });
        setContent(prev => ({ ...prev, logoUrl: saved.content || logoUrl }));
        toast({ title: "Logo Disimpan!", description: "Logo berhasil diunggah dan disimpan ke database." });
      } catch (error) {
        toast({ title: "Logo Gagal Disimpan", description: getPublicContentErrorMessage(error), variant: "destructive" });
      }
      setAssetUploadType(null);
      return;
    }
    if (type === 'schoolBuildingPhoto') {
      try {
        const saved = await saveWebsiteContentItem({ key: 'schoolBuildingPhoto', content: publicUrl, isPublic: true });
        const savedUrl = saved?.content || publicUrl;
        setContent(prev => ({ ...prev, schoolBuildingPhoto: savedUrl }));
        setBuildingPhotoPreviewError(false);
        toast({ title: "Foto Header Disimpan!", description: "Foto gedung sekolah akan tampil di header beranda." });
      } catch (error) {
        // Keep the previous URL in state when the content write fails. The
        // uploaded object is harmless, while the current public image remains
        // usable until the database update succeeds.
        toast({ title: "Foto Header Gagal Disimpan", description: getPublicContentErrorMessage(error), variant: "destructive" });
      }
      setAssetUploadType(null);
      return;
    }
    if (type === 'ctaBackgroundUrl') { setContent(prev => ({ ...prev, [type]: publicUrl })); }
    else if (['brochures', 'pustaka'].includes(type)) { const newFile = { id: Date.now(), name: file.name, url: publicUrl }; setContent(prev => ({...prev, [type]: [...(prev[type] || []), newFile]})); }
    else if (type === 'galleryPhotos') { setFormState(prev => ({ ...prev, url: publicUrl })); }
    else { setFormState(prev => ({ ...prev, image_url: publicUrl })); }
    toast({ title: "Upload Berhasil!", description: `${file.name} berhasil diunggah.` });
    setAssetUploadType(null);
  };

  const openModal = (type, item = null) => {
    setModalType(type);
    if (item) {
      setEditingItem(item);
      setFormState(type === 'galleryAlbums'
        ? { ...item, photo_ids: item.photo_ids || item.photoIds || [] }
        : item);
    } else {
      setEditingItem(null);
      setFormState(type === 'galleryAlbums' ? { title: '', description: '', photo_ids: [] } : {});
    }
    setIsModalOpen(true);
  };

  const handleModalSubmit = async () => {
    if (modalType === 'news' || modalType === 'announcements') {
      try {
        if (!formState.slug) setFormState(prev => ({ ...prev, slug: slugify(prev.title) }));
        if (modalType === 'news') await saveNews({ ...formState, slug: formState.slug || slugify(formState.title) });
        else await saveAnnouncement({ ...formState, slug: formState.slug || slugify(formState.title) });
        toast({ title: "Konten Disimpan", description: modalType === 'news' ? "Berita telah diperbarui." : "Pengumuman telah diperbarui." });
        setIsModalOpen(false);
        fetchContent();
      } catch (error) {
        toast({ title: "Gagal Menyimpan Konten", description: getPublicContentErrorMessage(error), variant: "destructive" });
      }
      return;
    }
    if (modalType === 'galleryAlbums') {
      const title = String(formState.title || '').trim();
      const photoIds = [...new Set((formState.photo_ids || formState.photoIds || []).map((id) => String(id).trim()).filter(Boolean))];
      if (!title) {
        toast({ title: 'Nama album wajib diisi', description: 'Masukkan nama album sebelum menyimpan.', variant: 'destructive' });
        return;
      }
      if (photoIds.length === 0) {
        toast({ title: 'Pilih foto terlebih dahulu', description: 'Album harus mengambil setidaknya satu foto dari Galeri Kegiatan.', variant: 'destructive' });
        return;
      }
      const album = {
        ...formState,
        id: editingItem?.id || formState.id || `album-${Date.now()}`,
        title,
        description: String(formState.description || '').trim(),
        photo_ids: photoIds,
      };
      const updatedList = editingItem
        ? content.galleryAlbums.map((item) => item.id === editingItem.id ? album : item)
        : [...(content.galleryAlbums || []), album];
      setContent((prev) => ({ ...prev, galleryAlbums: updatedList }));
      setIsModalOpen(false);
      return;
    }
    let updatedList;
    if (editingItem) updatedList = content[modalType].map(item => item.id === editingItem.id ? formState : item);
    else updatedList = [...(content[modalType] || []), { ...formState, id: Date.now() }];
    setContent(prev => ({ ...prev, [modalType]: updatedList }));
    setIsModalOpen(false);
  };

  const handleDeleteItem = async (type, id) => {
    if (window.confirm('Anda yakin ingin menghapus item ini?')) {
      if (type === 'news' || type === 'announcements') {
        try {
          if (type === 'news') await archiveNews(id);
          else await archiveAnnouncement(id);
          toast({ title: "Konten Dinonaktifkan", description: "Konten tidak lagi tampil di halaman publik." });
          fetchContent();
        } catch (error) {
          toast({ title: "Gagal Menonaktifkan Konten", description: getPublicContentErrorMessage(error), variant: "destructive" });
        }
        return;
      }
      const updatedList = content[type].filter(item => item.id !== id);
      setContent(prev => ({ ...prev, [type]: updatedList }));
    }
  };


  // Identitas website hanya untuk superadmin (pemilik template). Pembeli berperan
  // admin dan tetap bebas mengelola seluruh konten di kelompok lain. Backend juga
  // menolaknya di sisi server, jadi menyembunyikan tab bukan satu-satunya
  // penjagaan — lihat brandKeys di content.go.
  const contentGroups = CONTENT_TAB_GROUPS
    .map((group) => ({
      ...group,
      tabs: group.tabs.filter((tab) => !tab.superadminOnly || isSuperadmin),
    }))
    .filter((group) => group.tabs.length > 0);

  const getActiveSubTab = (group) => activeSubTabs[group.id] || group.tabs[0].id;

  const handleSubTabChange = (groupId, tabId) => {
    setActiveSubTabs((previous) => ({ ...previous, [groupId]: tabId }));
  };

  const renderModalContent = () => {
    if (!modalType) return null;
    const galleryPhotos = Array.isArray(content.galleryPhotos) ? content.galleryPhotos : [];
    const selectedGalleryPhotoIds = new Set((formState.photo_ids || formState.photoIds || []).map((id) => String(id)));
    return (
      <>
        <div className="space-y-4">
          {modalType === 'news' && (<><Input placeholder="Judul" value={formState.title || ''} onChange={e => setFormState(p => ({...p, title: e.target.value, slug: p.slug || slugify(e.target.value)}))} /><Input placeholder="Slug" value={formState.slug || ''} onChange={e => setFormState(p => ({...p, slug: slugify(e.target.value)}))} /><Select value={formState.status || 'draft'} onValueChange={val => setFormState(p => ({...p, status: val}))}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="archived">Nonaktif</SelectItem></SelectContent></Select><Textarea placeholder="Ringkasan" value={formState.summary || ''} onChange={e => setFormState(p => ({...p, summary: e.target.value}))} /><Textarea placeholder="Konten Lengkap" rows={10} value={formState.content || ''} onChange={e => setFormState(p => ({...p, content: e.target.value}))} /><Input placeholder="URL Gambar" value={formState.image_url || ''} onChange={e => setFormState(p => ({...p, image_url: e.target.value}))} /><Input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'news')} /></>)}
          {modalType === 'announcements' && (<><Input placeholder="Judul" value={formState.title || ''} onChange={e => setFormState(p => ({...p, title: e.target.value, slug: p.slug || slugify(e.target.value)}))} /><Input placeholder="Slug" value={formState.slug || ''} onChange={e => setFormState(p => ({...p, slug: slugify(e.target.value)}))} /><Select value={formState.status || 'draft'} onValueChange={val => setFormState(p => ({...p, status: val}))}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="published">Published</SelectItem><SelectItem value="archived">Nonaktif</SelectItem></SelectContent></Select><Select value={formState.priority || 'normal'} onValueChange={val => setFormState(p => ({...p, priority: val}))}><SelectTrigger><SelectValue placeholder="Prioritas" /></SelectTrigger><SelectContent><SelectItem value="low">Rendah</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="high">Tinggi</SelectItem></SelectContent></Select><Input type="date" value={formState.valid_until || ''} onChange={e => setFormState(p => ({...p, valid_until: e.target.value}))} /><Textarea placeholder="Ringkasan" value={formState.summary || ''} onChange={e => setFormState(p => ({...p, summary: e.target.value}))} /><Textarea placeholder="Konten" rows={8} value={formState.content || ''} onChange={e => setFormState(p => ({...p, content: e.target.value}))} /><Input placeholder="URL Gambar" value={formState.image_url || ''} onChange={e => setFormState(p => ({...p, image_url: e.target.value}))} /><Input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'announcements')} /></>)}
          {modalType === 'facilities' && (<><Input placeholder="Nama Fasilitas" value={formState.name || ''} onChange={e => setFormState(p => ({...p, name: e.target.value}))} /><div className="grid grid-cols-2 gap-2"><Input placeholder="Kategori, mis. Belajar" value={formState.kategori || ''} onChange={e => setFormState(p => ({...p, kategori: e.target.value}))} /><Input placeholder="Luas, mis. 96 m²" value={formState.luas || ''} onChange={e => setFormState(p => ({...p, luas: e.target.value}))} /></div><Input placeholder="Ringkasan singkat (tampil di kartu)" value={formState.ringkas || ''} onChange={e => setFormState(p => ({...p, ringkas: e.target.value}))} /><Textarea placeholder="Deskripsi lengkap" value={formState.description || ''} onChange={e => setFormState(p => ({...p, description: e.target.value}))} /><Input placeholder="URL Gambar" value={formState.image_url || ''} onChange={e => setFormState(p => ({...p, image_url: e.target.value}))} /></>)}
          {modalType === 'hafalanVideos' && (<><Input placeholder="Judul Video" value={formState.title || ''} onChange={e => setFormState(p => ({...p, title: e.target.value}))} /><Input placeholder="URL Embed Video Youtube" value={formState.url || ''} onChange={e => setFormState(p => ({...p, url: e.target.value}))} />{modalType === 'hafalanVideos' && (<div className="space-y-2"><Textarea placeholder='Google Drive Embed Code' value={formState.google_drive_embed || ''} onChange={e => setFormState(p => ({...p, google_drive_embed: e.target.value}))} className="font-mono text-xs" rows={3}/><p className="text-[10px] text-muted-foreground">Isi salah satu: YouTube URL atau Google Drive Embed.</p></div>)}{modalType === 'hafalanVideos' && (<Select value={formState.jilid} onValueChange={val => setFormState(p => ({...p, jilid: val}))}><SelectTrigger><SelectValue placeholder="Pilih Jilid" /></SelectTrigger><SelectContent>{['Jilid 1', 'Jilid 2', 'Jilid 3', 'Jilid 4', 'Jilid 5', 'Jilid 6', 'Lainnya'].map(j => <SelectItem key={j} value={j}>{j}</SelectItem>)}</SelectContent></Select>)}</>)}
          {modalType === 'galleryPhotos' && (<><Input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'galleryPhotos')} /><Input placeholder="Judul Foto" value={formState.caption || ''} onChange={e => setFormState(p => ({...p, caption: e.target.value}))} /><Select value={formState.kategori || 'Belajar'} onValueChange={val => setFormState(p => ({...p, kategori: val}))}><SelectTrigger><SelectValue placeholder="Kategori" /></SelectTrigger><SelectContent>{['Belajar', 'Ekstrakurikuler', 'Acara', 'Fasilitas', 'Prestasi'].map(k => <SelectItem key={k} value={k}>{k}</SelectItem>)}</SelectContent></Select><Textarea placeholder="Keterangan singkat (opsional)" value={formState.keterangan || ''} onChange={e => setFormState(p => ({...p, keterangan: e.target.value}))} /><Input placeholder="Tanggal, mis. Agustus 2025 (opsional)" value={formState.tanggal || ''} onChange={e => setFormState(p => ({...p, tanggal: e.target.value}))} />{formState.url && <img src={formState.url} alt="Preview" className="w-full h-40 object-cover rounded-md mt-2" />}</>)}
          {modalType === 'galleryAlbums' && (
            <>
              <Input placeholder="Nama Album" value={formState.title || ''} onChange={e => setFormState(p => ({ ...p, title: e.target.value }))} />
              <Textarea placeholder="Deskripsi singkat (opsional)" value={formState.description || ''} onChange={e => setFormState(p => ({ ...p, description: e.target.value }))} />
              <div className="space-y-2">
                <div>
                  <p className="text-sm font-semibold">Pilih foto dari Galeri Kegiatan</p>
                  <p className="text-xs text-muted-foreground">Album memakai foto yang sudah tersedia. Tidak perlu mengunggah ulang.</p>
                </div>
                {galleryPhotos.length > 0 ? (
                  <div className="grid max-h-72 gap-2 overflow-y-auto rounded-lg border p-2 sm:grid-cols-2">
                    {galleryPhotos.map((photo) => {
                      const photoId = String(photo.id);
                      const photoUrl = photo.url || photo.image_url || '';
                      return (
                        <label key={photoId} className="flex cursor-pointer items-center gap-3 rounded-md border bg-background p-2 transition-colors hover:bg-muted/60">
                          <input
                            type="checkbox"
                            checked={selectedGalleryPhotoIds.has(photoId)}
                            onChange={(event) => setFormState((previous) => {
                              const current = new Set((previous.photo_ids || previous.photoIds || []).map((id) => String(id)));
                              if (event.target.checked) current.add(photoId);
                              else current.delete(photoId);
                              return { ...previous, photo_ids: [...current] };
                            })}
                            className="h-4 w-4 accent-primary"
                          />
                          {photoUrl ? <img src={photoUrl} alt="" className="h-12 w-16 shrink-0 rounded object-cover" /> : <div className="flex h-12 w-16 shrink-0 items-center justify-center rounded bg-muted text-[10px] text-muted-foreground">Tanpa foto</div>}
                          <span className="min-w-0 truncate text-sm">{photo.caption || photo.name || 'Foto tanpa judul'}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">Belum ada foto pada Galeri Kegiatan.</p>
                )}
                <p className="text-xs text-muted-foreground" role="status">{selectedGalleryPhotoIds.size} foto dipilih</p>
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end mt-4"><Button onClick={handleModalSubmit}>Simpan</Button></div>
      </>
    );
  };

  const ContentSection = ({ title, modalType, data, icon, renderItem }) => (
    <div className="admin-card p-4">
      <div className="flex justify-between items-center mb-4"><h3 className="font-bold text-xl flex items-center gap-2">{icon} {title}</h3><Button onClick={() => openModal(modalType)}><Plus className="w-4 h-4 mr-2" />Tambah</Button></div>
      <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
        {data.map(item => (<div key={item.id} className="flex justify-between items-center p-2 border rounded-lg bg-background">{renderItem(item)}<div className="flex-shrink-0"><Button variant="ghost" size="icon" onClick={() => openModal(modalType, item)}><Edit className="w-4 h-4" /></Button><Button variant="ghost" size="icon" onClick={() => handleDeleteItem(modalType, item.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></div></div>))}
      </div>
    </div>
  );

  const renderContentPanel = (tabId) => {
    switch (tabId) {
      case 'identitas':
        return (
          <>
            <SchoolIdentitySettings />

            {/* Logo ada di sini, bukan di tab Halaman Depan. `logoUrl` termasuk
                brandKeys di content.go, jadi hanya superadmin yang boleh
                menyimpannya — kalau kendalinya tampil untuk pembeli, ia akan
                mengunggah logo lalu ditolak server tanpa tahu sebabnya. */}
            <div className="admin-card p-4">
              <h3 className="font-bold text-xl mb-1">Logo Website</h3>
              <p className="text-xs text-muted-foreground mb-4">Dipakai di navigasi situs dan kuitansi pembayaran.</p>
              <Input type="file" accept="image/*" onChange={(e) => handleFileUpload(e, 'logoUrl')} />
              {content.logoUrl && <img src={content.logoUrl} alt="Pratinjau logo" className="w-24 h-24 mt-2 bg-gray-200 p-2 rounded-md" />}
            </div>
          </>
        );
      case 'info':
        return <SchoolInfoSettings />;
      case 'homepage':
        return <HomeContentSettings />;
      case 'profil':
        return <ProfileContentSettings />;
      case 'prestasi':
        return <PrestasiContentSettings />;
      case 'ekskul':
        return <EkskulContentSettings />;
      case 'program':
        return <ProgramContentSettings />;
      case 'media':
        return (
          <>
            <div className="admin-card p-4 space-y-4 md:col-span-2">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-bold text-xl flex items-center gap-2"><Building2 /> Foto Gedung Header Beranda</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Kelola foto yang tampil pada area utama header halaman beranda.</p>
                </div>
                <span className="rounded-full border border-slate-200/80 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">Opsional</span>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] md:items-center">
                <div className="aspect-video overflow-hidden rounded-xl border border-slate-200/80 bg-muted/30 dark:border-white/10">
                  {content.schoolBuildingPhoto && !buildingPhotoPreviewError ? (
                    <img
                      src={content.schoolBuildingPhoto}
                      alt="Pratinjau foto gedung sekolah"
                      className="h-full w-full object-cover"
                      onError={() => setBuildingPhotoPreviewError(true)}
                    />
                  ) : (
                    <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-muted-foreground">
                      <Building2 className="h-8 w-8" aria-hidden="true" />
                      <span>{content.schoolBuildingPhoto ? 'Pratinjau tidak dapat dimuat.' : 'Belum ada foto. Header memakai fallback bawaan.'}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  <label className="block text-sm font-semibold" htmlFor="school-building-photo">Unggah atau ganti foto</label>
                  <Input
                    id="school-building-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => handleFileUpload(e, 'schoolBuildingPhoto')}
                    disabled={assetUploadType === 'schoolBuildingPhoto'}
                  />
                  <p className="text-xs text-muted-foreground">Format JPG, PNG, atau WebP. Foto lama tetap dipakai jika upload atau penyimpanan gagal.</p>
                  {assetUploadType === 'schoolBuildingPhoto' && <p className="text-sm font-medium text-primary" role="status">Mengunggah dan menyimpan foto…</p>}
                </div>
              </div>
            </div>
            <GalleryHeroMosaicSettings
              photos={content.galleryPhotos}
              value={content.galleryHeroMosaic}
              saveState={saveState}
              onChange={(galleryHeroMosaic) => {
                setSaveState('idle');
                setContent((previous) => ({ ...previous, galleryHeroMosaic }));
              }}
            />
            <div className="col-span-full"><ContentSection title="Galeri Kegiatan" modalType="galleryPhotos" data={content.galleryPhotos} icon={<ImageIcon />} renderItem={item => <div className="flex items-center gap-2"><img src={item.url} alt="" className="w-12 h-12 object-cover rounded-md" /><p className="truncate">{item.caption}</p></div>} /></div>
            <div className="col-span-full"><ContentSection title="Album" modalType="galleryAlbums" data={content.galleryAlbums} icon={<BookMarked />} renderItem={item => <div className="min-w-0"><p className="truncate font-medium">{item.title || item.name}</p><p className="text-xs text-muted-foreground">{(item.photo_ids || item.photoIds || []).length} foto dari Galeri Kegiatan</p></div>} /></div>
            <div className="admin-card p-4 space-y-4"><h3 className="font-bold text-xl flex items-center gap-2"><FileText /> Brosur Pendaftaran</h3><Input type="file" accept="image/*,application/pdf" onChange={(e) => handleFileUpload(e, 'brochures')} /><div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">{content.brochures.map(file => (<div key={file.id} className="flex justify-between items-center p-2 border rounded-lg bg-background"><span>{file.name}</span><Button variant="ghost" size="icon" onClick={() => handleDeleteItem('brochures', file.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></div>))}</div></div>
            <div className="admin-card p-4 space-y-4"><h3 className="font-bold text-xl flex items-center gap-2"><Library /> Pustaka Digital</h3><Input type="file" accept="image/*,application/pdf" onChange={(e) => handleFileUpload(e, 'pustaka')} /><div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">{content.pustaka.map(file => (<div key={file.id} className="flex justify-between items-center p-2 border rounded-lg bg-background"><span>{file.name}</span><Button variant="ghost" size="icon" onClick={() => handleDeleteItem('pustaka', file.id)}><Trash2 className="w-4 h-4 text-destructive" /></Button></div>))}</div></div>
            <NewsManagementPanel items={content.news} onItemsChange={(news) => setContent((previous) => ({ ...previous, news }))} />
            <ContentSection title="Pengumuman" modalType="announcements" data={content.announcements} icon={<MessageSquare />} renderItem={item => <p className="truncate">{item.title}</p>} />
            <ContentSection title="Video Hafalan" modalType="hafalanVideos" data={content.hafalanVideos} icon={<Video />} renderItem={item => <p className="truncate">{item.title}</p>} />
            <ContentSection title="Fasilitas" modalType="facilities" data={content.facilities} icon={<Building />} renderItem={item => <p className="truncate">{item.name}</p>} />
          </>
        );
      case 'enrollment':
        return <PpdbContentSettings />;
      case 'kontak':
        return <ContactContentSettings />;
      case 'pesan':
        return <FeedbackInboxPanel />;
      case 'hafalan':
        return (
          <Tabs defaultValue="per-kelas" className="space-y-5">
            <TabsList className="h-auto w-full justify-start overflow-x-auto rounded-lg bg-muted p-1 sm:w-auto">
              <TabsTrigger value="per-kelas" className="min-w-[150px]">Hafalan per Kelas</TabsTrigger>
              <TabsTrigger value="per-juz" className="min-w-[150px]">Hafalan per Juz</TabsTrigger>
            </TabsList>
            <TabsContent value="per-kelas" className="space-y-6">
              <HafalanItemManager category="Doa" programScope={HAFALAN_SCOPE_PER_KELAS} />
              <HafalanItemManager category="Sholat" programScope={HAFALAN_SCOPE_PER_KELAS} />
              <HafalanItemManager category="Surat" programScope={HAFALAN_SCOPE_PER_KELAS} />
            </TabsContent>
            <TabsContent value="per-juz">
              <HafalanItemManager
                category="Tahfizh"
                programScope={HAFALAN_SCOPE_PER_JUZ}
                title="Hafalan Al-Qur'an per Juz"
                levels={JUZ_LEVELS}
                levelPrefix=""
              />
            </TabsContent>
          </Tabs>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="admin-panel-header">
        <div className="flex items-center gap-3">
          <div className="admin-panel-header-icon">
            <FileText />
          </div>
          <div className="admin-panel-header-text">
            <h2>Manajemen Konten Website</h2>
            <p>Kelola konten yang tampil di halaman publik {getSchoolIdentity().shortName}.</p>
          </div>
        </div>
        <div className="admin-panel-header-actions">
          <button onClick={handleSaveAll} className="admin-panel-primary-btn" disabled={isSaving} aria-busy={isSaving}>
            <Save className="w-4 h-4" /> {isSaving ? 'Menyimpan…' : 'Simpan Semua Perubahan'}
          </button>
        </div>
      </div>

      <Tabs value={activeGroup} onValueChange={setActiveGroup} className="w-full">
        <TabsList aria-label="Kelompok konten website" className="w-full justify-center gap-1 p-1">
          {contentGroups.map((group) => {
            const GroupIcon = group.icon;
            return (
              <TabsTrigger key={group.id} value={group.id} className="min-w-[7.75rem] shrink-0 px-3 py-2 sm:min-w-0">
                <GroupIcon className="h-4 w-4" aria-hidden="true" />
                <span>{group.label}</span>
                <span className="rounded-full bg-slate-200/70 px-1.5 text-[10px] font-bold text-slate-500 dark:bg-white/10 dark:text-white/70" aria-label={`${group.tabs.length} bagian`}>
                  {group.tabs.length}
                </span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        {contentGroups.map((group) => {
          const currentSubTab = getActiveSubTab(group);
          const GroupIcon = group.icon;
          return (
            <TabsContent key={group.id} value={group.id} className="mt-5 space-y-5 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex flex-col gap-3 border-b border-slate-200/70 pb-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-blue-50 p-2 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300">
                    <GroupIcon className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{group.label}</h3>
                    <p className="max-w-2xl text-sm text-muted-foreground">{group.description}</p>
                  </div>
                </div>
                <span className="w-fit rounded-full border border-slate-200/80 bg-white/60 px-3 py-1 text-xs font-semibold text-slate-500 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
                  {group.tabs.length} {group.tabs.length === 1 ? 'bagian' : 'bagian terkait'}
                </span>
              </div>

              {group.tabs.length === 1 ? (
                <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  {renderContentPanel(group.tabs[0].id)}
                </section>
              ) : (
                <Tabs value={currentSubTab} onValueChange={(value) => handleSubTabChange(group.id, value)} className="space-y-5">
                  <TabsList aria-label={`Bagian ${group.label}`} className="w-full flex-nowrap justify-start overflow-x-auto rounded-xl bg-muted/60 p-1 sm:w-auto sm:flex-wrap">
                    {group.tabs.map((tab) => {
                      const TabIcon = tab.icon;
                      return (
                        <TabsTrigger key={tab.id} value={tab.id} className="shrink-0 px-3 py-2 text-xs sm:text-sm">
                          <TabIcon className="h-4 w-4" aria-hidden="true" />
                          {tab.label}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                  {group.tabs.map((tab) => (
                    <TabsContent key={tab.id} value={tab.id} className={`${tab.id === 'media' ? 'grid gap-6 md:grid-cols-2' : 'space-y-6'} animate-in fade-in slide-in-from-bottom-2`}>
                      {renderContentPanel(tab.id)}
                    </TabsContent>
                  ))}
                </Tabs>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}><DialogContent className="max-w-4xl"><DialogHeader><DialogTitle>{editingItem ? 'Edit' : 'Tambah'} {modalType.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}</DialogTitle><DialogDescription>Pastikan untuk menyimpan semua perubahan setelah selesai mengedit.</DialogDescription></DialogHeader>{renderModalContent()}</DialogContent></Dialog>
    </div>
  );
};

export default ContentManagement;
