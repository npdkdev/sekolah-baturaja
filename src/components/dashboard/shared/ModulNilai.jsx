import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import {
  fetchPeriodeList,
  fetchJadwalList,
  getPeriodeLabel,
} from '@/lib/scheduleAdapters';
import { fetchClassList } from '@/lib/dataMasterAdapters';
import {
  JENIS_ASESMEN_UMUM,
  createNilai,
  deleteNilai,
  fetchNilaiList,
  fetchNilaiSummary,
  formatSkor,
  getNilaiErrorMessage,
  isSkorValid,
  updateNilai,
} from '@/lib/nilaiAdapters';

/**
 * Modul nilai asesmen untuk guru.
 *
 * Kelas dan mata pelajaran yang bisa dipilih diturunkan dari `jadwal_pelajaran`
 * milik guru yang sedang masuk — sumber yang sama yang dipakai backend untuk
 * menolak permintaan. Menyaring dropdown di sini hanya soal kenyamanan; kalau
 * dilewati, `nilai.go` tetap menjawab 403.
 *
 * Jadwal mengajar sendiri tidak bisa disunting dari sini. Menyusun jadwal tetap
 * wewenang admin.
 */

const formKosong = {
  id: null,
  santriId: '',
  jenisAsesmen: 'Ulangan Harian',
  skor: '',
  catatan: '',
  tanggalAsesmen: '',
};

