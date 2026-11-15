import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Ältere webOS-Engines laden ES-Module nicht über file://, und genau so starten TV-Apps.
 * Der TV-Build nutzt deshalb ein klassisches Skript und keine CORS-Attribute.
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
  // Relative Pfade, damit der Build auch über file:// aus Electron und auf dem Fernseher lädt.
  base: './',
  plugins: mode === 'webos' ? [react(), classicScript()] : [react()],
  server: { port: 5173, strictPort: true },
  build: mode === 'webos'
    // webOS 5 aus dem Jahr 2020 nutzt Chromium 68. Die Syntax wird passend übersetzt.
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
