import { beforeEach, describe, expect, it, vi } from 'vitest';

// API_URL dibaca dari import.meta.env saat modul dimuat, jadi tiap kasus perlu
// evaluasi ulang modulnya dengan env yang sudah disetel.
const loadApiBase = async (value) => {
  if (value === undefined) {
    delete import.meta.env.VITE_API_URL;
  } else {
    import.meta.env.VITE_API_URL = value;
  }
  const { API_URL } = await import('@/lib/apiBase');
  return API_URL;
};

beforeEach(() => {
  vi.resetModules();
});

describe('API_URL', () => {
  // Ini alasan `??` dipakai, bukan `||`. Dengan `||`, nilai kosong akan jatuh ke
  // default localhost:8080 dan image produksi — yang menyetel VITE_API_URL=""
  // supaya frontend memanggil origin-nya sendiri — akan menembak host yang
  // salah dan seluruh permintaan gagal.
  it('memperlakukan nilai kosong sebagai same origin', async () => {
    expect(await loadApiBase('')).toBe('');
  });

  it('jatuh ke backend dev ketika variabel tidak diset', async () => {
    expect(await loadApiBase(undefined)).toBe('http://localhost:8080');
  });

  it('membuang trailing slash agar tidak terbentuk // pada URL', async () => {
    expect(await loadApiBase('https://api.contoh.id/')).toBe('https://api.contoh.id');
    expect(await loadApiBase('https://api.contoh.id///')).toBe('https://api.contoh.id');
  });

  it('membiarkan URL yang sudah rapi', async () => {
    expect(await loadApiBase('https://api.contoh.id')).toBe('https://api.contoh.id');
  });
});
