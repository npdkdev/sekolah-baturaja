import { describe, expect, it } from 'vitest';

import { normalizeAttendanceSessionName } from '@/utils/AttendanceStatusLogic';

// Diport dari scripts/test-attendance-first-record.mjs. Sesi disimpan sebagai
// indeks numerik di sebagian data lama dan sebagai nama di data baru; salah
// memetakan berarti absensi tercatat di sesi yang keliru dan rekap ikut salah.
describe('normalizeAttendanceSessionName', () => {
  it('memetakan indeks numerik ke nama sesi', () => {
    expect(normalizeAttendanceSessionName('0')).toBe('Pagi');
    expect(normalizeAttendanceSessionName('3')).toBe('Sore');
  });

  it('membiarkan nama sesi yang sudah benar', () => {
    expect(normalizeAttendanceSessionName('Pagi')).toBe('Pagi');
    expect(normalizeAttendanceSessionName('Sore')).toBe('Sore');
  });
});
