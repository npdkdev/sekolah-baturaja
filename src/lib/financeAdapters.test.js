import { describe, expect, it } from 'vitest';
import {
  buildExpenseUpdatePayload,
  FINANCE_DATA_CHANGED_EVENT,
  getExpenseDateRange,
  getLocalDateString,
  getPeriodDateRange,
  notifyFinanceDataChanged,
  normalizeExpensePayload,
} from '@/lib/financeAdapters';

describe('finance date and expense contracts', () => {
  it('formats the local calendar date without a UTC shift', () => {
    expect(getLocalDateString(new Date(2026, 7, 9, 0, 15))).toBe('2026-08-09');
  });

  it('builds an inclusive month filter in the local calendar', () => {
    expect(getPeriodDateRange({ year: 2028, month: 2 })).toEqual({
      startDate: '2028-02-01',
      endDate: '2028-02-29',
    });
  });

  it('builds a valid custom daily period and rejects reversed dates', () => {
    expect(getExpenseDateRange({
      year: 2028,
      month: 2,
      dateFrom: '2028-02-29',
      dateTo: '2028-02-29',
    })).toEqual({
      startDate: '2028-02-29',
      endDate: '2028-02-29',
    });

    expect(() => getExpenseDateRange({
      year: 2028,
      month: 2,
      dateFrom: '2028-03-02',
      dateTo: '2028-03-01',
    })).toThrow('Tanggal mulai tidak boleh melewati tanggal akhir.');
  });

  it('normalizes a valid expense payload and rejects missing details', () => {
    expect(normalizeExpensePayload({
      tanggal_pengeluaran: '2026-08-09',
      kategori: ' Operasional ',
      deskripsi: ' Listrik ',
      jumlah: '125000',
      metode_pembayaran: ' Transfer ',
      catatan: ' Listrik bulan ini ',
      bukti_url: ' /files/proof.pdf ',
    })).toMatchObject({
      tanggal_pengeluaran: '2026-08-09',
      kategori: 'Operasional',
      deskripsi: 'Listrik',
      jumlah: 125000,
      metode_pembayaran: 'Transfer',
      catatan: 'Listrik bulan ini',
      bukti_url: '/files/proof.pdf',
    });

    expect(() => normalizeExpensePayload({
      tanggal_pengeluaran: '2026-08-09',
      kategori: 'Operasional',
      deskripsi: '',
      jumlah: 100,
    })).toThrow('Keterangan pengeluaran wajib diisi.');
  });

  it('builds a partial payload and preserves unchanged values', () => {
    const formData = {
      tanggal_pengeluaran: '2026-08-09',
      kategori: 'Operasional',
      deskripsi: 'Listrik',
      jumlah: '150000',
      metode_pembayaran: 'Transfer',
      catatan: '',
      bukti_url: '/files/proof.pdf',
    };
    expect(buildExpenseUpdatePayload(formData, {
      tanggal_pengeluaran: '2026-08-09',
      kategori: 'Operasional',
      deskripsi: 'Listrik',
      jumlah: 125000,
      metode_pembayaran: 'Transfer',
      catatan: 'Catatan lama',
      bukti_url: '/files/proof.pdf',
    })).toEqual({
      jumlah: 150000,
      catatan: '',
    });
  });

  it('notifies mounted dashboard consumers after a finance mutation', () => {
    let received = null;
    const listener = (event) => { received = event.detail; };
    window.addEventListener(FINANCE_DATA_CHANGED_EVENT, listener);
    notifyFinanceDataChanged({ type: 'payment', action: 'created' });
    window.removeEventListener(FINANCE_DATA_CHANGED_EVENT, listener);

    expect(received).toEqual({ type: 'payment', action: 'created' });
  });
});
