import apiClient from '@/lib/apiClient';

export const expenseCategories = [
    'Operasional',
    'Konsumsi',
    'Acara',
    'Perawatan',
    'Transportasi',
    'Administrasi',
    'Promosi/Marketing',
    'Donasi/Sosial',
    'Inventaris',
    'Teknologi',
    'Lainnya'
];

export const expensePaymentMethods = [
    'Tunai',
    'Transfer',
    'QRIS',
    'Debit/Kartu',
    'Lainnya'
];

export const monthNames = [
    'Januari',
    'Februari',
    'Maret',
    'April',
    'Mei',
    'Juni',
    'Juli',
    'Agustus',
    'September',
    'Oktober',
    'November',
    'Desember'
];

export const FINANCE_DATA_CHANGED_EVENT = 'school:finance-data-changed';

// Calendar dates in the finance UI must follow the browser's local timezone.
// Using toISOString() here would move dates around midnight back to the
// previous day when the user is east of UTC.
export const getLocalDateString = (date = new Date()) => {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
        throw new Error('Tanggal tidak valid.');
    }
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const notifyFinanceDataChanged = (detail = {}) => {
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(FINANCE_DATA_CHANGED_EVENT, { detail }));
    }
};

export const EXPENSE_AMOUNT_MAX = 9999999999.99;

export const getMonthOptions = () => monthNames.map((label, index) => ({
    label,
    value: index + 1
}));

export const getPeriodDateRange = ({ year, month = 'all' }) => {
    const selectedYear = Number(year);
    if (!Number.isInteger(selectedYear)) {
        throw new Error('Tahun tidak valid.');
    }

    if (month === 'all') {
        return {
            startDate: `${selectedYear}-01-01`,
            endDate: `${selectedYear}-12-31`
        };
    }

    const selectedMonth = Number(month);
    if (!Number.isInteger(selectedMonth) || selectedMonth < 1 || selectedMonth > 12) {
        throw new Error('Bulan tidak valid.');
    }

    const start = new Date(selectedYear, selectedMonth - 1, 1);
    const end = new Date(selectedYear, selectedMonth, 0);
    return {
        startDate: getLocalDateString(start),
        endDate: getLocalDateString(end)
    };
};

const isValidExpenseDate = (value) => {
    const dateValue = String(value || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return false;
    const [year, month, day] = dateValue.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
};

export const getExpenseDateRange = ({ year, month = 'all', dateFrom = '', dateTo = '' }) => {
    const start = String(dateFrom || '').trim();
    const end = String(dateTo || '').trim();
    if (!start && !end) return getPeriodDateRange({ year, month });

    const startDate = start || end;
    const endDate = end || start;
    if (!isValidExpenseDate(startDate) || !isValidExpenseDate(endDate)) {
        throw new Error('Rentang tanggal pengeluaran tidak valid.');
    }
    if (startDate > endDate) {
        throw new Error('Tanggal mulai tidak boleh melewati tanggal akhir.');
    }
    return { startDate, endDate };
};

export const parseCurrencyAmount = (value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error('Nominal wajib lebih besar dari nol.');
    }
    if (amount > EXPENSE_AMOUNT_MAX) {
        throw new Error('Nominal melebihi batas yang dapat disimpan.');
    }
    return Math.round(amount * 100) / 100;
};

export const formatRupiah = (value) => `Rp ${Number(value || 0).toLocaleString('id-ID')}`;

const normalizeOptionalExpenseText = (value, label, maxLength) => {
    const normalized = String(value ?? '').trim();
    if (!normalized) return null;
    if ([...normalized].length > maxLength) {
        throw new Error(`${label} terlalu panjang.`);
    }
    return normalized;
};

export const normalizeExpensePayload = (formData, userId) => {
    const dateValue = String(formData?.tanggal_pengeluaran || '').trim();
    if (!isValidExpenseDate(dateValue)) {
        throw new Error('Tanggal pengeluaran wajib valid.');
    }

    const jumlah = parseCurrencyAmount(formData.jumlah);
    const kategori = String(formData.kategori || '').trim();
    const deskripsi = String(formData.deskripsi || '').trim();

    const metode_pembayaran = normalizeOptionalExpenseText(formData.metode_pembayaran, 'Metode pembayaran', 40);
    const catatan = normalizeOptionalExpenseText(formData.catatan, 'Catatan pengeluaran', 1000);
    const bukti_url = normalizeOptionalExpenseText(formData.bukti_url, 'Bukti transaksi', 2000);
    if (bukti_url && !/^(https?:\/\/|\/)/i.test(bukti_url)) {
        throw new Error('Bukti transaksi harus berupa URL atau path file yang valid.');
    }

    if (!kategori) {
        throw new Error('Kategori pengeluaran wajib diisi.');
    }

    if (!deskripsi) {
        throw new Error('Keterangan pengeluaran wajib diisi.');
    }

    return {
        tanggal_pengeluaran: dateValue,
        kategori,
        deskripsi,
        jumlah,
        metode_pembayaran,
        catatan,
        bukti_url,
        updated_by: userId || null
    };
};

