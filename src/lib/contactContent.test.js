import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONTACT_CONTENT,
  isContactOfficeOpen,
  normalizeContactContent,
  validateContactContent,
} from './contactContent';

describe('contactContent', () => {
  it('merges stored copy with safe defaults and normalizes lists', () => {
    const normalized = normalizeContactContent({
      heroTitle: 'Hubungi kami',
      roles: ['Orang tua', 'Orang tua', '  '],
      topics: ['Administrasi'],
      hours: [{ day: 'Senin', time: '08.00–12.00', dayIndex: [1] }],
    });

    expect(normalized.heroTitle).toBe('Hubungi kami');
    expect(normalized.heroAccent).toBe(DEFAULT_CONTACT_CONTENT.heroAccent);
    expect(normalized.roles).toEqual(['Orang tua']);
    expect(normalized.hours[0]).toEqual({ day: 'Senin', time: '08.00–12.00', dayIndex: [1] });
  });

  it('rejects required fields cleared in the editor', () => {
    expect(() => validateContactContent({ ...DEFAULT_CONTACT_CONTENT, formTitle: '   ' })).toThrow('Judul formulir Kontak wajib diisi.');
    expect(() => validateContactContent({ ...DEFAULT_CONTACT_CONTENT, roles: [] })).toThrow('Minimal satu pilihan peran harus tersedia.');
  });

  it('calculates open status from the managed hours', () => {
    const hours = [{ day: 'Senin', time: '08.00–12.00', dayIndex: [1] }];
    expect(isContactOfficeOpen(hours, new Date(2026, 0, 5, 9, 30))).toBe(true);
    expect(isContactOfficeOpen(hours, new Date(2026, 0, 5, 12, 0))).toBe(false);
    expect(isContactOfficeOpen(hours, new Date(2026, 0, 6, 9, 30))).toBe(false);
  });
});
