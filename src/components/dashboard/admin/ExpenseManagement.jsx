import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertCircle, Download, Edit, FileText, Loader2, Plus, RefreshCw, Search, Trash2, TrendingDown, X } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import * as XLSX from 'xlsx';
import {
    buildExpenseUpdatePayload,
    createExpense,
    expenseCategories,
    expensePaymentMethods,
    fetchCashflowSummary,
    fetchExpensesByPeriod,
    formatRupiah,
    getLocalDateString,
    getFinanceErrorMessage,
    getMonthOptions,
    monthNames,
    softDeleteExpense,
    updateExpense
} from '@/lib/financeAdapters';

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 6 }, (_, i) => currentYear - i);
const monthOptions = getMonthOptions();
const getCurrentMonthFilter = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return {
        year,
        month: month + 1,
        dateFrom: getLocalDateString(new Date(year, month, 1)),
        dateTo: getLocalDateString(new Date(year, month + 1, 0)),
        search: ''
    };
};

const emptyForm = () => ({
    tanggal_pengeluaran: getLocalDateString(),
    kategori: expenseCategories[0],
    deskripsi: '',
    jumlah: '',
    metode_pembayaran: expensePaymentMethods[0],
    catatan: '',
    bukti_url: ''
});

const ExpenseManagement = () => {
    const { user } = useAuth();
    const [expenses, setExpenses] = useState([]);
    const [cashflow, setCashflow] = useState({
        totalPemasukan: 0,
        totalPengeluaran: 0,
        saldoBersih: 0,
        paymentCount: 0,
        expenseCount: 0
    });
    const [isLoading, setIsLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [formData, setFormData] = useState(emptyForm);
    const [formError, setFormError] = useState('');
    const [filter, setFilter] = useState(getCurrentMonthFilter);
    const [deletingExpense, setDeletingExpense] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchFinanceData = useCallback(async () => {
        setIsLoading(true);
        setLoadError('');
        try {
            const [expenseRows, summary] = await Promise.all([
                fetchExpensesByPeriod(filter),
                fetchCashflowSummary(filter)
            ]);
            setExpenses(expenseRows);
            setCashflow(summary);
        } catch (error) {
            const message = getFinanceErrorMessage(error);
            setLoadError(message);
            toast({
                title: 'Gagal memuat data keuangan',
                description: message,
                variant: 'destructive'
            });
        } finally {
            setIsLoading(false);
        }
    }, [filter.year, filter.month, filter.dateFrom, filter.dateTo]);

    useEffect(() => {
        fetchFinanceData();
    }, [fetchFinanceData]);

    const resetForm = () => {
        setFormData(emptyForm());
        setEditingExpense(null);
        setFormError('');
    };

    const handleAdd = () => {
        resetForm();
        setIsFormOpen(true);
    };

    const handleEdit = (expense) => {
        setEditingExpense(expense);
        setFormData({
            tanggal_pengeluaran: expense.tanggal_pengeluaran,
            kategori: expense.kategori || expenseCategories[0],
            deskripsi: expense.deskripsi || '',
            jumlah: String(expense.jumlah || ''),
            metode_pembayaran: expense.metode_pembayaran || expensePaymentMethods[0],
            catatan: expense.catatan || '',
            bukti_url: expense.bukti_url || ''
        });
        setFormError('');
        setIsFormOpen(true);
    };

    const requestDelete = (expense) => {
        setDeletingExpense(expense);
    };

    const handleConfirmDelete = async () => {
        if (!deletingExpense) return;
        setIsDeleting(true);
        try {
            await softDeleteExpense(deletingExpense.id);
            await fetchFinanceData();
            toast({ title: 'Berhasil', description: 'Data pengeluaran telah dihapus.' });
            setDeletingExpense(null);
        } catch (error) {
            toast({
                title: 'Gagal menghapus',
                description: getFinanceErrorMessage(error),
                variant: 'destructive'
            });
        } finally {
            setIsDeleting(false);
        }
    };

    const handleInputChange = (e) => {
        const { id, value } = e.target;
        setFormData((prev) => ({ ...prev, [id]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setFormError('');
        setIsSaving(true);

        try {
            if (editingExpense) {
                const changedFields = buildExpenseUpdatePayload(formData, editingExpense);
                if (Object.keys(changedFields).length === 0) {
                    setFormError('Belum ada perubahan yang perlu disimpan.');
                    return;
                }
                await updateExpense(editingExpense.id, formData, user?.id, editingExpense);
            } else {
                await createExpense(formData, user?.id);
            }

            await fetchFinanceData();
            toast({ title: 'Berhasil', description: 'Data pengeluaran berhasil disimpan.' });
            setIsFormOpen(false);
            resetForm();
        } catch (error) {
            const message = getFinanceErrorMessage(error);
            setFormError(message);
            toast({
                title: 'Gagal menyimpan',
                description: message,
                variant: 'destructive'
            });
        } finally {
            setIsSaving(false);
        }
    };

    const visibleExpenses = useMemo(() => {
        const term = filter.search.trim().toLocaleLowerCase('id-ID');
        if (!term) return expenses;
        return expenses.filter((expense) => [
            expense.tanggal_pengeluaran,
            expense.kategori,
            expense.deskripsi,
            expense.metode_pembayaran,
            expense.catatan
        ].some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(term)));
    }, [expenses, filter.search]);

    const dailyTotals = useMemo(() => {
        const totals = new Map();
        visibleExpenses.forEach((expense) => {
            const date = expense.tanggal_pengeluaran;
            const current = totals.get(date) || { date, total: 0, count: 0 };
            current.total += Number(expense.jumlah || 0);
            current.count += 1;
            totals.set(date, current);
        });
        return Array.from(totals.values()).sort((a, b) => b.date.localeCompare(a.date));
    }, [visibleExpenses]);

    const totalVisibleExpense = useMemo(
        () => visibleExpenses.reduce((total, expense) => total + Number(expense.jumlah || 0), 0),
        [visibleExpenses]
    );
    const hasCustomDates = Boolean(filter.dateFrom || filter.dateTo);
    const formatExpenseDate = (value, withYear = true) => {
        if (!value) return '-';
        const date = new Date(String(value) + 'T00:00:00');
        return new Intl.DateTimeFormat('id-ID', {
            day: '2-digit',
            month: 'short',
            ...(withYear ? { year: 'numeric' } : {})
        }).format(date);
    };

    const handleExport = () => {
        const dataToExport = visibleExpenses.map((expense) => ({
            Tanggal: expense.tanggal_pengeluaran,
            Kategori: expense.kategori,
            Keterangan: expense.deskripsi,
            Metode_Pembayaran: expense.metode_pembayaran || '',
            Catatan: expense.catatan || '',
            Bukti_Transaksi: expense.bukti_url || '',
            Jumlah: Number(expense.jumlah || 0)
        }));
        const worksheet = XLSX.utils.json_to_sheet(dataToExport);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Pengeluaran');
        const monthLabel = hasCustomDates ? 'Kustom' : (filter.month === 'all' ? 'Semua' : monthNames[Number(filter.month) - 1]);
        XLSX.writeFile(workbook, `Pengeluaran_${filter.year}_${monthLabel}.xlsx`);
    };

    const chartData = useMemo(() => {
        const monthlyTotals = Array(12).fill(0);
        visibleExpenses.forEach((expense) => {
            const date = new Date(`${expense.tanggal_pengeluaran}T00:00:00`);
            if (date.getFullYear() === Number(filter.year)) {
                monthlyTotals[date.getMonth()] += Number(expense.jumlah || 0);
            }
        });
        return monthNames.map((month, index) => ({
            name: month.slice(0, 3),
            Pengeluaran: monthlyTotals[index]
        }));
    }, [visibleExpenses, filter.year]);

    return (
        <div className="space-y-6">
            <div className="admin-panel-header">
                <div className="flex items-center gap-3">
                    <div className="admin-panel-header-icon">
                        <TrendingDown />
                    </div>
                    <div className="admin-panel-header-text">
                        <h2>Pengeluaran Harian</h2>
                        <p>Catat, telusuri, dan pantau pengeluaran operasional dalam satu alur.</p>
                    </div>
                </div>
                <div className="admin-panel-header-actions">
                    <div className="admin-action-cluster">
                        <button onClick={fetchFinanceData} className="admin-action-cluster-btn" disabled={isLoading}>
                            <RefreshCw className="w-3.5 h-3.5" /> Muat Ulang
                        </button>
                        <button onClick={handleExport} className="admin-action-cluster-btn" disabled={visibleExpenses.length === 0}>
                            <Download className="w-3.5 h-3.5" /> Export
                        </button>
                    </div>
                    <button onClick={handleAdd} className="admin-panel-primary-btn">
                        <Plus className="w-4 h-4" /> Tambah Pengeluaran
                    </button>
                </div>
            </div>

            <div className="admin-filter-bar">
                <div className="admin-search-input w-full md:min-w-[220px]" role="search">
                    <Search aria-hidden="true" />
                    <input
                        type="search"
                        value={filter.search}
                        onChange={(event) => setFilter((prev) => ({ ...prev, search: event.target.value }))}
                        placeholder="Cari deskripsi, kategori, metode..."
                        aria-label="Cari pengeluaran"
                    />
                </div>
                <div className="grid w-full grid-cols-2 gap-2 md:w-[17rem]">
                    <Select value={String(filter.year)} onValueChange={(value) => setFilter((prev) => ({ ...prev, year: Number(value), dateFrom: '', dateTo: '' }))}>
                        <SelectTrigger aria-label="Pilih tahun"><SelectValue /></SelectTrigger>
                        <SelectContent>{years.map((year) => <SelectItem key={year} value={String(year)}>{year}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={String(filter.month)} onValueChange={(value) => setFilter((prev) => ({ ...prev, month: value === 'all' ? 'all' : Number(value), dateFrom: '', dateTo: '' }))}>
                        <SelectTrigger aria-label="Pilih bulan"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Semua bulan</SelectItem>
                            {monthOptions.map((month) => <SelectItem key={month.value} value={String(month.value)}>{month.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:w-[19rem]">
                    <label className="flex min-w-0 flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Dari</span>
                        <Input type="date" value={filter.dateFrom} onChange={(event) => setFilter((prev) => ({ ...prev, dateFrom: event.target.value }))} aria-label="Tanggal mulai" />
                    </label>
                    <label className="flex min-w-0 flex-col gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Sampai</span>
                        <Input type="date" value={filter.dateTo} onChange={(event) => setFilter((prev) => ({ ...prev, dateTo: event.target.value }))} aria-label="Tanggal akhir" />
                    </label>
                </div>
                {hasCustomDates && (
                    <Button type="button" variant="ghost" size="sm" className="shrink-0" onClick={() => setFilter((prev) => ({ ...prev, dateFrom: '', dateTo: '' }))}>
                        <X className="mr-1.5 h-3.5 w-3.5" /> Reset tanggal
                    </Button>
                )}
            </div>

            {loadError && (
                <div className="admin-error-state" role="alert">
                    <p className="text-sm font-medium">{loadError}</p>
                    <Button variant="outline" size="sm" onClick={fetchFinanceData} disabled={isLoading}>Coba Lagi</Button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="admin-stat-card admin-stat-card--accent">
                    <p className="admin-stat-card-label">Pemasukan</p>
                    <p className="admin-stat-card-value">{formatRupiah(cashflow.totalPemasukan)}</p>
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--admin-text-muted))' }}>{cashflow.paymentCount} pembayaran aktif</p>
                </div>
                <div className="admin-stat-card" style={{ borderColor: 'hsl(0 84% 60% / 0.2)', backgroundColor: 'hsl(0 84% 60% / 0.04)' }}>
                    <p className="admin-stat-card-label">Pengeluaran terlihat</p>
                    <p className="admin-stat-card-value">{formatRupiah(totalVisibleExpense)}</p>
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--admin-text-muted))' }}>{visibleExpenses.length} transaksi terlihat · {cashflow.expenseCount} total periode</p>
                </div>
                <div className="admin-stat-card admin-stat-card--amber">
                    <p className="admin-stat-card-label">Saldo Bersih</p>
                    <p className="admin-stat-card-value">{formatRupiah(cashflow.saldoBersih)}</p>
                    <p className="text-xs mt-1" style={{ color: 'hsl(var(--admin-text-muted))' }}>Pemasukan dikurangi pengeluaran</p>
                </div>
            </div>

            {!isLoading && dailyTotals.length > 0 && (
                <section className="admin-form-section">
                    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-semibold text-[hsl(var(--admin-text-primary))]">Ringkasan total harian</h3>
                            <p className="mt-1 text-xs text-[hsl(var(--admin-text-muted))]">Total nominal per tanggal berdasarkan periode dan pencarian aktif.</p>
                        </div>
                        <span className="rounded-full bg-[hsl(var(--admin-accent-soft))] px-2.5 py-1 text-xs font-semibold text-[hsl(var(--admin-accent))]">{dailyTotals.length} hari aktif</span>
                    </div>
                    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                        {dailyTotals.map(({ date, total, count }) => (
                            <div key={date} className="rounded-xl border border-[hsl(var(--admin-border-subtle))] bg-[hsl(var(--admin-surface-sunken)/.45)] p-3">
                                <p className="text-xs font-semibold text-[hsl(var(--admin-text-secondary))]">{formatExpenseDate(date)}</p>
                                <p className="mt-2 text-sm font-bold text-[hsl(var(--admin-text-primary))]">{formatRupiah(total)}</p>
                                <p className="mt-1 text-[11px] text-[hsl(var(--admin-text-muted))]">{count} transaksi</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis tickFormatter={(value) => `Rp${(value / 1000).toLocaleString('id-ID')}k`} />
                        <Tooltip formatter={(value) => formatRupiah(value)} />
                        <Legend />
                        <Line type="monotone" dataKey="Pengeluaran" stroke="#ef4444" activeDot={{ r: 8 }} />
                    </LineChart>
                </ResponsiveContainer>
            </div>

            <div className="admin-table-shell">
                <div className="admin-table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <th>Tanggal</th>
                                <th>Kategori</th>
                                <th>Deskripsi</th>
                                <th>Metode</th>
                                <th>Nominal</th>
                                <th>Bukti</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr>
                                    <td colSpan="7" className="py-10 text-center text-muted-foreground">
                                        <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                                        Memuat pengeluaran...
                                    </td>
                                </tr>
                            ) : visibleExpenses.length === 0 ? (
                                <tr>
                                    <td colSpan="7">
                                        <div className="admin-table-empty">
                                            <TrendingDown />
                                            <p>{filter.search ? 'Tidak ada pengeluaran yang cocok dengan pencarian.' : 'Belum ada pengeluaran pada periode ini.'}</p>
                                            {filter.search && (
                                                <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setFilter((prev) => ({ ...prev, search: '' }))}>
                                                    Bersihkan pencarian
                                                </Button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ) : visibleExpenses.map((expense) => (
                                <tr key={expense.id}>
                                    <td className="whitespace-nowrap">{formatExpenseDate(expense.tanggal_pengeluaran)}</td>
                                    <td><span className="rounded-full bg-[hsl(var(--admin-accent-soft))] px-2 py-1 text-xs font-medium">{expense.kategori || 'Lainnya'}</span></td>
                                    <td className="max-w-[18rem]">
                                        <p className="font-medium">{expense.deskripsi || '-'}</p>
                                        {expense.catatan && <p className="mt-1 max-w-[16rem] truncate text-xs text-muted-foreground" title={expense.catatan}>{expense.catatan}</p>}
                                    </td>
                                    <td className="whitespace-nowrap text-sm">{expense.metode_pembayaran || '-'}</td>
                                    <td className="whitespace-nowrap font-semibold">{formatRupiah(expense.jumlah)}</td>
                                    <td>
                                        {expense.bukti_url ? (
                                            <a href={expense.bukti_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-[hsl(var(--admin-accent))] hover:underline" title="Buka bukti transaksi">
                                                <FileText className="h-3.5 w-3.5" /> Lihat
                                            </a>
                                        ) : <span className="text-muted-foreground">-</span>}
                                    </td>
                                    <td>
                                        <div className="flex gap-1">
                                            <Button type="button" size="icon" variant="outline" onClick={() => handleEdit(expense)} aria-label="Edit pengeluaran" title="Edit pengeluaran">
                                                <Edit className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" size="icon" variant="ghost" className="text-destructive hover:bg-destructive/10" onClick={() => requestDelete(expense)} aria-label="Hapus pengeluaran" title="Hapus pengeluaran">
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <Dialog
                open={isFormOpen}
                onOpenChange={(open) => {
                    if (isSaving) return;
                    setIsFormOpen(open);
                    if (!open) resetForm();
                }}
            >
                <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>{editingExpense ? 'Edit Pengeluaran' : 'Tambah Pengeluaran Baru'}</DialogTitle>
                        <DialogDescription>Lengkapi detail transaksi agar pencatatan harian mudah ditelusuri.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {formError && (
                            <div className="admin-error-state" role="alert">
                                <AlertCircle className="admin-error-state-icon" />
                                <p className="text-sm">{formError}</p>
                            </div>
                        )}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="admin-form-label" htmlFor="tanggal_pengeluaran">Tanggal <span className="text-destructive">*</span></label>
                                <Input id="tanggal_pengeluaran" type="date" value={formData.tanggal_pengeluaran} onChange={handleInputChange} required />
                            </div>
                            <div>
                                <label className="admin-form-label" htmlFor="kategori">Kategori <span className="text-destructive">*</span></label>
                                <Select value={formData.kategori} onValueChange={(value) => setFormData((prev) => ({ ...prev, kategori: value }))}>
                                    <SelectTrigger id="kategori"><SelectValue placeholder="Pilih kategori" /></SelectTrigger>
                                    <SelectContent>{expenseCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <label className="admin-form-label" htmlFor="deskripsi">Deskripsi <span className="text-destructive">*</span></label>
                            <Textarea id="deskripsi" value={formData.deskripsi} onChange={handleInputChange} required placeholder="Contoh: Pembelian alat tulis kantor" />
                        </div>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label className="admin-form-label" htmlFor="jumlah">Nominal (Rp) <span className="text-destructive">*</span></label>
                                <Input id="jumlah" type="number" min="1" max="9999999999.99" step="0.01" value={formData.jumlah} onChange={handleInputChange} required inputMode="decimal" />
                            </div>
                            <div>
                                <label className="admin-form-label" htmlFor="metode_pembayaran">Metode pembayaran</label>
                                <Select value={formData.metode_pembayaran || expensePaymentMethods[0]} onValueChange={(value) => setFormData((prev) => ({ ...prev, metode_pembayaran: value }))}>
                                    <SelectTrigger id="metode_pembayaran"><SelectValue placeholder="Pilih metode" /></SelectTrigger>
                                    <SelectContent>{expensePaymentMethods.map((method) => <SelectItem key={method} value={method}>{method}</SelectItem>)}</SelectContent>
                                </Select>
                            </div>
                        </div>
                        <div>
                            <label className="admin-form-label" htmlFor="catatan">Catatan <span className="font-normal text-muted-foreground">(opsional)</span></label>
                            <Textarea id="catatan" rows={3} value={formData.catatan} onChange={handleInputChange} placeholder="Tambahkan catatan atau referensi transaksi..." />
                        </div>
                        <div>
                            <label className="admin-form-label" htmlFor="bukti_url">Bukti transaksi <span className="font-normal text-muted-foreground">(opsional)</span></label>
                            <Input id="bukti_url" type="text" value={formData.bukti_url} onChange={handleInputChange} placeholder="https://... atau /files/..." />
                            <p className="admin-form-helper">Gunakan URL atau path file bukti yang sudah tersedia.</p>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsFormOpen(false)} disabled={isSaving}>Batal</Button>
                            <Button type="submit" disabled={isSaving}>
                                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                {isSaving ? 'Menyimpan...' : editingExpense ? 'Simpan perubahan' : 'Simpan pengeluaran'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
            <AlertDialog
                open={Boolean(deletingExpense)}
                onOpenChange={(open) => {
                    if (!open && !isDeleting) setDeletingExpense(null);
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Hapus pengeluaran?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Data <span className="font-semibold">{deletingExpense?.deskripsi || 'ini'}</span> akan diarsipkan dan tidak lagi muncul pada rekap aktif. Tindakan ini tidak dapat dibatalkan dari panel.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Batal</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(event) => {
                                event.preventDefault();
                                handleConfirmDelete();
                            }}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {isDeleting ? 'Menghapus...' : 'Ya, hapus'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default ExpenseManagement;
