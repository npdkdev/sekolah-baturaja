
import React, { lazy, Suspense, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import ConfirmationDialog from '@/components/ui/confirmation-dialog';
import SantriDetailModal from '@/components/dashboard/shared/SantriDetailModal';
import MmqSection from '@/components/dashboard/guru/MmqSection';
import JadwalSaya from '@/components/dashboard/shared/JadwalSaya';
import GuruAttendanceRecap from '@/components/dashboard/admin/GuruAttendanceRecap';
import AttendanceDetailsModal from '@/components/dashboard/shared/AttendanceDetailsModal';
import ModulNilai from '@/components/dashboard/shared/ModulNilai';
import ModulKontenKelas from '@/components/dashboard/shared/ModulKontenKelas';
import ModulKomunikasiWali from '@/components/dashboard/shared/ModulKomunikasiWali';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AttendanceStatusIcon from '@/components/dashboard/shared/AttendanceStatusIcon';
import { fetchGuruDetail, updateGuru, updateSantriJilid } from '@/lib/dataMasterAdapters';
import { fetchAttendance } from '@/lib/attendanceAdapters';
import { Mic, Check, Send, Trash2, Edit, Upload, Users, CheckCircle, Bell, X, MessageSquare as MessageSquareWarning, RefreshCw, BookText, ChevronUp, ChevronDown, Eye, EyeOff, Gamepad2, StickyNote, CalendarCheck, Sparkles, Star, Shuffle, UserCheck, AlertCircle, Cake, Loader2, PlusCircle, PlayCircle, CheckCircle2, ArrowRightLeft } from 'lucide-react';
import JilidChangeModal from '@/components/dashboard/admin/JilidChangeModal';
import { validatePassword, cn } from '@/lib/utils';
import BirthdayGreeting from '@/components/BirthdayGreeting';
import BirthdayNotificationModal from '@/components/dashboard/shared/BirthdayNotificationModal';
import HafalanDisplay from '@/components/dashboard/shared/HafalanDisplay';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildSessionStartTimestamp, calculateTimeDifference, resolveAttendanceRecordStatus } from '@/utils/AttendanceStatusLogic';
import {
  buildHafalanScoreMap,
  DEVELOPMENT_SCORE_OPTIONS,
  createManualMurojaahSubmission,
  deleteMurojaahSubmission,
  fetchClassesWithActiveSantriForTeacher,
  fetchHafalanItems,
  fetchHafalanProgress,
  fetchMurojaahSubmissions,
  getHafalanScopeForCategory,
  getAcademicErrorMessage,
  HAFALAN_SCOPE_PER_KELAS,
  HAFALAN_SCOPE_PER_JUZ,
  JUZ_TAHFIZH_TARGETS,
  updateMurojaahReview,
  upsertHafalanProgress
} from '@/lib/academicAdapters';
import { deleteAvatar, getStorageErrorMessage, resolveAvatarUrl, uploadAvatar } from '@/lib/storageAdapters';
import { getBirthdaysThisMonth } from '@/lib/birthdayUtils';
import AvatarPreviewDialog from '@/components/dashboard/shared/AvatarPreviewDialog';
import StudentTransferModal from '@/components/dashboard/guru/StudentTransferModal';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme } from '@/contexts/ThemeContext';
import { getTingkatLevels } from '@/lib/tahfizhLevels';
import { labelStafRole } from '@/lib/staf';

const ProfileConstellationScene = lazy(() => import('@/components/dashboard/santri/SantriLevelScene'));

const jilidOptions = getTingkatLevels();

const getSessionStartTimestamp = (dateStr, sesiName) => buildSessionStartTimestamp(dateStr, sesiName);

