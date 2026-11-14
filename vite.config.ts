import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Project Pages: https://ryanbondur.github.io/Daggah/
  base: '/Daggah/',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
