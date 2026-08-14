import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCheck, Inbox, Loader2, Mail, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/use-toast';
import {
  deleteFeedback,
  fetchAdminFeedbacks,
  getPublicContentErrorMessage,
  updateFeedbackStatus,
} from '@/lib/publicContentAdapters';

const STATUS_OPTIONS = [
  { value: 'new', label: 'Baru', className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200' },
  { value: 'reviewed', label: 'Ditindaklanjuti', className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200' },
  { value: 'closed', label: 'Selesai', className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200' },
  { value: 'spam', label: 'Spam', className: 'border-red-200 bg-red-50 text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200' },
];

const statusMeta = (value) => STATUS_OPTIONS.find((item) => item.value === value) || STATUS_OPTIONS[0];

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
};

const FeedbackInboxPanel = () => {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('all');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [updatingId, setUpdatingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setItems(await fetchAdminFeedbacks());
    } catch (error) {
      setLoadError(getPublicContentErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => STATUS_OPTIONS.reduce((result, option) => ({
    ...result,
    [option.value]: items.filter((item) => item.status === option.value).length,
  }), {}), [items]);

  const filteredItems = useMemo(() => (
    filter === 'all' ? items : items.filter((item) => item.status === filter)
  ), [filter, items]);

  const handleStatusChange = async (item, status) => {
    if (!status || status === item.status) return;
    setUpdatingId(item.id);
    try {
      const saved = await updateFeedbackStatus(item.id, status);
      setItems((previous) => previous.map((current) => (current.id === item.id ? { ...current, ...saved, status } : current)));
      toast({ title: 'Status pesan diperbarui', description: `${statusMeta(status).label} disimpan.` });
    } catch (error) {
      toast({ title: 'Gagal memperbarui status', description: getPublicContentErrorMessage(error), variant: 'destructive' });
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (item) => {
    if (!window.confirm(`Hapus pesan dari ${item.nama || 'pengunjung'}?`)) return;
    setDeletingId(item.id);
    try {
      await deleteFeedback(item.id);
      setItems((previous) => previous.filter((current) => current.id !== item.id));
      toast({ title: 'Pesan dihapus', description: 'Pesan tidak lagi tampil di kotak masuk.' });
    } catch (error) {
      toast({ title: 'Gagal menghapus pesan', description: getPublicContentErrorMessage(error), variant: 'destructive' });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="space-y-5 rounded-lg border bg-muted/20 p-4 sm:p-6" aria-labelledby="pesan-masuk">
      <div className="flex flex-col gap-4 border-b pb-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="admin-panel-header-icon"><Inbox aria-hidden="true" /></div>
          <div>
            <h4 id="pesan-masuk" className="text-xl font-black text-foreground sm:text-2xl">Pesan Masuk</h4>
            <p className="mt-1 text-sm text-muted-foreground">Tinjau, tandai, dan arsipkan pesan dari formulir publik halaman Kontak.</p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={load} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} /> Muat ulang
        </Button>
      </div>

      {loadError && (
        <div className="admin-error-state flex flex-wrap items-center justify-between gap-3" role="alert">
          <p className="text-sm font-medium">Gagal memuat pesan: {loadError}</p>
          <Button type="button" size="sm" variant="outline" onClick={load}>Coba lagi</Button>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" aria-label="Ringkasan status pesan">
          <span className="rounded-full border bg-background px-3 py-1.5 text-xs font-semibold text-muted-foreground">Semua {items.length}</span>
          {STATUS_OPTIONS.map((option) => <span key={option.value} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${option.className}`}>{option.label} {counts[option.value] || 0}</span>)}
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-full bg-background sm:w-48" aria-label="Filter status pesan"><SelectValue placeholder="Filter status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Semua pesan</SelectItem>
            {STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Memuat pesan">
          {Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-xl admin-skeleton-shimmer" />)}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-background/60 px-5 py-12 text-center">
          <Mail className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 font-semibold text-foreground">{items.length === 0 ? 'Belum ada pesan masuk.' : 'Tidak ada pesan dengan filter ini.'}</p>
          <p className="mt-1 text-sm text-muted-foreground">Pesan dari pengunjung akan muncul di sini setelah formulir Kontak dikirim.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const meta = statusMeta(item.status);
            const isUpdating = updatingId === item.id;
            return (
              <article key={item.id} className="admin-card space-y-4 bg-background p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h5 className="truncate text-base font-bold text-foreground">{item.nama || 'Anonim'}</h5>
                      <span className={`rounded-full border px-2 py-0.5 text-[11px] font-bold ${meta.className}`}>{meta.label}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{formatDate(item.created_at)} · {item.email || 'Tanpa email'} · {item.phone || 'Tanpa telepon'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Select value={item.status || 'new'} onValueChange={(value) => handleStatusChange(item, value)} disabled={isUpdating}>
                      <SelectTrigger className="h-9 w-40 bg-background" aria-label={`Status pesan dari ${item.nama || 'anonim'}`}>
                        {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" aria-label="Menyimpan status" /> : <SelectValue />}
                      </SelectTrigger>
                      <SelectContent>{STATUS_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(item)} disabled={deletingId === item.id} aria-label={`Hapus pesan dari ${item.nama || 'anonim'}`}>
                      {deletingId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-destructive" />}
                    </Button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap rounded-lg border bg-muted/20 p-3 text-sm leading-6 text-foreground">{item.message}</p>
                {item.status === 'closed' && <p className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300"><CheckCheck className="h-4 w-4" /> Pesan ini sudah ditandai selesai.</p>}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default FeedbackInboxPanel;