// Expenses live under /api/payments/expenses — that is where the Go handler
// mounts them, there is no top-level /api/expenses route.
export const fetchExpensesByPeriod = async ({ year, month = 'all', dateFrom = '', dateTo = '' }) => {
    const { startDate, endDate } = getExpenseDateRange({ year, month, dateFrom, dateTo });
    const params = new URLSearchParams({ date_from: startDate, date_to: endDate });
    const data = await apiClient.get(`/api/payments/expenses?${params.toString()}`);
    return data || [];
};

export const createExpense = async (formData, userId) => {
    // created_by/updated_by are stamped server-side from the JWT.
    const { updated_by: _ignored, ...payload } = normalizeExpensePayload(formData, userId);
    const data = await apiClient.post('/api/payments/expenses', payload);
    notifyFinanceDataChanged({ type: 'expense', action: 'created' });
    return data;
};

const expenseUpdateFields = [
    'tanggal_pengeluaran',
    'kategori',
    'deskripsi',
    'jumlah',
    'metode_pembayaran',
    'catatan',
    'bukti_url'
];

export const buildExpenseUpdatePayload = (formData, previousExpense = {}) => {
    const { updated_by: _ignored, ...normalized } = normalizeExpensePayload(formData);
    return expenseUpdateFields.reduce((payload, field) => {
        const next = normalized[field] ?? null;
        const previous = previousExpense?.[field] ?? null;
        const nextComparable = field === 'jumlah' ? Number(next) : String(next ?? '').trim();
        const previousComparable = field === 'jumlah' ? Number(previous) : String(previous ?? '').trim();
        if (nextComparable !== previousComparable) {
            payload[field] = next === null ? '' : next;
        }
        return payload;
    }, {});
};

export const updateExpense = async (id, formData, userId, previousExpense = null) => {
    const payload = previousExpense ? buildExpenseUpdatePayload(formData, previousExpense) : (() => {
        const { updated_by: _ignored, ...fullPayload } = normalizeExpensePayload(formData, userId);
        return fullPayload;
    })();
    if (Object.keys(payload).length === 0) return previousExpense;
    const data = await apiClient.patch(`/api/payments/expenses/${id}`, payload);
    notifyFinanceDataChanged({ type: 'expense', action: 'updated', id });
    return data;
};

// The endpoint soft-deletes (sets deleted_at), matching the previous behaviour.
export const softDeleteExpense = async (id) => {
    await apiClient.delete(`/api/payments/expenses/${id}`);
    notifyFinanceDataChanged({ type: 'expense', action: 'deleted', id });
};

// Totals are summed in Postgres now, so the client no longer pages through
// every payment row. Returns the same shape the dashboards already read.
export const fetchCashflowSummary = async ({ year, month = 'all', dateFrom = '', dateTo = '' }) => {
    const selectedYear = Number(year);
    const params = new URLSearchParams({ year: String(selectedYear) });
    params.set('month', month === 'all' ? 'all' : String(Number(month)));
    if (dateFrom || dateTo) {
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
    }

    const summary = await apiClient.get(`/api/payments/cashflow?${params.toString()}`);

    return {
        totalPemasukan: Number(summary?.totalPemasukan || 0),
        totalPengeluaran: Number(summary?.totalPengeluaran || 0),
        saldoBersih: Number(summary?.saldoBersih || 0),
        paymentCount: Number(summary?.paymentCount || 0),
        expenseCount: Number(summary?.expenseCount || 0)
    };
};

export const getFinanceErrorMessage = (error) => {
    const message = String(error?.message || error || '');
    if (message.includes('row-level security') || error?.code === '42501') {
        return 'Anda tidak memiliki akses untuk mengelola data keuangan ini.';
    }
    if (message.includes('jumlah') || message.includes('Nominal')) {
        if (message.includes('melebihi')) return 'Nominal melebihi batas yang dapat disimpan.';
        return 'Nominal wajib lebih besar dari nol.';
    }
    if (message.includes('tanggal')) return 'Tanggal pengeluaran harus valid.';
    if (message.includes('kategori')) return 'Kategori pengeluaran wajib diisi.';
    if (message.includes('keterangan')) return 'Keterangan pengeluaran wajib diisi.';
    if (message.includes('metode pembayaran')) return 'Metode pembayaran harus valid.';
    if (message.includes('catatan')) return 'Catatan pengeluaran terlalu panjang.';
    if (message.includes('bukti transaksi')) return 'Bukti transaksi harus berupa URL atau path file yang valid.';
    if (message.includes('rentang') || message.includes('mulai')) return 'Periksa kembali rentang tanggal pengeluaran.';
    if (message.includes('tidak berubah')) return 'Belum ada perubahan yang disimpan.';
    return message || 'Operasi keuangan gagal.';
};
