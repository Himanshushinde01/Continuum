import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

/**
 * vite.config.ts — used for:
 *   - `npm test` (vitest picks this up automatically)
 *   - `npm run dev` (popup hot-reload only, not for building the extension)
 *
 * THE ACTUAL EXTENSION BUILD is in scripts/build.mjs
 * which runs three separate passes:
 *   1. Popup  → ES module (code-splitting OK, loaded via <script type="module">)
 *   2. Content script → IIFE, inlineDynamicImports:true  (Chrome classic script context)
 *   3. Service worker → IIFE, inlineDynamicImports:true  (Chrome SW context)
 *
 * Keeping content-entry and service-worker as ES modules here would cause
 * "Cannot use import statement outside a module" — Chrome runs content_scripts
 * as classic scripts, not modules, and SW IIFE avoids the type:module restriction.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': resolve(__dirname, 'src/shared'),
      '@core': resolve(__dirname, 'src/core'),
      '@storage': resolve(__dirname, 'src/storage'),
      '@content-scripts': resolve(__dirname, 'src/content-scripts'),
      '@popup': resolve(__dirname, 'src/popup'),
      '@types': resolve(__dirname, 'src/types'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
  },
});
