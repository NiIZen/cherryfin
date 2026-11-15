import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Older webOS engines do not load ES modules over file://, which is exactly how TV apps start.
 * The TV build therefore uses a classic script and no CORS attributes.
 */
const classicScript = (): Plugin => ({
  name: 'cherryfin-classic-script',
  enforce: 'post',
  transformIndexHtml: {
    order: 'post',
    handler: (html) => html.replace(/<script type="module" crossorigin/g, '<script defer').replace(/ crossorigin/g, ''),
  },
});

export default defineConfig(({ mode }) => ({
  // Relative paths so the build also loads over file:// in Electron and on the TV.
  base: './',
  plugins: mode === 'webos' ? [react(), classicScript()] : [react()],
  server: { port: 5173, strictPort: true },
  build: mode === 'webos'
    // webOS 5 from 2020 uses Chromium 68. The syntax is transpiled to match.
    ? {
        outDir: 'dist-webos',
        target: 'chrome68',
        cssTarget: 'chrome68',
        chunkSizeWarningLimit: 1500,
        modulePreload: false,
        rollupOptions: { output: { format: 'iife' as const } },
      }
    : { outDir: 'dist', chunkSizeWarningLimit: 1200 },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
}));
