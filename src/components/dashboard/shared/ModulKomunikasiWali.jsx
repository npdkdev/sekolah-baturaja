import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, MessageCircle, RefreshCw, Search, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import useSchoolIdentity from '@/hooks/useSchoolIdentity';
import {
  TEMPLATE_PESAN,
  buatTautanWa,
  fetchKontakWali,
  getKontakWaliErrorMessage,
  isiTemplate,
  normalizeNomorWa,
  sebutanWali,
} from '@/lib/kontakWaliAdapters';

/**
 * Komunikasi guru dengan wali murid.
 *
 * Yang dilakukan panel ini hanya menyiapkan pesan dan membuka WhatsApp milik
 * guru dengan teks yang sudah terisi. **Tidak ada pesan yang terkirim dari
 * sini** — guru masih membaca dan menekan kirim sendiri di WhatsApp. Tidak ada
 * kredensial yang disimpan dan tidak ada layanan luar yang dipanggil.
 *
 * Nomor selalu datang dari basis data lewat `/api/kontak-wali`, yang membatasi
 * daftarnya pada murid di kelas yang benar-benar dipegang guru — baik sebagai
 * wali kelas maupun lewat jadwal mengajar.
 */
const ModulKomunikasiWali = ({ guruNama, title = 'Komunikasi dengan Wali' }) => {
  const { toast } = useToast();
  const sekolah = useSchoolIdentity();

  const [rows, setRows] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cari, setCari] = useState('');

  const [target, setTarget] = useState(null);
  const [templateKey, setTemplateKey] = useState(TEMPLATE_PESAN[0].key);
  const [pesan, setPesan] = useState('');

  const muat = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setRows(await fetchKontakWali({ limit: 200 }) || []);
    } catch (err) {
      setError(getKontakWaliErrorMessage(err));
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { muat(); }, [muat]);

  const terlihat = useMemo(() => {
    const kunci = cari.trim().toLowerCase();
    if (!kunci) return rows;
    return rows.filter((row) => (
      String(row.nama_lengkap || '').toLowerCase().includes(kunci)
      || String(row.nama_kelas || '').toLowerCase().includes(kunci)
      || String(row.nama_ayah || '').toLowerCase().includes(kunci)
      || String(row.nama_ibu || '').toLowerCase().includes(kunci)
    ));
  }, [rows, cari]);

  const tanpaNomor = useMemo(
    () => rows.filter((row) => !normalizeNomorWa(row.no_hp_ortu)).length,
    [rows],
  );

  const susunPesan = useCallback((row, key) => {
    const template = TEMPLATE_PESAN.find((t) => t.key === key) || TEMPLATE_PESAN[0];
    return isiTemplate(template.isi, {
      wali: sebutanWali(row),
      murid: row.nama_lengkap,
      kelas: row.nama_kelas,
      guru: guruNama || 'guru kelas',
      sekolah: sekolah.name,
    });
  }, [sekolah, guruNama]);

  const buka = (row) => {
    setTarget(row);
    setTemplateKey(TEMPLATE_PESAN[0].key);
    setPesan(susunPesan(row, TEMPLATE_PESAN[0].key));
  };

  const gantiTemplate = (key) => {
    setTemplateKey(key);
    if (target) setPesan(susunPesan(target, key));
  };

  const bukaWhatsApp = () => {
    if (!target) return;
    const tautan = buatTautanWa(target.no_hp_ortu, pesan);
    if (!tautan) {
      toast({
        title: 'Nomor tidak dapat dipakai',
        description: 'Nomor wali murid ini belum terisi atau formatnya tidak dikenali. '
          + 'Perbaiki lewat panel Data Murid.',
        variant: 'destructive',
      });
      return;
    }
    window.open(tautan, '_blank', 'noopener,noreferrer');
    setTarget(null);
  };

  if (isLoading) {
    return (
      <section className="admin-card space-y-3 p-4" aria-busy="true">
        <Skeleton className="h-6 w-52 admin-skeleton-shimmer" />
        <Skeleton className="h-10 rounded-xl admin-skeleton-shimmer" />
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-xl admin-skeleton-shimmer" />
        ))}
      </section>
    );
  }

  return (
    <section className="admin-card space-y-4 p-4" aria-labelledby="modul-komunikasi-wali">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="admin-panel-header-icon"><MessageCircle /></div>
          <div>
            <h3 id="modul-komunikasi-wali" className="text-lg font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground">
              Hanya wali murid dari kelas yang Anda pegang
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={muat}>
          <RefreshCw className="mr-2 h-4 w-4" /> Muat ulang
        </Button>
      </div>

      {error && (
        <div className="admin-error-state" role="alert">
          <p className="text-sm font-medium">{error}</p>
        </div>
      )}

      {!error && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={cari}
              onChange={(e) => setCari(e.target.value)}
              placeholder="Cari nama murid, kelas, atau wali"
              className="pl-9"
              aria-label="Cari wali murid"
            />
          </div>

          {tanpaNomor > 0 && (
            <p className="flex items-start gap-2 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {tanpaNomor} murid belum punya nomor wali yang dapat dihubungi. Nomor diisi
              lewat panel Data Murid oleh admin atau tata usaha.
            </p>
          )}

          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Belum ada murid pada kelas yang Anda pegang. Penempatan murid dan kelas diatur
              admin.
            </p>
          ) : terlihat.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Tidak ada murid yang cocok dengan pencarian &ldquo;{cari}&rdquo;.
            </p>
          ) : (
            <ul className="space-y-2">
              {terlihat.map((row) => {
                const bisa = Boolean(normalizeNomorWa(row.no_hp_ortu));
                return (
                  <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">{row.nama_lengkap}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {row.nama_kelas || 'Tanpa kelas'} · Wali: {sebutanWali(row)}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {bisa ? row.no_hp_ortu : 'Nomor wali belum terisi'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={bisa ? 'default' : 'outline'}
                      onClick={() => buka(row)}
                      disabled={!bisa}
                      title={bisa ? 'Siapkan pesan WhatsApp' : 'Nomor wali belum terisi'}
                    >
                      <MessageCircle className="mr-2 h-4 w-4" /> Siapkan pesan
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pesan untuk wali {target?.nama_lengkap}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <p><strong className="text-foreground">Tujuan:</strong> {sebutanWali(target || {})} · {target?.no_hp_ortu}</p>
              <p className="mt-0.5"><strong className="text-foreground">Murid:</strong> {target?.nama_lengkap} · {target?.nama_kelas}</p>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Template</span>
              <select
                value={templateKey}
                onChange={(e) => gantiTemplate(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {TEMPLATE_PESAN.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium uppercase text-muted-foreground">Isi pesan</span>
              <Textarea rows={7} value={pesan} onChange={(e) => setPesan(e.target.value)} />
            </label>

            <p className="text-xs text-muted-foreground">
              Menekan tombol di bawah hanya membuka WhatsApp dengan pesan yang sudah terisi.
              Pesan <strong className="text-foreground">belum terkirim</strong> — Anda masih
              dapat membacanya sekali lagi dan menekan kirim sendiri di WhatsApp.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setTarget(null)}>Batal</Button>
            <Button type="button" onClick={bukaWhatsApp}>
              <Send className="mr-2 h-4 w-4" /> Buka WhatsApp
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default ModulKomunikasiWali;
