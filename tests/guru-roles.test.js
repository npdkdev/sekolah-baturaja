import { describe, expect, it } from 'vitest';

import { getOperationalRoleFromGuruForm, pickGuruProfileFields } from '@/lib/dataMasterAdapters';

// Diport dari scripts/test-admin-role-boundary.mjs, yang tidak pernah bisa
// dijalankan Node polos karena src/lib saling mengimpor lewat alias `@`.
//
// Yang dijaga di sini: peran operasional yang disimpan di user_profiles
// diturunkan dari centang peran di form guru. Salah memetakan berarti seseorang
// mendapat Dashboard Admin tanpa pernah dicentang sebagai admin.
describe('getOperationalRoleFromGuruForm', () => {
  it('memberi peran admin ketika Admin dicentang', () => {
    expect(getOperationalRoleFromGuruForm({ nama: 'Guru Uji', roles: ['Pengajar', 'Admin'] })).toBe('admin');
  });

  it('mendahulukan admin ketika Admin dan Pentashih dicentang bersamaan', () => {
    expect(getOperationalRoleFromGuruForm({ nama: 'Pentashih Uji', roles: ['Admin', 'Pentashih'] })).toBe('admin');
  });

  it('memberi peran pentashih ketika hanya Pentashih dicentang', () => {
    expect(getOperationalRoleFromGuruForm({ nama: 'Pentashih Uji', roles: ['Pentashih'] })).toBe('pentashih');
  });

  it('turun kembali ke guru ketika Admin dicabut', () => {
    expect(getOperationalRoleFromGuruForm({ nama: 'Guru Kembali', roles: ['Pengajar'] })).toBe('guru');
  });

  it('tidak menaikkan peran ketika daftar peran kosong', () => {
    expect(getOperationalRoleFromGuruForm({ nama: 'Tanpa Peran', roles: [] })).toBe('guru');
    expect(getOperationalRoleFromGuruForm({ nama: 'Tanpa Peran' })).toBe('guru');
  });
});

describe('pickGuruProfileFields', () => {
  it('meneruskan daftar peran apa adanya', () => {
    expect(pickGuruProfileFields({ nama: 'Guru Uji', roles: ['Pengajar', 'Admin'] }, 'admin').roles)
      .toEqual(['Pengajar', 'Admin']);
    expect(pickGuruProfileFields({ nama: 'Pentashih Uji', roles: ['Pentashih'] }, 'pentashih').roles)
      .toEqual(['Pentashih']);
  });
});