const EditGuruProfileModal = ({ isOpen, onOpenChange, guruData, onProfileUpdate, themeColor }) => {
    const [formData, setFormData] = useState(guruData);
    const { updateUserPassword } = useAuth();
    const photoInputRef = useRef(null);
    const [isUploading, setIsUploading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
      setFormData({ ...guruData, password: '' });
      setShowPassword(false);
    }, [guruData, isOpen]);
    const handleInputChange = (e) => { const { id, value } = e.target; setFormData(prev => ({...prev, [id]: value })); };
    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) { toast({ title: "Format Salah", description: "Hanya file JPG, PNG, atau WebP yang diperbolehkan.", variant: "destructive" }); return; }
        setIsUploading(true);
        try {
          const { path, signedUrl } = await uploadAvatar({ ownerType: 'guru', ownerId: formData.id, file });
          const finalUrl = signedUrl || formData.foto_url || '';
          await updateGuru(formData.id, { avatar_path: path, foto_url: null });
          setFormData(prev => ({...prev, foto_url: finalUrl, avatar_path: path }));
          toast({ title: "Foto Berhasil Diupload", description: "Foto profil tersimpan di Storage dan tetap tampil setelah refresh." });
          onProfileUpdate();
        } catch (error) { toast({ title: 'Upload Gagal', description: getStorageErrorMessage(error), variant: 'destructive' }); } finally { setIsUploading(false); e.target.value = ''; }
    };
    const handleDeletePhoto = async () => {
        setIsUploading(true);
        try {
          await deleteAvatar({ ownerType: 'guru', ownerId: formData.id });
          await updateGuru(formData.id, { avatar_path: null, foto_url: null });
          setFormData(prev => ({ ...prev, foto_url: '', avatar_path: null }));
          toast({ title: "Foto Dihapus", description: "Foto profil Anda telah dihapus dari Storage." });
          onProfileUpdate();
        } catch (error) {
          toast({ title: 'Hapus Foto Gagal', description: getStorageErrorMessage(error), variant: 'destructive' });
        } finally {
          setIsUploading(false);
        }
    };
    const triggerPhotoUpload = () => photoInputRef.current?.click();
    const handleSubmit = async (e) => {
        e.preventDefault();
        const { id, password, ...updateData } = formData;
        if (updateData.avatar_path) updateData.foto_url = null;
        let passwordUpdated = true;
        if (password) {
            const passwordError = validatePassword(password);
            if (passwordError) { toast({ title: "Validasi Password Gagal", description: passwordError, variant: "destructive" }); return; }
            passwordUpdated = await updateUserPassword(password);
        }
        if(!passwordUpdated) { toast({ title: "Gagal Ganti Password", variant: "destructive"}); return; }
        try {
            await updateGuru(id, updateData);
            toast({ title: "Berhasil!", description: "Profil Anda telah diperbarui."});
            onProfileUpdate();
            onOpenChange(false);
        } catch (error) {
            toast({ title: "Gagal Memperbarui Profil", description: error.message, variant: "destructive"});
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader><DialogTitle className={cn("text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r", themeColor)}>Edit Profil Guru</DialogTitle><DialogDescription>Perbarui data diri Anda.</DialogDescription></DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-6 pt-4">
                    <div className={cn("flex flex-col sm:flex-row items-center gap-6 p-6 rounded-2xl border-2 border-dashed bg-secondary/10", "border-primary/30")}>
                        <div className="relative group cursor-pointer" onClick={triggerPhotoUpload}>
                            <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />
                            <Avatar className={cn("w-28 h-28 border-4 border-white shadow-lg transition-transform group-hover:scale-105 group-hover:ring-4 group-hover:ring-offset-2 group-hover:ring-primary/50", isUploading ? "opacity-50" : "")}>
                                <AvatarImage src={formData.foto_url} /><AvatarFallback><Upload /></AvatarFallback>
                            </Avatar>
                            {isUploading && <div className="absolute inset-0 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>}
                            <div className="absolute -bottom-2 -right-2 bg-white p-1 rounded-full shadow-md transition-transform group-hover:scale-110"><Upload className="w-5 h-5 text-primary"/></div>
                        </div>
                        <div className="w-full space-y-2"><label className="text-sm font-semibold">URL Foto Profil</label><div className="flex flex-wrap gap-2"><Input id="foto_url" value={formData.foto_url} onChange={handleInputChange} placeholder="https://..." className="bg-background" /><Button type="button" size="sm" variant="outline" onClick={triggerPhotoUpload} disabled={isUploading}>{isUploading ? "Mengompres..." : "Pilih File"}</Button><Button type="button" size="sm" variant="outline" onClick={handleDeletePhoto} disabled={isUploading || !formData.foto_url}>Hapus</Button></div><p className="text-xs text-muted-foreground">JPG, PNG, atau WebP hingga 12 MB akan dikompres otomatis menjadi WebP.</p></div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground" htmlFor="nama">Nama Lengkap</label><Input id="nama" type="text" value={formData.nama || ''} onChange={handleInputChange} required className="border-border focus:ring-2" /></div>
                        <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground" htmlFor="jabatan">Jabatan</label><Input id="jabatan" type="text" value={formData.jabatan || ''} onChange={handleInputChange} required /></div>
                        <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground" htmlFor="email">Username (Email)</label><Input id="email" type="text" value={formData.email || ''} onChange={handleInputChange} required /></div>
                        <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground" htmlFor="no_hp">No. HP</label><Input id="no_hp" type="tel" value={formData.no_hp || ''} onChange={handleInputChange} required /></div>
                        <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground" htmlFor="tanggal_lahir">Tanggal Lahir</label><Input id="tanggal_lahir" type="date" value={formData.tanggal_lahir || ''} onChange={handleInputChange} /></div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-muted-foreground" htmlFor="password">Password Baru</label>
                          <div className="relative">
                            <Input id="password" type={showPassword ? 'text' : 'password'} value={formData.password || ''} placeholder="Isi jika ingin ganti" onChange={handleInputChange} className="pr-11" />
                            <button type="button" onClick={() => setShowPassword((visible) => !visible)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" aria-label={showPassword ? 'Sembunyikan password baru' : 'Tampilkan password baru'}>
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <p className="text-xs text-muted-foreground">Toggle hanya menampilkan password baru yang sedang Anda ketik.</p>
                        </div>
                    </div>
                    <div className="space-y-1.5"><label className="text-sm font-medium text-muted-foreground" htmlFor="alamat">Alamat</label><Textarea id="alamat" value={formData.alamat || ''} onChange={handleInputChange} required className="min-h-[80px]" /></div>
                    <DialogFooter><Button type="submit" className={cn("text-white shadow-lg border-0 bg-gradient-to-r", themeColor)}>Simpan Perubahan</Button></DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
};

const GuruDashboard = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [guruData, setGuruData] = useState(null);
  const [isMmqOpen, setIsMmqOpen] = useState(false);
  const [isEditProfileOpen, setIsEditProfileOpen] = useState(false);
  const [isRecapOpen, setIsRecapOpen] = useState(false);
  const [myClasses, setMyClasses] = useState([]);
  const [dailyAttendance, setDailyAttendance] = useState([]);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [isHafalanOpen, setIsHafalanOpen] = useState(false);
  const [isMurojaahOpen, setIsMurojaahOpen] = useState(false);
  const [selectedSantri, setSelectedSantri] = useState(null);
  const [previewAvatar, setPreviewAvatar] = useState(null);
  const [isOwnAvatarPreviewOpen, setIsOwnAvatarPreviewOpen] = useState(false);
  const [selectedHafalan, setSelectedHafalan] = useState({ category: '', programScope: HAFALAN_SCOPE_PER_KELAS, items: [] });
  const [murojaahSubmissions, setMurojaahSubmissions] = useState([]);
  const [currentSubmission, setCurrentSubmission] = useState(null);
  const [feedback, setFeedback] = useState('');
  const [hafalanProgress, setHafalanProgress] = useState({});
  const [hafalanItems, setHafalanItems] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, title: '', description: '', onConfirm: () => {} });
  const [isBirthdayModalOpen, setIsBirthdayModalOpen] = useState(false);
  const [isJilidModalOpen, setIsJilidModalOpen] = useState(false);
  const [jilidChangeData, setJilidChangeData] = useState(null);
  const [transferSantri, setTransferSantri] = useState(null);

  // Modals for Attendance
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [attendanceDetails, setAttendanceDetails] = useState(null);

  // Manual Murojaah States
  const [isManualMurojaahActive, setIsManualMurojaahActive] = useState(false);
  const [manualMurojaahForm, setManualMurojaahForm] = useState({ santri_id: '', category: 'Surat', item_name: '', feedback: '' });
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  const fetchGuruData = useCallback(async () => {
    if (user?.id) {
        setIsLoading(true);
        const guru = await fetchGuruDetail(user.id).catch(() => null);
        if(guru) {
            const foto_url = await resolveAvatarUrl({
                ownerType: 'guru',
                ownerId: guru.id,
                avatarPath: guru.avatar_path,
                fallbackUrl: guru.foto_url,
            });
            setGuruData({ ...guru, foto_url });
            const todayStr = new Date().toLocaleDateString('en-CA');

            const [hafalanItemsData, progressData, submissionsData, classList] = await Promise.all([
                fetchHafalanItems(),
                fetchHafalanProgress(),
                fetchMurojaahSubmissions(),
                fetchClassesWithActiveSantriForTeacher(guru.id)
            ]);

            const classListWithAvatars = await Promise.all(classList.map(async (kelas) => ({
                ...kelas,
                santri: await Promise.all((kelas.santri || []).map(async (santri) => {
                    try {
                        const resolvedAvatar = await resolveAvatarUrl({
                            ownerType: 'santri',
                            ownerId: santri.id,
                            avatarPath: santri.avatar_path,
                            fallbackUrl: santri.foto_url,
                        });
                        return { ...santri, foto_url: resolvedAvatar || santri.foto_url || '' };
                    } catch {
                        return santri;
                    }
                }))
            })));

            setMyClasses(classListWithAvatars);

            if (classList.length > 0) {
                const classIds = classList.map(c => c.id);
                // Fetch attendance records specifically for the guru's classes
                const attendanceRes = await fetchAttendance({
                    class_ids: classIds,
                    date: todayStr,
                    limit: 500,
                }).catch(() => null);

                if (attendanceRes) {
                    setDailyAttendance(attendanceRes);
                }

            }

            setHafalanItems(hafalanItemsData || []);
            setHafalanProgress(buildHafalanScoreMap(progressData || []));
            setMurojaahSubmissions(submissionsData || []);

        }
        setIsLoading(false);
      }
  }, [user]);

  useEffect(() => { fetchGuruData(); }, [fetchGuruData]);

  const refreshSubmissions = async () => {
      try {
          const data = await fetchMurojaahSubmissions();
          setMurojaahSubmissions(data || []);
      } catch (error) {
          toast({ title: 'Gagal memuat murojaah', description: getAcademicErrorMessage(error), variant: 'destructive' });
      }
  };

  const openDetailModal = (santri) => { setSelectedSantri(santri); setIsDetailOpen(true); };
  const openTransferModal = (santri) => setTransferSantri(santri);
  const openHafalanModal = (santri, category) => {
      // Lingkup diturunkan dari jenis materi yang dibuka, bukan dari status murid.
      // Dengan begitu murid mana pun bisa punya hafalan per kelas maupun per juz.
      const programScope = getHafalanScopeForCategory(category);
      const filteredItems = (hafalanItems || []).filter((item) => (
        item && item.category === category && (item.program_scope === programScope || (!item.program_scope && programScope === HAFALAN_SCOPE_PER_KELAS))
      ));
      setSelectedSantri(santri);
      setSelectedHafalan({ category, programScope, items: filteredItems });
      setIsHafalanOpen(true);
  };
  const openMurojaahModal = (submission) => { setIsManualMurojaahActive(false); setCurrentSubmission(submission); setFeedback(submission.feedback || ''); setIsMurojaahOpen(true); };

  const handleHafalanScoreChange = async (item, score) => {
    if (!selectedSantri) return;

    if (!selectedSantri.id || !user?.id) {
        toast({ title: "Validasi Gagal", description: "Sesi tidak valid, silahkan muat ulang halaman.", variant: "destructive" });
        return;
    }

    const category = selectedHafalan.category;
    const itemName = item.item_name;
    const key = item.id ? `${selectedSantri.id}-${item.id}` : `${selectedSantri.id}-${category}-${itemName}`;
    const previousScore = hafalanProgress[key];

    // Optimistic Update
    setHafalanProgress(prev => ({...prev, [key]: score}));

    try {
        await upsertHafalanProgress({ santriId: selectedSantri.id, item: { ...item, category, item_name: itemName }, score, userId: user.id });

        toast({
            title: score === 4 ? "Hafalan Tercapai" : "Skor Hafalan Tersimpan",
            description: `Item "${itemName}" mendapat skor ${score}.`,
            duration: 2000
        });
    } catch (error) {
        toast({ title: "Gagal Update Data", description: getAcademicErrorMessage(error), variant: "destructive" });
        setHafalanProgress(prev => ({...prev, [key]: previousScore}));
    }
  };

  // Status 'perlu_perbaikan' sudah lama diterima basis data dan backend, tetapi
  // tidak pernah bisa dicapai dari layar ini karena statusnya ditulis mati
  // 'diterima'. Sekarang penilainya yang memilih.
  const handleSubmitFeedback = async (status = 'diterima') => {
    if (!currentSubmission) return;
    try {
      await updateMurojaahReview({ id: currentSubmission.id, status, feedback, userId: user.id });
      toast({
        title: 'Berhasil',
        description: status === 'perlu_perbaikan'
          ? 'Setoran ditandai perlu perbaikan.'
          : 'Umpan balik telah disimpan.',
      });
      setIsMurojaahOpen(false);
      setCurrentSubmission(null);
      refreshSubmissions();
    } catch (error) {
      toast({ title: 'Gagal menyimpan umpan balik', description: getAcademicErrorMessage(error), variant: 'destructive' });
    }
  };

  const confirmDeleteSubmission = (submission) => {
    setConfirmDialog({
        isOpen: true,
        title: 'Hapus setoran murojaah?',
        description: `Setoran "${submission.content}" milik ${submission.santri?.nama_lengkap || 'murid ini'} akan dihapus `
            + 'dari daftar. Penghapusan tercatat beserta salinan datanya, jadi masih dapat ditelusuri bila keliru.',
        onConfirm: async () => {
            try {
                await deleteMurojaahSubmission(submission.id);
                toast({ title: 'Terhapus', description: 'Setoran murojaah berhasil dihapus.' });
                if (currentSubmission?.id === submission.id) setCurrentSubmission(null);
                await refreshSubmissions();
            } catch (error) {
                toast({ title: 'Gagal menghapus', description: getAcademicErrorMessage(error), variant: 'destructive' });
            }
        }
    });
  };

  const handleManualMurojaahInsert = async () => {
    if (!manualMurojaahForm.santri_id || !manualMurojaahForm.item_name) {
        toast({ title: "Gagal", description: "Silakan pilih murid dan item hafalan.", variant: "destructive" });
        return;
    }

    setIsSubmittingManual(true);
    try {
        // Setoran tatap muka sudah dinilai di tempat, jadi langsung berstatus
        // diterima — bukan masuk antrean 'menunggu' seperti pengajuan murid.
        await createManualMurojaahSubmission({
            santriId: manualMurojaahForm.santri_id,
            type: manualMurojaahForm.category,
            content: manualMurojaahForm.item_name,
            feedback: manualMurojaahForm.feedback,
            status: 'diterima',
        });
        toast({ title: "Tersimpan", description: "Setoran murojaah berhasil dicatat." });
        setManualMurojaahForm({ santri_id: '', category: 'Surat', item_name: '', feedback: '' });
        await refreshSubmissions();
    } catch (error) {
        toast({ title: "Gagal menyimpan", description: getAcademicErrorMessage(error), variant: "destructive" });
    } finally {
        setIsSubmittingManual(false);
    }
  };

  const pendingSubmissionsCount = useMemo(() => murojaahSubmissions.filter(sub => sub.status === 'menunggu').length, [murojaahSubmissions]);
  const allMySantri = useMemo(() => myClasses.flatMap(c => c.santri), [myClasses]);
  const birthdayStudentsThisMonth = useMemo(() => getBirthdaysThisMonth(allMySantri), [allMySantri]);
  const categories = [...new Set(hafalanItems.map(i => i.category))];
  const filteredManualItems = hafalanItems.filter(i => i.category === manualMurojaahForm.category).map(i => i.item_name);

  const initiateJilidChange = (santri, direction) => {
    const currentIndex = jilidOptions.indexOf(santri.jilid);
    if (direction === 'up') {
      if (currentIndex >= jilidOptions.length - 1) { toast({ title: 'Info', description: 'Murid sudah di jilid terakhir.' }); return; }
      setJilidChangeData({ santri, direction: 'up', currentJilid: santri.jilid, nextJilid: jilidOptions[currentIndex + 1] });
    } else {
      if (currentIndex <= 0) { toast({ title: 'Info', description: 'Murid sudah di jilid pertama.' }); return; }
      setJilidChangeData({ santri, direction: 'down', currentJilid: santri.jilid, nextJilid: jilidOptions[currentIndex - 1] });
    }
    setIsJilidModalOpen(true);
  };

  const confirmJilidChange = async () => {
      if (!jilidChangeData) return;
      const { santri, nextJilid } = jilidChangeData;
      // updateSantriJilid writes santri.jilid and the jilid_history row in one
      // backend transaction, so the two calls this used to make can't half-apply.
      try {
        await updateSantriJilid(santri.id, nextJilid);
      } catch (error) {
        toast({ title: 'Gagal!', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Berhasil!', description: `Jilid murid diubah ke ${nextJilid}.` });
      setMyClasses(prev => prev.map(cls => ({ ...cls, santri: cls.santri.map(s => s.id === santri.id ? {...s, jilid: nextJilid} : s) })));
      setIsJilidModalOpen(false); setJilidChangeData(null);
  };

  const openAttendanceModal = (santri, cls, attendanceRecord) => {
      const todayStr = new Date().toLocaleDateString('en-CA');
      const registeredSession = santri.sesi_mengaji || cls.sesi;
      const attendedSession = attendanceRecord?.attended_session || registeredSession;
      const sessionStart = getSessionStartTimestamp(todayStr, attendedSession);

      const computedStatus = attendanceRecord
          ? resolveAttendanceRecordStatus(attendanceRecord, sessionStart)
          : 'Tidak Hadir';

      setAttendanceDetails({
          id: attendanceRecord?.id,
          user_id: santri.id,
          user_role: 'santri',
          status: computedStatus,
          attendance_date: todayStr,
          sesi: registeredSession,
          attended_session: attendedSession,
          class_id: cls.id,
          checkInTimestamp: attendanceRecord?.check_in_timestamp,
          sessionStartTime: sessionStart,
          lateMinutes: attendanceRecord ? calculateTimeDifference(attendanceRecord.check_in_timestamp, sessionStart) : 0
      });
      setIsAttendanceModalOpen(true);
  };

  if (isLoading) return <div className="p-8 text-center text-muted-foreground flex items-center justify-center h-64"><RefreshCw className="w-8 h-8 animate-spin mr-2"/>Memuat data guru...</div>;

  const isFemale = guruData?.jenis_kelamin === 'Perempuan';
  const themeGradient = isFemale ? 'from-pink-500 to-rose-600' : 'from-sky-500 to-blue-700';
  const headerGradient = isFemale ? 'from-slate-50 to-pink-50 dark:from-slate-900 dark:to-pink-950/40' : 'from-blue-50 to-sky-50 dark:from-slate-900 dark:to-blue-950/40';
  const headerText = isFemale ? 'text-pink-700 dark:text-pink-300' : 'text-blue-700 dark:text-blue-300';
  const hafalanTargets = selectedHafalan.programScope === HAFALAN_SCOPE_PER_JUZ
      ? JUZ_TAHFIZH_TARGETS
      : ['1', '2', '3', '4', '5', '6'];
  const itemsByJilid = Object.fromEntries(hafalanTargets.map((target, index) => [
      target,
      (selectedHafalan.items || []).filter((item) => {
          if (!item) return false;
          const itemTarget = String(item.jilid || '').replace(/^jilid\s*/i, '').trim();
          const targetStr = String(target || '').replace(/^jilid\s*/i, '').trim();
          return itemTarget === targetStr || itemTarget.startsWith(targetStr) || (index === 0 && !item.jilid);
      })
  ]));

  const getProgressData = () => {
      if (!selectedSantri || !selectedHafalan.category) return {};
      const data = {};
      (selectedHafalan.items || []).forEach(item => {
          if (!item) return;
          const key = item.id ? `${selectedSantri.id}-${item.id}` : `${selectedSantri.id}-${selectedHafalan.category}-${item.item_name}`;
          data[item.item_name] = hafalanProgress[key] || null;
      });
      return data;
  };
  const currentProgressData = getProgressData();

  return ( <>
      <div className="max-w-7xl mx-auto px-4 pb-8 pt-20 sm:px-6 lg:px-8">
        <BirthdayGreeting user={guruData} type="Guru" />
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground font-cinzel">Dashboard Guru</h1>
            <div className="flex flex-wrap gap-2 items-center justify-center md:justify-end">
                <div className="relative mr-2">
                    <Button variant="outline" size="icon" onClick={() => setIsBirthdayModalOpen(true)} className="relative border-rose-200 bg-rose-50 text-rose-600 shadow-sm hover:-translate-y-0.5 hover:border-rose-300 hover:bg-rose-100 dark:border-rose-400/20 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-slate-900" title="Ulang Tahun Bulan Ini"><Cake className="w-5 h-5" />{birthdayStudentsThisMonth.length > 0 && <span className="absolute -top-2 -right-2 bg-rose-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow-sm animate-bounce">{birthdayStudentsThisMonth.length}</span>}</Button>
                </div>
                <Button onClick={() => navigate('/gatcha-game')} className="border-0 bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-md shadow-violet-500/20 transition-all hover:-translate-y-0.5 hover:from-violet-500 hover:to-fuchsia-500 hover:shadow-lg hover:shadow-violet-500/30"><Gamepad2 className="w-4 h-4 mr-2"/> Play Gatcha</Button>
                <Button onClick={() => navigate('/quiz-hafalan')} className="border-0 bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-500/20 transition-all hover:-translate-y-0.5 hover:from-cyan-500 hover:to-blue-500 hover:shadow-lg hover:shadow-cyan-500/30"><PlayCircle className="w-4 h-4 mr-2"/> Play Quiz</Button>
                <Button onClick={() => navigate('/random-name')} className="border-0 bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-md shadow-amber-500/20 transition-all hover:-translate-y-0.5 hover:from-amber-400 hover:to-orange-500 hover:shadow-lg hover:shadow-amber-500/30"><Shuffle className="w-4 h-4 mr-2"/> Acak Nama</Button>
            </div>
        </div>
        {guruData && (
          <section className={cn('guru-profile-card', isFemale ? 'guru-profile-card--female' : 'guru-profile-card--male')}>
            {isDark && (
              <div className="guru-profile-card__constellation">
                <Suspense fallback={null}><ProfileConstellationScene accentColor={isFemale ? '#f472b6' : '#60a5fa'} points={myClasses.length * 7} /></Suspense>
              </div>
            )}
            <div className="guru-profile-card__atmosphere" aria-hidden="true" />
            <div className="guru-profile-card__rail" aria-hidden="true" />
            <div className="guru-profile-card__content">
              <div className="guru-profile-card__avatar-shell">
                <span className="guru-profile-card__avatar-orbit" aria-hidden="true" />
                <button type="button" onClick={() => setIsOwnAvatarPreviewOpen(true)} className="guru-profile-card__avatar-button" aria-label="Lihat foto profil guru">
                  <Avatar className="guru-profile-card__avatar w-full h-full"><AvatarImage src={guruData.foto_url} className="object-cover"/><AvatarFallback className="guru-profile-card__avatar-fallback">{guruData.nama?.charAt(0)}</AvatarFallback></Avatar>
                </button>
              </div>
              <div className="guru-profile-card__identity">
                <div className="guru-profile-card__eyebrow"><Sparkles className="h-3.5 w-3.5" /> Profil pengajar</div>
                <div>
                  <h2 className="guru-profile-card__name">{guruData.nama}</h2>
                  <p className="guru-profile-card__role">{labelStafRole(guruData.jabatan)}</p>
                </div>
                <div className="guru-profile-card__metrics" aria-label="Ringkasan profil guru">
                  <span className="guru-profile-card__metric"><Users className="h-4 w-4" /><strong>{myClasses.length}</strong> kelas</span>
                  <span className="guru-profile-card__metric"><UserCheck className="h-4 w-4" /><strong>Aktif</strong></span>
                </div>
              </div>
              <div className="guru-profile-card__actions">
                <Button onClick={() => setIsEditProfileOpen(true)} variant="outline" className="guru-profile-card__button"><Edit className="mr-2 h-4 w-4" /> Edit Profil</Button>
                <div className="guru-profile-card__action-pair"><Button onClick={() => setIsMmqOpen(true)} size="sm" variant="outline" className="guru-profile-card__button">Rapat Guru</Button><Button onClick={() => setIsRecapOpen(true)} size="sm" variant="outline" className="guru-profile-card__button">Absensi</Button></div>
                <Button onClick={() => setIsMurojaahOpen(true)} size="sm" className="guru-profile-card__button guru-profile-card__button--accent"><Mic className="mr-2 h-4 w-4"/> Setoran Muroja'ah{pendingSubmissionsCount > 0 && <span className="guru-profile-card__notification-dot" aria-label={`${pendingSubmissionsCount} setoran menunggu peninjauan`}></span>}</Button>
              </div>
            </div>
          </section>
        )}
        <div className="mt-6 space-y-8 md:mt-8">
            {myClasses.map(cls => (
                <Card key={cls.id} className="shadow-lg hover:shadow-xl transition-shadow duration-300 border-border/50">
                    <CardHeader className={cn("p-4 rounded-t-lg border-b bg-gradient-to-r", headerGradient)}>
                        <CardTitle className={cn("flex items-center gap-3 text-lg md:text-xl font-bold", headerText)}>
                            <Users className="w-6 h-6" /> Kelas: {cls.nama_kelas}
                        </CardTitle>
                        <CardDescription className="text-sm font-medium">Sesi: {cls.sesi} | Murid Aktif: {cls.santri.length}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-secondary/10 dark:bg-card">
                                    <tr className="border-b border-border">
                                        <th className="py-3 px-4 text-left font-semibold text-foreground/70 w-12">No</th>
                                        <th className="py-3 px-4 text-left font-semibold text-foreground/70">Nama Murid</th>
                                        <th className="py-3 px-4 text-center font-semibold text-foreground/70">Kehadiran</th>
                                        <th className="py-3 px-4 text-left font-semibold text-foreground/70">Jilid</th>
                                        <th className="py-3 px-4 text-left font-semibold text-foreground/70">Hafalan</th>
                                        <th className="py-3 px-4 text-left font-semibold text-foreground/70">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(cls.santri || []).map((santri, index) => {
                                        const attendanceRecord = dailyAttendance.find(a => a.user_id === santri.id);
                                        const status = attendanceRecord
                                            ? resolveAttendanceRecordStatus(
                                                attendanceRecord,
                                                getSessionStartTimestamp(
                                                    new Date().toLocaleDateString('en-CA'),
                                                    attendanceRecord.attended_session || santri.sesi_mengaji || cls.sesi,
                                                ),
                                            )
                                            : 'Tidak Hadir';

                                        return (
                                            <tr key={santri.id} className="border-b border-border/50 last:border-0 hover:bg-secondary/5 transition-colors duration-200">
                                                <td className="py-3 px-4 text-muted-foreground">{index + 1}</td>
                                                <td className="py-3 px-4 flex items-center gap-3">
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewAvatar(santri)}
                                                        className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                                                        aria-label={`Lihat foto ${santri.nama_lengkap}`}
                                                    >
                                                        <Avatar className="w-9 h-9 border border-border shadow-sm transition-transform hover:scale-105">
                                                            <AvatarImage src={santri.foto_url} className="object-cover" />
                                                            <AvatarFallback>{santri?.nama_lengkap?.charAt(0) || 'S'}</AvatarFallback>
                                                        </Avatar>
                                                    </button>
                                                    <span className="font-medium text-foreground">{santri.nama_lengkap}</span>
                                                </td>
                                                <td className="py-3 px-4 text-center">
                                                    <div className="flex justify-center w-full">
                                                        <AttendanceStatusIcon
                                                            status={status}
                                                            onClick={() => openAttendanceModal(santri, cls, attendanceRecord)}
                                                            className="hover:scale-110 transition-transform cursor-pointer shadow-sm"
                                                        />
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4 flex items-center gap-2 group">
                                                    <span className={cn("px-2 py-1 rounded text-xs font-bold bg-primary/10 text-primary")}>{santri.jilid}</span>
                                                    <div className="flex gap-1 opacity-100">
                                                        <Button onClick={() => initiateJilidChange(santri, 'up')} size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-green-100 rounded-full" title="Naik Jilid"><ChevronUp className="h-4 w-4 text-green-600" /></Button>
                                                        <Button onClick={() => initiateJilidChange(santri, 'down')} size="sm" variant="ghost" className="h-6 w-6 p-0 hover:bg-red-100 rounded-full" title="Turun Jilid"><ChevronDown className="h-4 w-4 text-red-600" /></Button>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex flex-wrap gap-1">
                                                        {/* Keempatnya terbuka untuk setiap murid. Dulu murid berkategori
                                                            PTPT hanya dapat Tahfizh dan yang lain hanya dapat tiga
                                                            sisanya, sehingga tidak ada murid yang bisa punya keduanya. */}
                                                        <Button size="sm" variant="outline" className="h-7 text-xs border-primary/20 hover:bg-primary/5 text-primary" onClick={() => openHafalanModal(santri, 'Doa')}>Doa</Button>
                                                        <Button size="sm" variant="outline" className="h-7 text-xs border-primary/20 hover:bg-primary/5 text-primary" onClick={() => openHafalanModal(santri, 'Sholat')}>Sholat</Button>
                                                        <Button size="sm" variant="outline" className="h-7 text-xs border-primary/20 hover:bg-primary/5 text-primary" onClick={() => openHafalanModal(santri, 'Surat')}>Surat</Button>
                                                        <Button size="sm" variant="outline" className="h-7 border-violet-300 text-xs text-violet-700 hover:bg-violet-50 dark:border-violet-400/30 dark:text-violet-200 dark:hover:bg-violet-950/30" onClick={() => openHafalanModal(santri, 'Tahfizh')}>Tahfizh</Button>
                                                    </div>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-1">
                                                        <Button size="sm" variant="ghost" onClick={() => openDetailModal(santri)} className={cn("text-primary hover:text-primary hover:bg-primary/10")}>Detail</Button>
                                                        <TooltipProvider delayDuration={250}>
                                                            <Tooltip>
                                                                <TooltipTrigger asChild>
                                                                    <Button
                                                                        size="icon"
                                                                        variant="outline"
                                                                        onClick={() => openTransferModal(santri)}
                                                                        className="guru-transfer-action h-10 w-10 rounded-xl"
                                                                        aria-label={`Transfer ${santri.nama_lengkap} ke kelas lain`}
                                                                    >
                                                                        <ArrowRightLeft className="h-4 w-4" />
                                                                    </Button>
                                                                </TooltipTrigger>
                                                                <TooltipContent side="top" className="rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white dark:bg-white dark:text-slate-950">Transfer kelas</TooltipContent>
                                                            </Tooltip>
                                                        </TooltipProvider>
                                                    </div>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                            {(cls.santri || []).length === 0 && <p className="p-4 text-center text-muted-foreground">Belum ada murid di kelas ini.</p>}
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>

        {/* Jadwal dan nilai dipindah ke subtab supaya tabel data murid tetap
            jadi yang pertama terlihat, bukan terdorong ke bawah dua panel. */}
        <Tabs defaultValue="jadwal" className="mt-6 md:mt-8">
          <TabsList className="grid w-full grid-cols-2 sm:inline-flex sm:w-auto md:grid-cols-4">
            <TabsTrigger value="jadwal">Jadwal Mengajar</TabsTrigger>
            <TabsTrigger value="nilai">Nilai Asesmen</TabsTrigger>
            <TabsTrigger value="konten">Materi &amp; Tugas</TabsTrigger>
            <TabsTrigger value="wali">Komunikasi Wali</TabsTrigger>
          </TabsList>

          <TabsContent value="jadwal" className="mt-4">
            {/* Sumbernya endpoint yang sama dengan panel admin, disaring guru_id,
                dan hanya bisa dibaca — penyuntingan tetap di admin. */}
            <JadwalSaya
              guruId={guruData?.id}
              title="Jadwal Mengajar Saya"
              emptyText="Belum ada jadwal mengajar untuk periode ini. Jadwal disusun admin di panel Jadwal Pelajaran."
            />
          </TabsContent>

          <TabsContent value="nilai" className="mt-4">
            {/* Kelas & mapel diturunkan dari jadwal mengajar; backend menolak
                kombinasi yang tidak diampu, bukan sekadar disembunyikan. */}
            <ModulNilai guruId={guruData?.id} />
          </TabsContent>

          <TabsContent value="konten" className="mt-4">
            {/* Murid hanya membaca yang berstatus terbit; draf tidak pernah bocor.
                Konten kelas sengaja tidak menumpang tabel `announcements`, yang
                memasok situs publik. */}
            <ModulKontenKelas guruId={guruData?.id} />
          </TabsContent>

          <TabsContent value="wali" className="mt-4">
            {/* Hanya menyiapkan pesan dan membuka WhatsApp guru; tidak ada pesan
                yang terkirim dari sini dan tidak ada kredensial yang disimpan.
                Nomor selalu dari basis data, tidak pernah ditanam di kode. */}
            <ModulKomunikasiWali guruNama={guruData?.nama} />
          </TabsContent>
        </Tabs>
      </div>
      <Dialog open={Boolean(previewAvatar)} onOpenChange={(open) => { if (!open) setPreviewAvatar(null); }}>
        <DialogContent className="max-w-md overflow-hidden p-0">
          <div className="aspect-square w-full bg-slate-100 dark:bg-slate-950">
            {previewAvatar?.foto_url ? (
              <img src={previewAvatar.foto_url} alt={`Foto ${previewAvatar.nama_lengkap}`} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                <Avatar className="h-28 w-28"><AvatarFallback className="text-4xl">{previewAvatar?.nama_lengkap?.charAt(0)}</AvatarFallback></Avatar>
                <p className="text-sm">Foto murid belum tersedia.</p>
              </div>
            )}
          </div>
          <DialogHeader className="px-6 pb-6">
            <DialogTitle>{previewAvatar?.nama_lengkap}</DialogTitle>
            <DialogDescription>Foto profil murid dari kelas yang Anda ampu.</DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
      <AvatarPreviewDialog open={isOwnAvatarPreviewOpen} onOpenChange={setIsOwnAvatarPreviewOpen} imageUrl={guruData?.foto_url} name={guruData?.nama} description="Foto profil guru yang sedang digunakan." />
      <SantriDetailModal santri={selectedSantri} isOpen={isDetailOpen} onOpenChange={setIsDetailOpen} onPromote={() => initiateJilidChange(selectedSantri, 'up')} onDemote={() => initiateJilidChange(selectedSantri, 'down')} />
      {selectedSantri && (
        <Dialog open={isHafalanOpen} onOpenChange={setIsHafalanOpen}>
          <DialogContent className="max-h-[88vh] max-w-6xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Skor Hafalan {selectedHafalan.category}</DialogTitle>
              <DialogDescription>Murid: {selectedSantri.nama_lengkap}. Hafalan ditandai tercapai otomatis setelah memperoleh skor 4.</DialogDescription>
              <div className="grid grid-cols-2 gap-2 pt-3 sm:grid-cols-4" aria-label="Keterangan skor perkembangan">
                {DEVELOPMENT_SCORE_OPTIONS.map((option) => (
                  <div key={option.score} className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-slate-900">
                    <p className="text-xs font-black text-foreground">{option.score} · {option.code}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{option.label}</p>
                  </div>
                ))}
              </div>
            </DialogHeader>
            <div className="grid min-w-0 grid-cols-1 gap-4 pt-4 md:grid-cols-2 xl:grid-cols-3">
              {hafalanTargets.map(jilid => (
                <HafalanDisplay key={jilid} jilid={jilid} titlePrefix={selectedHafalan.programScope === HAFALAN_SCOPE_PER_JUZ ? '' : 'Kelas'} items={itemsByJilid[jilid] || []} isDraggable={false} scoreData={currentProgressData} onScoreChange={handleHafalanScoreChange} />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={isMurojaahOpen} onOpenChange={setIsMurojaahOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-0">
            <DialogHeader className="p-6 pb-2 border-b">
                <div className="flex items-center justify-between">
                    <DialogTitle className="flex items-center gap-2 text-xl"><Mic className="w-6 h-6 text-primary"/> Pusat Muroja'ah Kelas</DialogTitle>
                    <Button variant={isManualMurojaahActive ? "default" : "outline"} size="sm" onClick={() => { setIsManualMurojaahActive(!isManualMurojaahActive); setCurrentSubmission(null); }} className="shadow-sm border-primary/30">
                        <PlusCircle className="w-4 h-4 mr-2"/> Input Setoran Manual
                    </Button>
                </div>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-0 flex-1 overflow-hidden">
                <div className="md:col-span-1 border-r bg-secondary/10 dark:bg-card flex flex-col h-[60vh]">
                    <div className="p-4 border-b bg-card font-semibold text-sm">Daftar Setoran Masuk</div>
                    <div className="overflow-y-auto p-4 space-y-2 flex-1 custom-scrollbar">
                        <h4 className="text-xs font-bold text-foreground/60 uppercase tracking-wider mb-2">Menunggu Penilaian ({pendingSubmissionsCount})</h4>
                        {murojaahSubmissions.filter(s => s.status === 'menunggu').map(sub => (
                            <Button key={sub.id} variant={currentSubmission?.id === sub.id && !isManualMurojaahActive ? "default" : "outline"} className={cn("w-full justify-start text-left h-auto py-3 px-4 shadow-sm", currentSubmission?.id === sub.id && !isManualMurojaahActive ? "bg-primary text-primary-foreground" : "bg-card hover:bg-secondary/30")} onClick={() => openMurojaahModal(sub)}>
                                <div><p className="font-semibold text-sm truncate">{sub.santri?.nama_lengkap}</p><p className="text-xs opacity-80 mt-0.5 truncate">{sub.type} - {sub.content}</p></div>
                            </Button>
                        ))}
                        {murojaahSubmissions.filter(s => s.status === 'menunggu').length === 0 && <p className="text-sm text-muted-foreground py-2 text-center">Belum ada setoran baru.</p>}

                        <h4 className="text-xs font-bold text-foreground/60 uppercase tracking-wider mt-6 mb-2">Sudah Dinilai</h4>
                        {murojaahSubmissions.filter(s => ['diterima', 'perlu_perbaikan', 'direview'].includes(s.status)).map(sub => (
                            <Button key={sub.id} variant={currentSubmission?.id === sub.id && !isManualMurojaahActive ? "default" : "ghost"} className={cn("w-full justify-start text-left h-auto py-2 px-4 opacity-75 hover:opacity-100", currentSubmission?.id === sub.id && !isManualMurojaahActive ? "bg-primary text-primary-foreground" : "hover:bg-secondary/30")} onClick={() => openMurojaahModal(sub)}>
                                <div className="truncate"><p className="font-medium text-sm truncate">{sub.santri?.nama_lengkap}</p><p className="text-[10px] opacity-70 truncate">{sub.content}</p></div>
                            </Button>
                        ))}
                    </div>
                </div>
                <div className="md:col-span-2 p-6 overflow-y-auto h-[60vh] custom-scrollbar bg-card">
                    {isManualMurojaahActive ? (
                        <div className="space-y-6 max-w-lg mx-auto">
                            <div className="mb-4">
                                <h3 className="font-bold text-xl text-primary font-serif">Input Setoran Muroja'ah Manual</h3>
                                <p className="text-sm text-muted-foreground">Catat evaluasi hafalan yang dilakukan secara tatap muka.</p>
                            </div>
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">Pilih Murid</label>
                                    <Select value={manualMurojaahForm.santri_id} onValueChange={(val) => setManualMurojaahForm({...manualMurojaahForm, santri_id: val})}>
                                        <SelectTrigger><SelectValue placeholder="Pilih Murid di Kelas" /></SelectTrigger>
                                        <SelectContent>{allMySantri.map(s => <SelectItem key={s.id} value={s.id}>{s.nama_lengkap}</SelectItem>)}</SelectContent>
                                    </Select>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold">Kategori</label>
                                        <Select value={manualMurojaahForm.category} onValueChange={(val) => setManualMurojaahForm({...manualMurojaahForm, category: val, item_name: ''})}>
                                            <SelectTrigger><SelectValue placeholder="Kategori" /></SelectTrigger>
                                            <SelectContent>{categories.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-semibold">Item Hafalan</label>
                                        <Select value={manualMurojaahForm.item_name} onValueChange={(val) => setManualMurojaahForm({...manualMurojaahForm, item_name: val})}>
                                            <SelectTrigger><SelectValue placeholder="Pilih Item" /></SelectTrigger>
                                            <SelectContent>{filteredManualItems.map(item => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
                                        </Select>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold">Umpan Balik & Nilai</label>
                                    <Textarea value={manualMurojaahForm.feedback} onChange={(e) => setManualMurojaahForm({...manualMurojaahForm, feedback: e.target.value})} placeholder="Contoh: Sangat lancar, tajwid perlu sedikit perbaikan di bagian akhir." className="min-h-[100px]" />
                                </div>
                                <Button onClick={handleManualMurojaahInsert} className="w-full bg-primary hover:bg-primary/90 text-primary-foreground" disabled={isSubmittingManual || !manualMurojaahForm.santri_id || !manualMurojaahForm.item_name}>
                                    {isSubmittingManual ? 'Menyimpan...' : <><Check className="w-4 h-4 mr-2"/> Simpan Setoran Manual</>}
                                </Button>
                            </div>
                        </div>
                    ) : currentSubmission ? (
                        <div className="space-y-6 max-w-lg mx-auto">
                            <div className="bg-secondary/20 p-4 rounded-xl border border-border">
                                <h3 className="font-bold text-xl text-foreground font-serif">{currentSubmission.santri?.nama_lengkap}</h3>
                                <div className="flex items-center gap-2 mt-2 text-sm text-foreground/80">
                                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-medium">{currentSubmission.type}</span>
                                    <span>•</span>
                                    <span className="font-medium">{currentSubmission.content}</span>
                                </div>
                                <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1"><CalendarCheck className="w-3 h-3"/> Disubmit pada: {new Date(currentSubmission.created_at).toLocaleString('id-ID')}</p>
                            </div>

                            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-900">
                                <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2"><PlayCircle className="w-4 h-4"/> Bukti Rekaman</h4>
                                <div className="bg-white dark:bg-slate-800 p-3 rounded-lg text-sm break-all font-mono text-muted-foreground shadow-sm">
                                    {currentSubmission.recording_path ? <span className="text-blue-600">Rekaman tersimpan</span> : <span className="italic">Tidak ada file audio</span>}
                                </div>
                            </div>

                            {currentSubmission.status === 'menunggu' ? (
                                <div className="space-y-3 pt-4 border-t border-border">
                                    <label className="font-semibold text-sm">Berikan Umpan Balik / Nilai</label>
                                    <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Tuliskan umpan balik untuk murid ini..." className="min-h-[100px]" />
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                        <Button onClick={() => handleSubmitFeedback('diterima')} className="bg-blue-600 hover:bg-blue-700 text-white shadow-md"><Send className="w-4 h-4 mr-2"/> Terima Setoran</Button>
                                        <Button variant="outline" onClick={() => handleSubmitFeedback('perlu_perbaikan')}>Perlu Perbaikan</Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2 rounded-xl border border-blue-100 bg-blue-50 p-4 dark:border-blue-400/25 dark:bg-slate-900/70">
                                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold"><CheckCircle2 className="w-5 h-5"/> Telah Dinilai</div>
                                    <p className="text-sm italic text-foreground/80">"{currentSubmission.feedback || 'Telah diverifikasi.'}"</p>
                                </div>
                            )}

                            <div className="pt-8 text-center">
                                <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => confirmDeleteSubmission(currentSubmission)}>
                                    <Trash2 className="w-4 h-4 mr-2" /> Hapus Setoran Ini
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-4 opacity-70">
                            <div className="w-20 h-20 bg-secondary/30 rounded-full flex items-center justify-center"><Mic className="w-10 h-10 text-primary/50" /></div>
                            <p>Pilih setoran dari daftar di sebelah kiri untuk mulai menilai.</p>
                        </div>
                    )}
                </div>
            </div>
        </DialogContent>
      </Dialog>

      <MmqSection open={isMmqOpen} onOpenChange={setIsMmqOpen} guru={guruData} />
      {guruData && <EditGuruProfileModal isOpen={isEditProfileOpen} onOpenChange={setIsEditProfileOpen} guruData={guruData} onProfileUpdate={fetchGuruData} themeColor={themeGradient} />}
      <Dialog open={isRecapOpen} onOpenChange={setIsRecapOpen}><DialogContent className="max-w-6xl max-h-[95vh] overflow-y-auto"><DialogHeader><DialogTitle>Rekap Absensi Guru</DialogTitle></DialogHeader><div className="mt-4"><GuruAttendanceRecap isReadOnly={true} /></div></DialogContent></Dialog>
      <AttendanceDetailsModal isOpen={isAttendanceModalOpen} onClose={() => { setIsAttendanceModalOpen(false); setAttendanceDetails(null); }} details={attendanceDetails} onSuccess={fetchGuruData} />
      <StudentTransferModal
        isOpen={Boolean(transferSantri)}
        onClose={() => setTransferSantri(null)}
        santri={transferSantri}
        onTransferSuccess={fetchGuruData}
      />
      <BirthdayNotificationModal isOpen={isBirthdayModalOpen} onClose={() => setIsBirthdayModalOpen(false)} students={allMySantri} />
      <ConfirmationDialog isOpen={confirmDialog.isOpen} onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })} onConfirm={confirmDialog.onConfirm} title={confirmDialog.title} description={confirmDialog.description} variant={confirmDialog.variant || "destructive"} confirmText={confirmDialog.confirmText || "Ya, Lanjutkan"} />
      <JilidChangeModal isOpen={isJilidModalOpen} onClose={() => setIsJilidModalOpen(false)} onConfirm={confirmJilidChange} {...jilidChangeData} kategori="Anak" />
    </>
  );
};
export default GuruDashboard;
