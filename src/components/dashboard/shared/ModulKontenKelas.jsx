import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, ClipboardList, Eye, EyeOff, Link2, Megaphone, Pencil, Plus, RefreshCw, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { fetchJadwalList, fetchPeriodeList, getPeriodeLabel } from '@/lib/scheduleAdapters';
import {
  JENIS_KONTEN,
  bolehPunyaBatas,
  createKelasKonten,
  deleteKelasKonten,
  fetchKelasKonten,
  formatTanggal,
  getJenisLabel,
  getKelasKontenErrorMessage,
  getStatusLabel,
  sembunyikanKelasKonten,
  terbitkanKelasKonten,
  toInputDateTime,
  updateKelasKonten,
} from '@/lib/kelasKontenAdapters';

/**
 * Materi, tugas, dan pengumuman untuk kelas yang diampu guru.
 *
 * Kelas dan mata pelajaran diturunkan dari jadwal mengajar — sumber yang sama
 * yang dipakai backend untuk menolak. Menyaring dropdown di sini hanya soal
 * kenyamanan; melewatinya tetap dijawab 403 oleh `kelaskonten.go`.
 *
 * Lampiran berupa TAUTAN, bukan unggahan berkas. Bucket `documents` dijaga pada
 * tingkat CanManage (`authorizeFileWrite`), jadi guru tidak dapat mengunggah ke
 * sana; melonggarkannya berarti mengubah keamanan berkas di luar lingkup ini.
 */

const IKON_JENIS = {
  materi: BookOpen,
  tugas: ClipboardList,
  pengumuman: Megaphone,
};

const formKosong = {
  id: null,
  jenis: 'materi',
  judul: '',
  isi: '',
  batasPengumpulan: '',
  lampiranUrl: '',
  lampiranNama: '',
  status: 'draft',
};

