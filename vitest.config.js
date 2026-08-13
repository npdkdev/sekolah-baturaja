import path from 'node:path';
import { defineConfig } from 'vitest/config';

// Konfigurasi tes terpisah dari vite.config.js.
//
// vite.config.js memuat plugin visual-editor dan selection-mode yang hanya
// relevan untuk dev server; memuatnya di test runner cuma memperlambat dan
// menambah titik gagal. Yang benar-benar dibutuhkan tes adalah alias `@`,
// karena src/lib saling mengimpor lewat alias itu — alasan kenapa skrip
// assertion lama tidak pernah bisa dijalankan Node polos.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
