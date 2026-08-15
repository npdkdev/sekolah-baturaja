
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/components/ui/use-toast';
import { Plus, Edit, Trash2, Search, Upload, Eye, EyeOff, UserCheck, Filter, Mail, Key, XCircle, CreditCard, Calendar, Cake, Loader2, Download, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from '@/components/ui/card';
import BirthdayNotificationModal from '@/components/dashboard/shared/BirthdayNotificationModal';
import * as XLSX from 'xlsx';
import {
  createGuru,
  deleteGuru,
  fetchGuruList,
  getOperationalRoleFromGuruForm,
  pickGuruProfileFields,
  updateGuru,
} from '@/lib/dataMasterAdapters';
import { getStorageErrorMessage, resolveAvatarRecords, uploadAvatar } from '@/lib/storageAdapters';
import { getBirthdaysThisMonth } from '@/lib/birthdayUtils';
import { useAuth } from '@/contexts/AuthContext';
import { isAdminRole } from '@/lib/roles';
import { labelStafRole } from '@/lib/staf';

const AVAILABLE_ROLES = ['Pengajar', 'Pentashih', 'Staff Operasional', 'Tata Usaha', 'Admin'];

// Nilai 'Pentashih' tetap dipakai sebagai nilai tersimpan karena resolusi role
// dan data guru lama bergantung padanya. Yang berubah hanya labelnya.
const ROLE_LABELS = { Pentashih: 'Wakil Kepala Sekolah' };

const GuruManagement = () => {
  const { role } = useAuth();
  // Account & role provisioning (create/delete accounts, assign app-roles,
  // reset passwords) is admin-only. Tata Usaha may view and edit teacher
  // profile fields but never touch credentials or roles — the backend enforces
  // this too (see middleware.CanManage / guru.go), this just hides dead controls.
  const isAdmin = isAdminRole(role);
  const [guruList, setGuruList] = useState([]);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingGuru, setEditingGuru] = useState(null);
  const [formData, setFormData] = useState({});
  const [filters, setFilters] = useState({ search: '', isNotulen: 'all', rfidStatus: 'all' });
  const photoInputRef = React.useRef(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Birthday Notification
  const [isBirthdayModalOpen, setIsBirthdayModalOpen] = useState(false);
  const [birthdayCount, setBirthdayCount] = useState(0);

  const fetchGuru = useCallback(async () => {
    try {
        const data = await fetchGuruList();
        setGuruList(await resolveAvatarRecords(data, { ownerType: 'guru' }));
    } catch (err) {
        console.error("Full fetchGuru Error:", err);
        toast({ title: "Gagal memuat data guru", description: err.message, variant: "destructive" });
    }
  }, []);

  useEffect(() => {
      fetchGuru();
  }, [fetchGuru]);

  const calculateBirthdayCount = useCallback(() => {
      try {
          setBirthdayCount(getBirthdaysThisMonth(guruList.map((guru) => ({ ...guru, nama_lengkap: guru.nama }))).length);
      } catch (err) {
          console.error("Error calculating birthdays:", err);
      }
  }, [guruList]);

  useEffect(() => {
      if (guruList.length > 0) calculateBirthdayCount();
  }, [guruList, calculateBirthdayCount]);

  const resetForm = () => {
    setFormData({
      nama: '', jabatan: '', email: '', no_hp: '', alamat: '', rfid_tag: '', is_notulen: false, foto_url: '', avatar_path: '', password: '',
      roles: [], jenis_kelamin: 'Laki-laki', status_guru: 'Belum Bersertifikat', nomor_induk_qiroati: '', tanggal_lahir: ''
    });
    setEditingGuru(null);
  };

  const handleAdd = () => { resetForm(); setShowPassword(false); setIsDialogOpen(true); };

  const handleEdit = (guru) => {
    setShowPassword(false);
    setEditingGuru(guru);
    setFormData({
        ...guru,
        password: '',
        roles: guru.roles || [],
        jenis_kelamin: guru.jenis_kelamin || 'Laki-laki',
        status_guru: guru.status_guru || 'Belum Bersertifikat',
        nomor_induk_qiroati: guru.nomor_induk_qiroati || '',
        tanggal_lahir: guru.tanggal_lahir || ''
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (guruToDelete) => {
    if (window.confirm(`Yakin ingin menonaktifkan ${guruToDelete.nama}? Akun login akan dinonaktifkan tanpa hard delete.`)) {
      try {
          await deleteGuru(guruToDelete.id);
          toast({ title: "Berhasil!", description: "Akun guru telah dinonaktifkan." });
          fetchGuru();
      } catch (err) {
          toast({ title: "Gagal Hapus Data Guru", description: err.message, variant: "destructive" });
      }
    }
  };

  const handleBackupToExcel = async () => {
    try {
        toast({ title: "Memproses Backup", description: "Sedang menyiapkan data untuk diekspor..." });
        console.log("Starting Backup to Excel for Guru...");

        const allGuru = await fetchGuruList();

        if (!allGuru || allGuru.length === 0) {
            toast({ title: "Data Kosong", description: "Tidak ada data guru untuk diekspor.", variant: "destructive" });
            return;
        }

        const exportData = allGuru.map((guru, index) => ({
            'No': index + 1,
            'Nama Guru': guru.nama || '-',
            'Email': guru.email || '-',
            'No Telepon': guru.no_hp || '-',
            'Alamat': guru.alamat || '-',
            'Tanggal Bergabung': guru.created_at ? new Date(guru.created_at).toLocaleDateString('id-ID') : '-',
            'Status': guru.status_guru || 'Belum Bersertifikat',
            'Jabatan': labelStafRole(guru.jabatan || '-'),
            'Role': guru.roles && guru.roles.length > 0 ? guru.roles.map((item) => ROLE_LABELS[item] || item).join(', ') : '-',
            'NUPTK': guru.nomor_induk_qiroati || '-',
            'Jenis Kelamin': guru.jenis_kelamin || '-',
            'Tanggal Lahir': guru.tanggal_lahir ? new Date(guru.tanggal_lahir).toLocaleDateString('id-ID') : '-',
        }));

        const ws = XLSX.utils.json_to_sheet(exportData);
        const wscols = [
            {wch: 5}, {wch: 30}, {wch: 25}, {wch: 15}, {wch: 40}, {wch: 20},
            {wch: 15}, {wch: 20}, {wch: 25}, {wch: 20}, {wch: 15}, {wch: 15},
        ];
        ws['!cols'] = wscols;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Data Guru");

        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Data_Guru_${dateStr}.xlsx`);

        toast({ title: "Backup Berhasil", description: "File Excel berhasil diunduh." });
    } catch (err) {
        console.error("Backup error:", err);
        toast({ title: "Gagal Backup", description: err.message || "Terjadi kesalahan saat memproses data.", variant: "destructive" });
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
        toast({ title: "Format Salah", description: "Hanya file JPG, PNG, atau WebP yang diperbolehkan.", variant: "destructive" });
        return;
    }

    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = async () => {
        if (img.width < 200 || img.height < 200) {
            toast({ title: "Resolusi Rendah", description: "Minimal resolusi gambar adalah 200x200px.", variant: "destructive" });
            URL.revokeObjectURL(objectUrl);
            return;
        }

        setIsUploading(true);

        try {
          if (!editingGuru?.id) {
              throw new Error("Avatar memakai path berdasarkan UUID akun. Simpan data guru terlebih dahulu sebelum upload foto.");
          }
          const ownerType = formData.roles?.includes('Pentashih') ? 'pentashih' : 'guru';
          const { path, signedUrl } = await uploadAvatar({ ownerType, ownerId: editingGuru.id, file });
          const finalUrl = signedUrl || formData.foto_url || '';

          setFormData(prev => ({...prev, foto_url: finalUrl, avatar_path: path }));
          setPreviewImage(finalUrl);

          if (editingGuru) {
              await updateGuru(editingGuru.id, { avatar_path: path });
              toast({ title: "Foto Tersimpan", description: "Foto profil berhasil diperbarui secara otomatis." });
              fetchGuru();
          } else {
              toast({ title: "Upload Berhasil", description: "Foto siap disimpan bersama data guru baru." });
          }

        } catch (error) {
            toast({ title: 'Upload Gagal', description: getStorageErrorMessage(error), variant: 'destructive' });
        } finally {
            setIsUploading(false);
            URL.revokeObjectURL(objectUrl);
        }
    };
    img.src = objectUrl;
  };

  const triggerPhotoUpload = () => photoInputRef.current?.click();

  const validatePassword = (password) => {
    if (!password) return null;
    if (password.length < 8) return "Password minimal 8 karakter.";
    if (!/[a-z]/.test(password)) return "Password harus mengandung minimal satu huruf kecil.";
    if (!/[A-Z]/.test(password)) return "Password harus mengandung minimal satu huruf besar.";
    if (!/[0-9]/.test(password)) return "Password harus mengandung minimal satu angka.";
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) return "Password harus mengandung minimal satu karakter spesial.";
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const operationalRole = getOperationalRoleFromGuruForm(formData);

    if (formData.password) {
        const passwordError = validatePassword(formData.password);
        if (passwordError) {
            toast({ title: "Validasi Password Gagal", description: passwordError, variant: "destructive" });
            return;
        }
    } else if (!editingGuru) {
        toast({ title: "Validasi Gagal", description: "Password wajib diisi untuk guru baru.", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);
    const isPasswordChange = Boolean(editingGuru && formData.password);

    try {
        const profile = pickGuruProfileFields(formData, operationalRole);
        if (!editingGuru) {
          await createGuru({ role: operationalRole, profile, password: formData.password });
        } else {
          // Password goes in the same partial update — the backend hashes it before
          // it reaches the DB, so there's no separate reset call anymore.
          await updateGuru(editingGuru.id, isPasswordChange ? { ...profile, password: formData.password } : profile);
        }

        toast({ title: "Berhasil!", description: isPasswordChange ? "Data dan password guru berhasil diperbarui." : "Data guru berhasil disimpan." });
        setIsDialogOpen(false);
        fetchGuru();
    } catch (err) {
        console.error("Full handleSubmit Error:", err);
        toast({ title: "Gagal menyimpan data", description: err.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  };

  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
  const handleCheckboxChange = (checked) => setFormData(prev => ({ ...prev, is_notulen: checked }));

  const handleRoleChange = (role, checked) => {
      setFormData(prev => {
          const currentRoles = prev.roles || [];
          if (checked) return { ...prev, roles: [...currentRoles, role] };
          return { ...prev, roles: currentRoles.filter(r => r !== role) };
      });
  };

  const filteredGuru = useMemo(() => {
    return guruList.filter(guru => {
        const searchMatch = filters.search === '' ||
            guru.nama.toLowerCase().includes(filters.search.toLowerCase()) ||
            (guru.email && guru.email.toLowerCase().includes(filters.search.toLowerCase())) ||
            (guru.rfid_tag && guru.rfid_tag.includes(filters.search)) ||
            (guru.nomor_induk_qiroati && guru.nomor_induk_qiroati.includes(filters.search));

        const notulenMatch = filters.isNotulen === 'all' || (filters.isNotulen === 'yes' && guru.is_notulen) || (filters.isNotulen === 'no' && !guru.is_notulen);
        const rfidMatch = filters.rfidStatus === 'all' || (filters.rfidStatus === 'assigned' && guru.rfid_tag) || (filters.rfidStatus === 'unassigned' && !guru.rfid_tag);

        return searchMatch && notulenMatch && rfidMatch;
    });
  }, [guruList, filters]);

  return (
    <div>
      <div className="admin-panel-header">
          <div className="flex items-center gap-3">
             <div className="admin-panel-header-icon">
                <UserCheck />
             </div>
             <div className="admin-panel-header-text">
                <h2>Manajemen Data Guru</h2>
                <p>Kelola data pengajar, staff, dan akses login.</p>
             </div>
          </div>

          <div className="admin-panel-header-actions">
            <button
                onClick={() => setIsBirthdayModalOpen(true)}
                className="admin-action-cluster-btn relative"
                style={{ border: '1px solid hsl(330 80% 85%)', color: 'hsl(330 60% 55%)' }}
            >
                <Cake className="w-4 h-4" />
                {birthdayCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full shadow-sm animate-bounce leading-none">
                        {birthdayCount}
                    </span>
                )}
            </button>

            {isAdmin && (
            <div className="admin-action-cluster">
                 <button onClick={handleBackupToExcel} className="admin-action-cluster-btn" title="Backup data guru ke Excel">
                    <Download className="w-3.5 h-3.5"/> Export
                 </button>
            </div>
            )}
            {isAdmin && (
              <button onClick={handleAdd} className="admin-panel-primary-btn">
                  <Plus className="w-4 h-4"/> Tambah Guru
              </button>
            )}
          </div>
      </div>

       <div className="admin-filter-bar">
            <div className="admin-search-input">
                <Search />
                <Input
                    placeholder="Cari nama, email, RFID, atau No. Induk..."
                    value={filters.search}
                    onChange={e => setFilters(f => ({...f, search: e.target.value}))}
                />
            </div>
            <div className="admin-filter-selects">
                <Select value={filters.isNotulen} onValueChange={val => setFilters(f => ({...f, isNotulen: val}))}>
                    <SelectTrigger><SelectValue placeholder="Notulen" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Semua</SelectItem><SelectItem value="yes">Notulen</SelectItem><SelectItem value="no">Bukan Notulen</SelectItem></SelectContent>
                </Select>
                <Select value={filters.rfidStatus} onValueChange={val => setFilters(f => ({...f, rfidStatus: val}))}>
                    <SelectTrigger><SelectValue placeholder="RFID" /></SelectTrigger>
                    <SelectContent><SelectItem value="all">Semua RFID</SelectItem><SelectItem value="assigned">Ada RFID</SelectItem><SelectItem value="unassigned">Tanpa RFID</SelectItem></SelectContent>
                </Select>
            </div>
       </div>

      <div className="admin-table-shell">
        <div className="admin-table-scroll">
        <table>
          <thead>
            <tr>
              <th className="p-3 text-left w-12 text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--admin-text-muted))' }}>No.</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--admin-text-muted))' }}>Nama</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--admin-text-muted))' }}>No. Induk</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--admin-text-muted))' }}>Status Guru</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--admin-text-muted))' }}>Role</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--admin-text-muted))' }}>Kontak</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--admin-text-muted))' }}>RFID</th>
              <th className="p-3 text-left text-xs font-semibold uppercase tracking-wider" style={{ color: 'hsl(var(--admin-text-muted))' }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredGuru.map((guru, index) => (
              <tr key={guru.id} className="group">
                <td className="p-3 font-mono text-xs" style={{ color: 'hsl(var(--admin-text-muted))' }}>{index + 1}</td>
                <td className="p-3">
                    <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9 border cursor-pointer hover:scale-105 transition-transform" style={{ borderColor: 'hsl(var(--admin-border))' }} onClick={() => setPreviewImage(guru.foto_url)}>
                            <AvatarImage src={guru.foto_url} /><AvatarFallback style={{ backgroundColor: 'hsl(var(--admin-accent-soft))', color: 'hsl(var(--admin-accent))' }} className="text-xs font-bold">{guru.nama.charAt(0)}</AvatarFallback>
                        </Avatar>
                        <span className="font-medium" style={{ color: 'hsl(var(--admin-text-primary))' }}>{guru.nama}</span>
                    </div>
                </td>
                <td className="p-3 text-xs font-mono" style={{ color: 'hsl(var(--admin-text-secondary))' }}>{guru.nomor_induk_qiroati || '-'}</td>
                <td className="p-3">
                    <span className={guru.status_guru === 'Bersertifikat' ? 'admin-status-badge admin-status-badge--success' : 'admin-status-badge admin-status-badge--neutral'}>
                        {guru.status_guru || 'Belum Bersertifikat'}
                    </span>
                </td>
                <td className="p-3">
                    <div className="flex flex-wrap gap-1">
                        {(guru.roles && guru.roles.length > 0) ? guru.roles.map(r => <span key={r} className="admin-status-badge admin-status-badge--info">{ROLE_LABELS[r] || r}</span>) : <span style={{ color: 'hsl(var(--admin-text-muted))' }}>-</span>}
                    </div>
                </td>
                <td className="p-3"><div className="flex flex-col"><span className="text-xs" style={{ color: 'hsl(var(--admin-text-primary))' }}>{guru.email}</span><span className="text-xs" style={{ color: 'hsl(var(--admin-text-muted))' }}>{guru.no_hp}</span></div></td>
                <td className="p-3 text-xs font-mono" style={{ color: 'hsl(var(--admin-text-muted))' }}>{guru.rfid_tag || '-'}</td>
                <td className="p-3"><div className="flex gap-1"><Button onClick={() => handleEdit(guru)} size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full" style={{ color: 'hsl(var(--admin-text-muted))' }}><Edit className="w-4 h-4" /></Button>{isAdmin && (<Button onClick={() => handleDelete(guru)} size="sm" variant="ghost" className="h-8 w-8 p-0 rounded-full text-red-500 hover:text-red-600 hover:bg-red-50" title="Nonaktifkan akun guru"><Trash2 className="w-4 h-4" /></Button>)}</div></td>
            </tr>
          ))}
          </tbody>
        </table>
        {filteredGuru.length === 0 && (
            <div className="admin-table-empty">
                <Search />
                <p>Tidak ada data guru yang cocok.</p>
            </div>
        )}
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingGuru ? 'Edit Data Guru' : 'Tambah Guru Baru'}</DialogTitle></DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-6">

              <div className="flex flex-col sm:flex-row items-center gap-6 p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-dashed border-slate-300 dark:border-slate-700">
                  <Avatar className="w-28 h-28 border-4 border-white dark:border-slate-800 shadow-lg cursor-pointer hover:opacity-80 transition-opacity" onClick={() => formData.foto_url && setPreviewImage(formData.foto_url)}>
                      <AvatarImage src={formData.foto_url} /><AvatarFallback><Upload /></AvatarFallback>
                  </Avatar>
                  <div className="flex-1 w-full space-y-3">
                      <div className="flex items-center gap-3">
                           <Button type="button" onClick={triggerPhotoUpload} variant="secondary" className="bg-white dark:bg-slate-800 shadow-sm" disabled={isUploading || !editingGuru?.id}>
                               {isUploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin"/> Mengunggah...</> : <><Upload className="w-4 h-4 mr-2"/> Upload Foto Profil</>}
                           </Button>
                           <span className="text-xs text-muted-foreground">JPG, PNG, WebP hingga 12 MB dikompres otomatis. Simpan akun baru sebelum upload.</span>
                           <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handlePhotoUpload} className="hidden" />
                      </div>
                      <div className="relative">
                          <Input type="text" placeholder="https://example.com/foto.jpg" value={formData.foto_url || ''} onChange={handleInputChange} id="foto_url" className="pl-9 text-xs bg-white dark:bg-slate-950" />
                          <Upload className="absolute left-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground"/>
                      </div>
                      <p className="text-[10px] text-muted-foreground italic">Foto akan otomatis disimpan ke sistem setelah upload selesai.</p>
                  </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                 <div className="col-span-full font-semibold text-lg border-b pb-2 text-primary">Informasi Pribadi</div>

                 <div className="space-y-1.5"><label htmlFor="nama" className="text-xs font-medium uppercase text-muted-foreground">Nama Lengkap</label><Input id="nama" value={formData.nama || ''} onChange={handleInputChange} required /></div>
                 <div className="space-y-1.5"><label htmlFor="nomor_induk_qiroati" className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1"><CreditCard className="w-3 h-3"/> NUPTK</label><Input id="nomor_induk_qiroati" value={formData.nomor_induk_qiroati || ''} onChange={handleInputChange} placeholder="Contoh: 123456789" /></div>
                 <div className="space-y-1.5"><label htmlFor="jabatan" className="text-xs font-medium uppercase text-muted-foreground">Jabatan Utama (Display)</label><Input id="jabatan" value={formData.jabatan || ''} onChange={handleInputChange} /></div>

                 <div className="space-y-1.5"><label htmlFor="no_hp" className="text-xs font-medium uppercase text-muted-foreground">No. HP</label><Input id="no_hp" value={formData.no_hp || ''} onChange={handleInputChange} /></div>
                 <div className="space-y-1.5"><label className="text-xs font-medium uppercase text-muted-foreground">Jenis Kelamin</label>
                    <Select value={formData.jenis_kelamin} onValueChange={val => setFormData(prev => ({...prev, jenis_kelamin: val}))}>
                        <SelectTrigger><SelectValue placeholder="Pilih Gender" /></SelectTrigger>
                        <SelectContent><SelectItem value="Laki-laki">Laki-laki</SelectItem><SelectItem value="Perempuan">Perempuan</SelectItem></SelectContent>
                    </Select>
                 </div>

                 <div className="space-y-1.5"><label htmlFor="tanggal_lahir" className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3"/> Tanggal Lahir</label><Input id="tanggal_lahir" type="date" value={formData.tanggal_lahir || ''} onChange={handleInputChange} /></div>

                 <div className="space-y-1.5"><label className="text-xs font-medium uppercase text-muted-foreground">Status Sertifikasi</label>
                    <Select value={formData.status_guru || 'Belum Bersertifikat'} onValueChange={val => setFormData(prev => ({...prev, status_guru: val}))}>
                        <SelectTrigger><SelectValue placeholder="Pilih Status" /></SelectTrigger>
                        <SelectContent><SelectItem value="Bersertifikat">Bersertifikat</SelectItem><SelectItem value="Belum Bersertifikat">Belum Bersertifikat</SelectItem></SelectContent>
                    </Select>
                 </div>

                 <div className="col-span-full space-y-1.5"><label htmlFor="alamat" className="text-xs font-medium uppercase text-muted-foreground">Alamat</label><Textarea id="alamat" value={formData.alamat || ''} onChange={handleInputChange} /></div>

                 <div className="col-span-full font-semibold text-lg border-b pb-2 mt-2 text-primary">Akses & Sistem</div>

                 <div className="space-y-1.5"><label htmlFor="email" className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1"><Mail className="w-3 h-3"/> Email (Login)</label><Input id="email" type="email" value={formData.email || ''} onChange={handleInputChange} required/></div>
                 {isAdmin && (
                 <div className="space-y-1.5 relative">
                  <label htmlFor="password" className="text-xs font-medium uppercase text-muted-foreground flex items-center gap-1"><Key className="w-3 h-3"/> Password</label>
                  <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? "text" : "password"}
                        placeholder={editingGuru ? "Kosongkan jika tidak ganti" : "Wajib diisi"}
                        value={formData.password || ''}
                        onChange={handleInputChange}
                      />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">{showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Masukkan password baru minimal 8 karakter. Toggle hanya menampilkan nilai baru; password Auth lama tidak dapat dibaca kembali.
                  </p>
                </div>
                 )}

                <div className="space-y-1.5"><label htmlFor="rfid_tag" className="text-xs font-medium uppercase text-muted-foreground">RFID Tag</label><Input id="rfid_tag" value={formData.rfid_tag || ''} onChange={handleInputChange} /></div>
              </div>

              {isAdmin && (
              <div className="relative overflow-hidden rounded-2xl border border-indigo-200/70 bg-gradient-to-br from-white/85 via-indigo-50/70 to-violet-50/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_16px_40px_rgba(91,108,255,0.08)] backdrop-blur-xl dark:border-indigo-800/60 dark:from-slate-900/85 dark:via-indigo-950/35 dark:to-violet-950/35">
                  <div className="pointer-events-none absolute -right-16 -top-20 h-40 w-40 rounded-full bg-rose-300/20 blur-3xl dark:bg-rose-500/10" aria-hidden="true" />
                  <div className="relative mb-3 flex items-start gap-3">
                      <div className="rounded-xl border border-indigo-200/80 bg-white/70 p-2 text-indigo-700 shadow-sm dark:border-indigo-800 dark:bg-slate-900/70 dark:text-indigo-300">
                          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      </div>
                      <div>
                          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Roles / Jabatan Fungsional</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-slate-600 dark:text-slate-300">Role Admin memberikan akses penuh ke Dashboard Admin. Role Tata Usaha membuka Dashboard Tata Usaha. Berikan hanya kepada pengelola yang dipercaya.</p>
                      </div>
                  </div>
                  <div className="relative grid gap-2 sm:grid-cols-2">
                      {AVAILABLE_ROLES.map(roleOption => (
                          <div key={roleOption} className={`flex min-h-11 items-center space-x-2 rounded-xl border px-3 py-2 transition-colors ${(formData.roles || []).includes(roleOption) ? 'border-indigo-300 bg-white/85 shadow-sm dark:border-indigo-700 dark:bg-slate-900/80' : 'border-white/70 bg-white/45 hover:bg-white/70 dark:border-slate-700/70 dark:bg-slate-900/35 dark:hover:bg-slate-900/60'}`}>
                              <Checkbox id={`role-${roleOption}`} checked={(formData.roles || []).includes(roleOption)} onCheckedChange={(checked) => handleRoleChange(roleOption, checked)} />
                              <label htmlFor={`role-${roleOption}`} className="flex-1 cursor-pointer select-none text-sm font-medium">{ROLE_LABELS[roleOption] || roleOption}</label>
                          </div>
                      ))}
                  </div>
                  {(formData.roles || []).includes('Admin') && (
                    <p className="relative mt-3 rounded-xl border border-amber-200/80 bg-amber-50/80 px-3 py-2 text-xs font-medium text-amber-900 dark:border-amber-800/70 dark:bg-amber-950/30 dark:text-amber-200" role="status">
                      Saat login, akun ini akan diarahkan ke Dashboard Admin dan memperoleh kewenangan administrasi penuh.
                    </p>
                  )}
                  {(formData.roles || []).includes('Tata Usaha') && !(formData.roles || []).includes('Admin') && (
                    <p className="relative mt-3 rounded-xl border border-indigo-200/80 bg-indigo-50/80 px-3 py-2 text-xs font-medium text-indigo-900 dark:border-indigo-800/70 dark:bg-indigo-950/30 dark:text-indigo-200" role="status">
                      Saat login, akun ini akan diarahkan ke Dashboard Tata Usaha (administrasi &amp; operasional, tanpa backup atau log login).
                    </p>
                  )}
              </div>
              )}

              <div className="flex items-center space-x-2 pt-2"><Checkbox id="is_notulen" checked={formData.is_notulen} onCheckedChange={handleCheckboxChange} /><label htmlFor="is_notulen" className="text-sm font-medium cursor-pointer">Jadikan sebagai Notulen MMQ</label></div>
              <DialogFooter><Button type="submit" disabled={isSubmitting}>{isSubmitting ? 'Menyimpan...' : (editingGuru ? 'Simpan Perubahan' : 'Tambah Guru')}</Button></DialogFooter>
            </form>
        </DialogContent>
      </Dialog>

      <BirthdayNotificationModal isOpen={isBirthdayModalOpen} onClose={() => setIsBirthdayModalOpen(false)} students={guruList.map((guru) => ({ ...guru, nama_lengkap: guru.nama, no_hp_ortu: guru.no_hp }))} audience="guru" />

      <Dialog open={!!previewImage} onOpenChange={() => setPreviewImage(null)}>
        <DialogContent className="max-w-xl p-0 overflow-hidden bg-transparent border-none shadow-none">
            <div className="relative w-full h-[80vh] flex items-center justify-center">
                <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain rounded-lg shadow-2xl" />
                <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full"
                    onClick={() => setPreviewImage(null)}
                >
                    <XCircle className="w-6 h-6" />
                </Button>
            </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default GuruManagement;