const ModulNilai = ({ guruId, title = 'Nilai Asesmen' }) => {
  const { toast } = useToast();

  const [periodeList, setPeriodeList] = useState([]);
  const [periodeId, setPeriodeId] = useState('');
  const [jadwal, setJadwal] = useState([]);
  const [kelasSantri, setKelasSantri] = useState({});
  const [classId, setClassId] = useState('');
  const [mapelId, setMapelId] = useState('');

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const [form, setForm] = useState(formKosong);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [hapusTarget, setHapusTarget] = useState(null);

  // --- Periode + jadwal guru ---
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
      const idPeriode = aktif?.id || '';
      setPeriodeId((sebelumnya) => sebelumnya || idPeriode);

      if (!idPeriode) {
        setJadwal([]);
        return;
      }
      const daftarJadwal = await fetchJadwalList({ periodeId: idPeriode, guruId });
      setJadwal(daftarJadwal || []);
    } catch (err) {
      setError(getNilaiErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [guruId]);

  useEffect(() => { muatDasar(); }, [muatDasar]);

  // Jadwal ikut berganti saat guru memilih periode lain.
  useEffect(() => {
    let hidup = true;
    if (!guruId || !periodeId) return undefined;
    fetchJadwalList({ periodeId, guruId })
      .then((data) => { if (hidup) setJadwal(data || []); })
      .catch((err) => { if (hidup) setError(getNilaiErrorMessage(err)); });
    return () => { hidup = false; };
  }, [guruId, periodeId]);

  // Kelas yang diampu, tanpa duplikat, diurutkan menurut namanya.
  const kelasDiampu = useMemo(() => {
    const peta = new Map();
    (jadwal || []).forEach((row) => {
      if (row?.class_id && !peta.has(row.class_id)) {
        peta.set(row.class_id, { id: row.class_id, nama: row.nama_kelas || 'Kelas' });
      }
    });
    return [...peta.values()].sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [jadwal]);

  // Mata pelajaran yang diampu di kelas terpilih saja.
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

  // Pilihan pertama diisikan sendiri supaya panel langsung berguna.
  useEffect(() => {
    if (!classId && kelasDiampu.length > 0) setClassId(kelasDiampu[0].id);
  }, [kelasDiampu, classId]);

  useEffect(() => {
    if (mapelDiampu.length === 0) {
      setMapelId('');
      return;
    }
    if (!mapelDiampu.some((m) => m.id === mapelId)) setMapelId(mapelDiampu[0].id);
  }, [mapelDiampu, mapelId]);

  // --- Daftar murid kelas terpilih ---
  useEffect(() => {
    let hidup = true;
    if (!classId || kelasSantri[classId]) return undefined;
    fetchClassList({ includeSantri: true, limit: 200 })
      .then((daftar) => {
        if (!hidup) return;
        const peta = {};
        (daftar || []).forEach((kelas) => {
          peta[kelas.id] = (kelas.santri || []).slice().sort(
            (a, b) => String(a.nama_lengkap || '').localeCompare(String(b.nama_lengkap || ''), 'id'),
          );
        });
        setKelasSantri((sebelumnya) => ({ ...sebelumnya, ...peta }));
      })
      .catch(() => { /* daftar murid kosong; form tetap bisa dibuka lewat pencarian manual */ });
    return () => { hidup = false; };
  }, [classId, kelasSantri]);

  const santriKelas = kelasSantri[classId] || [];

  // --- Nilai + ringkasan ---
  const muatNilai = useCallback(async () => {
    if (!periodeId || !classId || !mapelId) {
      setRows([]);
      setSummary([]);
      return;
    }
    setError(null);
    try {
      const filter = { periodeId, classId, mataPelajaranId: mapelId, limit: 200 };
      const [daftar, ringkas] = await Promise.all([
        fetchNilaiList(filter),
        fetchNilaiSummary(filter).catch(() => []),
      ]);
      setRows(daftar || []);
      setSummary(ringkas || []);
    } catch (err) {
      setError(getNilaiErrorMessage(err));
      setRows([]);
    }
  }, [periodeId, classId, mapelId]);

  useEffect(() => { muatNilai(); }, [muatNilai]);

  const bukaTambah = () => {
    setForm({ ...formKosong, santriId: santriKelas[0]?.id || '' });
    setIsFormOpen(true);
  };

  const bukaEdit = (row) => {
    setForm({
      id: row.id,
      santriId: row.santri_id,
      jenisAsesmen: row.jenis_asesmen || '',
      skor: row.skor ?? '',
      catatan: row.catatan || '',
      tanggalAsesmen: String(row.tanggal_asesmen || '').split('T')[0],
    });
    setIsFormOpen(true);
  };

  const simpan = async () => {
    if (!form.santriId) {
      toast({ title: 'Belum lengkap', description: 'Pilih murid terlebih dahulu.', variant: 'destructive' });
      return;
    }
    if (!String(form.jenisAsesmen || '').trim()) {
      toast({ title: 'Belum lengkap', description: 'Jenis asesmen wajib diisi.', variant: 'destructive' });
      return;
    }
    if (!isSkorValid(form.skor)) {
      toast({ title: 'Skor tidak valid', description: 'Skor harus berupa angka 0 sampai 100.', variant: 'destructive' });
      return;
    }

    setIsSaving(true);
    try {
      if (form.id) {
        await updateNilai(form.id, {
          skor: form.skor,
          jenisAsesmen: form.jenisAsesmen,
          catatan: form.catatan,
          tanggalAsesmen: form.tanggalAsesmen || undefined,
        });
        toast({ title: 'Tersimpan', description: 'Nilai berhasil diperbarui.' });
      } else {
        await createNilai({
          santriId: form.santriId,
          classId,
          mataPelajaranId: mapelId,
          periodeId,
          jenisAsesmen: form.jenisAsesmen,
          skor: form.skor,
          catatan: form.catatan,
          tanggalAsesmen: form.tanggalAsesmen || undefined,
        });
        toast({ title: 'Tersimpan', description: 'Nilai berhasil dicatat.' });
      }
      setIsFormOpen(false);
      setForm(formKosong);
      await muatNilai();
    } catch (err) {
      toast({ title: 'Gagal menyimpan', description: getNilaiErrorMessage(err), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  const hapus = async () => {
    if (!hapusTarget) return;
    setIsSaving(true);
    try {
      await deleteNilai(hapusTarget.id);
      toast({ title: 'Terhapus', description: 'Nilai berhasil dihapus.' });
      setHapusTarget(null);
      await muatNilai();
    } catch (err) {
      toast({ title: 'Gagal menghapus', description: getNilaiErrorMessage(err), variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <section className="admin-card space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-6 w-48 admin-skeleton-shimmer" />
        <Skeleton className="h-10 rounded-xl admin-skeleton-shimmer" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-xl admin-skeleton-shimmer" />
        ))}
      </section>
    );
  }

  const ringkasanTerpilih = summary[0] || null;
  const tidakMengampu = kelasDiampu.length === 0;

  return (
    <section className="admin-card space-y-4 p-4" aria-labelledby="modul-nilai">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="admin-panel-header-icon"><ClipboardList /></div>
          <div>
            <h3 id="modul-nilai" className="text-lg font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">
              Hanya kelas dan mata pelajaran yang Anda ampu
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={muatNilai}>
            <RefreshCw className="mr-2 h-4 w-4" /> Muat ulang
          </Button>
          <Button type="button" size="sm" onClick={bukaTambah} disabled={tidakMengampu || !mapelId}>
            <Plus className="mr-2 h-4 w-4" /> Tambah nilai
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
          Belum ada jadwal mengajar untuk periode ini, jadi belum ada mata pelajaran yang bisa
          dinilai. Jadwal disusun admin di panel Jadwal Pelajaran.
        </p>
      ) : (
        <>
          {/* Penyaring */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Periode</span>
              <select
                value={periodeId}
                onChange={(e) => setPeriodeId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {periodeList.map((p) => (
                  <option key={p.id} value={p.id}>{getPeriodeLabel(p)}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Kelas</span>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {kelasDiampu.map((k) => (
                  <option key={k.id} value={k.id}>{k.nama}</option>
                ))}
              </select>
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Mata pelajaran</span>
              <select
                value={mapelId}
                onChange={(e) => setMapelId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {mapelDiampu.map((m) => (
                  <option key={m.id} value={m.id}>{m.nama}</option>
                ))}
              </select>
            </label>
          </div>

          {/* Ringkasan */}
          {ringkasanTerpilih && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Jumlah nilai', value: ringkasanTerpilih.jumlah },
                { label: 'Rata-rata', value: formatSkor(ringkasanTerpilih.rata_rata) },
                { label: 'Terendah', value: formatSkor(ringkasanTerpilih.terendah) },
                { label: 'Tertinggi', value: formatSkor(ringkasanTerpilih.tertinggi) },
              ].map((item) => (
                <div key={item.label} className="rounded-xl border bg-muted/40 p-3 text-center">
                  <p className="text-xl font-bold text-foreground">{item.value}</p>
                  <p className="text-xs text-muted-foreground">{item.label}</p>
                </div>
              ))}
            </div>
          )}

          {/* Daftar nilai */}
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada nilai tercatat untuk mata pelajaran ini. Tekan &ldquo;Tambah nilai&rdquo;
              untuk mulai mencatat.
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{row.santri_nama}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {row.jenis_asesmen}
                      {row.tanggal_asesmen ? ` · ${String(row.tanggal_asesmen).split('T')[0]}` : ''}
                    </p>
                    {row.catatan && (
                      <p className="mt-1 text-xs italic text-muted-foreground">{row.catatan}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-lg font-bold text-foreground">{formatSkor(row.skor)}</span>
                    <Button type="button" variant="ghost" size="icon" onClick={() => bukaEdit(row)} aria-label={`Edit nilai ${row.santri_nama}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" onClick={() => setHapusTarget(row)} aria-label={`Hapus nilai ${row.santri_nama}`}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Form tambah / edit */}
      <Dialog open={isFormOpen} onOpenChange={(open) => { if (!open) { setIsFormOpen(false); setForm(formKosong); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{form.id ? 'Edit nilai' : 'Tambah nilai'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Murid</span>
              <select
                value={form.santriId}
                onChange={(e) => setForm((f) => ({ ...f, santriId: e.target.value }))}
                disabled={Boolean(form.id)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-60"
              >
                <option value="">Pilih murid</option>
                {santriKelas.map((s) => (
                  <option key={s.id} value={s.id}>{s.nama_lengkap}</option>
                ))}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Jenis asesmen</span>
              <Input
                list="jenis-asesmen-umum"
                value={form.jenisAsesmen}
                onChange={(e) => setForm((f) => ({ ...f, jenisAsesmen: e.target.value }))}
                placeholder="Ulangan Harian"
              />
              <datalist id="jenis-asesmen-umum">
                {JENIS_ASESMEN_UMUM.map((j) => <option key={j} value={j} />)}
              </datalist>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase text-muted-foreground">Skor (0–100)</span>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={form.skor}
                  onChange={(e) => setForm((f) => ({ ...f, skor: e.target.value }))}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-medium uppercase text-muted-foreground">Tanggal</span>
                <Input
                  type="date"
                  value={form.tanggalAsesmen}
                  onChange={(e) => setForm((f) => ({ ...f, tanggalAsesmen: e.target.value }))}
                />
              </label>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Catatan</span>
              <Textarea
                rows={3}
                value={form.catatan}
                onChange={(e) => setForm((f) => ({ ...f, catatan: e.target.value }))}
                placeholder="Umpan balik untuk murid (opsional)"
              />
            </label>
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

      {/* Konfirmasi hapus */}
      <Dialog open={Boolean(hapusTarget)} onOpenChange={(open) => { if (!open) setHapusTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hapus nilai?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Nilai {hapusTarget?.jenis_asesmen} milik {hapusTarget?.santri_nama} akan dihapus
            permanen. Tindakan ini tidak dapat dibatalkan.
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

export default ModulNilai;