const ModulKontenKelas = ({ guruId, title = 'Materi, Tugas & Pengumuman' }) => {
  const { toast } = useToast();

  const [periodeList, setPeriodeList] = useState([]);
  const [periodeId, setPeriodeId] = useState('');
  const [jadwal, setJadwal] = useState([]);
  const [classId, setClassId] = useState('');
  const [mapelId, setMapelId] = useState('');
  const [filterJenis, setFilterJenis] = useState('');

  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(formKosong);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [hapusTarget, setHapusTarget] = useState(null);

  const muatDasar = useCallback(async () => {
    if (!guruId) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const daftarPeriode = await fetchPeriodeList();
      const aktif = (daftarPeriode || []).find((p) => p.is_active) || (daftarPeriode || [])[0] || null;
      setPeriodeList(daftarPeriode || []);
      setPeriodeId((lama) => lama || aktif?.id || '');
    } catch (err) {
      setError(getKelasKontenErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [guruId]);

  useEffect(() => { muatDasar(); }, [muatDasar]);

  useEffect(() => {
    let hidup = true;
    if (!guruId || !periodeId) return undefined;
    fetchJadwalList({ periodeId, guruId })
      .then((data) => { if (hidup) setJadwal(data || []); })
      .catch((err) => { if (hidup) setError(getKelasKontenErrorMessage(err)); });
    return () => { hidup = false; };
  }, [guruId, periodeId]);

  const kelasDiampu = useMemo(() => {
    const peta = new Map();
    (jadwal || []).forEach((row) => {
      if (row?.class_id && !peta.has(row.class_id)) {
        peta.set(row.class_id, { id: row.class_id, nama: row.nama_kelas || 'Kelas' });
      }
    });
    return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [jadwal]);

  const mapelDiampu = useMemo(() => {
    const peta = new Map();
    (jadwal || [])
      .filter((row) => !classId || row.class_id === classId)
      .forEach((row) => {
        if (row?.mata_pelajaran_id && !peta.has(row.mata_pelajaran_id)) {
          peta.set(row.mata_pelajaran_id, {
            id: row.mata_pelajaran_id,
            nama: row.mata_pelajaran_nama || 'Mata pelajaran',
          });
        }
      });
    return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [jadwal, classId]);

  useEffect(() => {
    if (!classId && kelasDiampu.length > 0) setClassId(kelasDiampu[0].id);
  }, [kelasDiampu, classId]);

  useEffect(() => {
    // Mata pelajaran boleh kosong: pengumuman kelas tidak selalu menempel pada satu.
    if (mapelId && !mapelDiampu.some((m) => m.id === mapelId)) setMapelId('');
  }, [mapelDiampu, mapelId]);

  const muat = useCallback(async () => {
    if (!classId) {
      setRows([]);
      return;
    }
    setError(null);
    try {
      setRows(await fetchKelasKonten({
        classId,
        periodeId: periodeId || undefined,
        jenis: filterJenis || undefined,
        limit: 100,
      }) || []);
    } catch (err) {
      setError(getKelasKontenErrorMessage(err));
      setRows([]);
    }
  }, [classId, periodeId, filterJenis]);

  useEffect(() => { muat(); }, [muat]);

  const bukaTambah = () => { setForm(formKosong); setIsFormOpen(true); };

  const bukaEdit = (row) => {
    setForm({
      id: row.id,
      jenis: row.jenis,
      judul: row.judul || '',
      isi: row.isi || '',
      batasPengumpulan: toInputDateTime(row.batas_pengumpulan),
      lampiranUrl: row.lampiran_url || '',
      lampiranNama: row.lampiran_nama || '',
      status: row.status || 'draft',
    });
    setIsFormOpen(true);
  };

  const simpan = async () => {
    if (!String(form.judul || '').trim()) {
      toast({ title: 'Belum lengkap', description: 'Judul wajib diisi.', variant: 'destructive' });
      return;
    }
    setIsSaving(true);
    try {
      if (form.id) {
        await updateKelasKonten(form.id, {
          judul: form.judul,
          isi: form.isi,
          batasPengumpulan: bolehPunyaBatas(form.jenis) ? form.batasPengumpulan : '',
          lampiranUrl: form.lampiranUrl,
          lampiranNama: form.lampiranNama,
        });
        toast({ title: 'Tersimpan', description: 'Konten berhasil diperbarui.' });
      } else {
        await createKelasKonten({
          jenis: form.jenis,
          judul: form.judul,
          isi: form.isi,
          classId,
          mataPelajaranId: mapelId || null,
          periodeId: periodeId || null,
          status: form.status,
          batasPengumpulan: form.batasPengumpulan,
          lampiranUrl: form.lampiranUrl,
          lampiranNama: form.lampiranNama,
        });
        toast({ title: 'Tersimpan', description: 'Konten berhasil dibuat.' });
      }
      setIsFormOpen(false);
      setForm(formKosong);
      await muat();
    } catch (err) {
      toast({ title: 'Gagal menyimpan', description: getKelasKontenErrorMessage(err), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const ubahTerbit = async (row) => {
    setIsSaving(true);
    try {
      if (row.status === 'published') {
        await sembunyikanKelasKonten(row.id);
        toast({ title: 'Disembunyikan', description: 'Konten kembali menjadi draf.' });
      } else {
        await terbitkanKelasKonten(row.id);
        toast({ title: 'Diterbitkan', description: 'Murid kini dapat membacanya.' });
      }
      await muat();
    } catch (err) {
      toast({ title: 'Gagal', description: getKelasKontenErrorMessage(err), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const hapus = async () => {
    if (!hapusTarget) return;
    setIsSaving(true);
    try {
      await deleteKelasKonten(hapusTarget.id);
      toast({ title: 'Terhapus', description: 'Konten berhasil dihapus.' });
      setHapusTarget(null);
      await muat();
    } catch (err) {
      toast({ title: 'Gagal menghapus', description: getKelasKontenErrorMessage(err), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <section className="admin-card space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-6 w-56 admin-skeleton-shimmer" />
        <Skeleton className="h-10 rounded-xl admin-skeleton-shimmer" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl admin-skeleton-shimmer" />
        ))}
      </section>
    );
  }

  const tidakMengampu = kelasDiampu.length === 0;

  return (
    <section className="admin-card space-y-4 p-4" aria-labelledby="modul-konten-kelas">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="admin-panel-header-icon"><BookOpen /></div>
          <div>
            <h3 id="modul-konten-kelas" className="text-lg font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">
              Murid hanya membaca yang sudah diterbitkan
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={muat}>
            <RefreshCw className="mr-2 h-4 w-4" /> Muat ulang
          </Button>
          <Button type="button" size="sm" onClick={bukaTambah} disabled={tidakMengampu}>
            <Plus className="mr-2 h-4 w-4" /> Buat konten
          </Button>
        </div>
      </div>

      {error && (
        <div className="admin-error-state" role="alert">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {tidakMengampu ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Belum ada jadwal mengajar untuk periode ini, jadi belum ada kelas yang bisa diisi
          materi. Jadwal disusun admin di panel Jadwal Pelajaran.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Periode</span>
              <select value={periodeId} onChange={(e) => setPeriodeId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {periodeList.map((p) => <option key={p.id} value={p.id}>{getPeriodeLabel(p)}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Kelas</span>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {kelasDiampu.map((k) => <option key={k.id} value={k.id}>{k.nama}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Mata pelajaran</span>
              <select value={mapelId} onChange={(e) => setMapelId(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Tanpa mata pelajaran</option>
                {mapelDiampu.map((m) => <option key={m.id} value={m.id}>{m.nama}</option>)}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Jenis</span>
              <select value={filterJenis} onChange={(e) => setFilterJenis(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                <option value="">Semua jenis</option>
                {JENIS_KONTEN.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </label>
          </div>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada materi, tugas, atau pengumuman untuk kelas ini. Tekan
              &ldquo;Buat konten&rdquo; untuk memulai.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => {
                const Ikon = IKON_JENIS[row.jenis] || BookOpen;
                const terbit = row.status === 'published';
                return (
                  <li key={row.id} className="rounded-lg bg-muted/40 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex min-w-0 flex-1 gap-3">
                        <Ikon className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">{row.judul}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {getJenisLabel(row.jenis)}
                            {row.mata_pelajaran_nama ? ` · ${row.mata_pelajaran_nama}` : ''}
                            {' · '}
                            <span className={terbit ? 'font-semibold text-foreground' : ''}>
                              {getStatusLabel(row.status)}
                            </span>
                          </p>
                          {row.isi && (
                            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{row.isi}</p>
                          )}
                          {row.batas_pengumpulan && (
                            <p className="mt-1 text-xs font-medium text-foreground">
                              Batas pengumpulan: {formatTanggal(row.batas_pengumpulan)}
                            </p>
                          )}
                          {row.lampiran_url && (
                            <a
                              href={row.lampiran_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-flex items-center gap-1.5 text-xs font-medium text-primary underline"
                            >
                              <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
                              {row.lampiran_nama || 'Lampiran'}
                            </a>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => ubahTerbit(row)}
                          disabled={isSaving}
                          aria-label={terbit ? `Sembunyikan ${row.judul}` : `Terbitkan ${row.judul}`}
                          title={terbit ? 'Sembunyikan dari murid' : 'Terbitkan ke murid'}
                        >
                          {terbit ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => bukaEdit(row)} aria-label={`Edit ${row.judul}`}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon" onClick={() => setHapusTarget(row)} aria-label={`Hapus ${row.judul}`}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setForm(formKosong); } }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit konten' : 'Buat konten'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Jenis</span>
              <select
                value={form.jenis}
                onChange={(e) => setForm((f) => ({ ...f, jenis: e.target.value }))}
                disabled={Boolean(form.id)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              >
                {JENIS_KONTEN.map((j) => <option key={j.value} value={j.value}>{j.label}</option>)}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Judul</span>
              <Input value={form.judul} onChange={(e) => setForm((f) => ({ ...f, judul: e.target.value }))} />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Isi</span>
              <Textarea rows={5} value={form.isi} onChange={(e) => setForm((f) => ({ ...f, isi: e.target.value }))} />
            </label>

            {bolehPunyaBatas(form.jenis) && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase text-muted-foreground">Batas pengumpulan</span>
                <Input
                  type="datetime-local"
                  value={form.batasPengumpulan}
                  onChange={(e) => setForm((f) => ({ ...f, batasPengumpulan: e.target.value }))}
                />
              </label>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase text-muted-foreground">Tautan lampiran</span>
                <Input
                  type="url"
                  placeholder="https://..."
                  value={form.lampiranUrl}
                  onChange={(e) => setForm((f) => ({ ...f, lampiranUrl: e.target.value }))}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase text-muted-foreground">Nama lampiran</span>
                <Input
                  value={form.lampiranNama}
                  onChange={(e) => setForm((f) => ({ ...f, lampiranNama: e.target.value }))}
                  placeholder="Lembar kerja"
                />
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Lampiran berupa tautan, bukan unggahan berkas. Unggahan dokumen di sistem ini
              masih dibatasi untuk admin dan tata usaha.
            </p>

            {!form.id && (
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase text-muted-foreground">Status awal</span>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="draft">Draf — belum terlihat murid</option>
                  <option value="published">Terbit — langsung terlihat murid</option>
                </select>
              </label>
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setIsFormOpen(false); setForm(formKosong); }} disabled={isSaving}>
              Batal
            </Button>
            <Button type="button" onClick={simpan} disabled={isSaving}>
              {isSaving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(hapusTarget)} onOpenChange={(open) => { if (!open) setHapusTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus konten?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            &ldquo;{hapusTarget?.judul}&rdquo; akan dihapus permanen. Tindakan ini tidak dapat
            dibatalkan.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setHapusTarget(null)} disabled={isSaving}>
              Batal
            </Button>
            <Button type="button" variant="destructive" onClick={hapus} disabled={isSaving}>
              {isSaving ? 'Menghapus...' : 'Hapus'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default ModulKontenKelas;
