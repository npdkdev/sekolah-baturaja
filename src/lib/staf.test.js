import { describe, expect, it } from 'vitest';

import { inisialNama, labelStafRole, sebutanStaf, stafKe } from '@/lib/staf';

describe('sebutanStaf', () => {
  it('menerjemahkan label Pentashih lama secara case-insensitive', () => {
    expect(labelStafRole('Pentashih')).toBe('Wakil Kepala Sekolah');
    expect(labelStafRole('pentashih')).toBe('Wakil Kepala Sekolah');
    expect(sebutanStaf({ jabatan: 'Pentashih', roles: ['Pentashih'] }))
      .toBe('Wakil Kepala Sekolah');
  });

  it('memakai jabatan bila diisi', () => {
    expect(sebutanStaf({ jabatan: 'Guru Kelas I', roles: ['Pengajar'] })).toBe('Guru Kelas I');
  });

  it('jatuh ke peran ketika jabatan kosong', () => {
    expect(sebutanStaf({ jabatan: '', roles: ['Pengajar'] })).toBe('Guru');
    expect(sebutanStaf({ roles: ['Tata Usaha'] })).toBe('Tata Usaha');
  });

  // 'Pentashih' tetap nilai tersimpan di basis data; hanya labelnya diterjemahkan.
  it('menerjemahkan Pentashih menjadi Wakil Kepala Sekolah', () => {
    expect(sebutanStaf({ roles: ['Pentashih'] })).toBe('Wakil Kepala Sekolah');
  });

  it('memakai peran apa adanya bila belum ada terjemahannya', () => {
    expect(sebutanStaf({ roles: ['Staff Operasional'] })).toBe('Staff Operasional');
  });

  it('tidak pernah mengembalikan teks kosong', () => {
    expect(sebutanStaf({})).toBe('Staf sekolah');
    expect(sebutanStaf({ jabatan: '   ', roles: [] })).toBe('Staf sekolah');
    expect(sebutanStaf(null)).toBe('Staf sekolah');
    expect(sebutanStaf({ roles: 'bukan array' })).toBe('Staf sekolah');
  });
});

describe('inisialNama', () => {
  it('mengambil dua huruf awal dari kata berkapital', () => {
    expect(inisialNama('Siti Aminah')).toBe('SA');
    expect(inisialNama('Lestari Ningsih Wijaya')).toBe('LN');
  });

  // Gelar dan kata sambung tidak boleh ikut jadi inisial.
  it('melewati gelar dan kata sambung', () => {
    expect(inisialNama('Hj. Rosmiati')).toBe('HR');
    expect(inisialNama('ahmad Zulkarnain')).toBe('Z');
  });

  it('tahan terhadap spasi ganda', () => {
    expect(inisialNama('  Ratna   Dewi  ')).toBe('RD');
  });

  it('memberi tanda pisah ketika tidak ada yang cocok', () => {
    expect(inisialNama('')).toBe('—');
    expect(inisialNama(null)).toBe('—');
    expect(inisialNama('123')).toBe('—');
  });
});

describe('stafKe', () => {
  const daftar = [{ nama: 'A' }, { nama: 'B' }, { nama: 'C' }];

  it('berputar ketika indeks melewati panjang daftar', () => {
    expect(stafKe(daftar, 0).nama).toBe('A');
    expect(stafKe(daftar, 3).nama).toBe('A');
    expect(stafKe(daftar, 4).nama).toBe('B');
  });

  // Mengembalikan null, bukan objek kosong: pemanggilnya menahan diri menampilkan
  // baris "Pendamping" atau nama penulis daripada menampilkannya tanpa isi.
  it('mengembalikan null untuk daftar kosong atau bukan array', () => {
    expect(stafKe([], 0)).toBeNull();
    expect(stafKe(null, 0)).toBeNull();
    expect(stafKe(undefined, 2)).toBeNull();
  });
});
