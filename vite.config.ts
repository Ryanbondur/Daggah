import { defineConfig } from 'vitest/config';

// Default `/` for root hosts (e.g. https://daggah.apps.grok.bot).
// GitHub Pages overrides via `vite build --base /Daggah/` in deploy-pages.yml.
export default defineConfig({
  base: '/',
  build: {
    chunkSizeWarningLimit: 2000,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
