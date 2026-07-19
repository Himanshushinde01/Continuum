import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

/** Plugin: copy manifest.json, icons, and fix popup.html paths for Chrome extension */
function chromeExtensionPlugin() {
  return {
    name: 'chrome-extension-copy',
    closeBundle() {
      // Copy manifest
      copyFileSync('manifest.json', 'dist/manifest.json');

      // Copy icons (PNG files only, not the SVG source)
      if (existsSync('icons')) {
        mkdirSync('dist/icons', { recursive: true });
        for (const size of [16, 32, 48, 128]) {
          const src = `icons/icon${size}.png`;
          if (existsSync(src)) {
            copyFileSync(src, `dist/icons/icon${size}.png`);
          }
        }
      }

      // Copy popup.html from nested path to dist root
      const srcHtml = 'dist/src/popup/popup.html';
      const destHtml = 'dist/popup.html';
      if (existsSync(srcHtml)) {
        copyFileSync(srcHtml, destHtml);
      }

      // CRITICAL: Fix absolute paths in popup.html → relative paths
      // Chrome extensions cannot load /popup.js — it must be ./popup.js
      if (existsSync(destHtml)) {
        let html = readFileSync(destHtml, 'utf-8');
        // Replace absolute paths: src="/..." → src="./..."  and href="/..." → href="./..."
        html = html.replace(/(src|href)="\/((?!\/)[^"]*?)"/g, '$1="./$2"');
        writeFileSync(destHtml, html, 'utf-8');
        console.log('[chrome-extension-copy] Fixed absolute → relative paths in popup.html');
      }

      console.log('[chrome-extension-copy] manifest.json and icons copied to dist/');
    },
  };
}

export default defineConfig({
  plugins: [react(), chromeExtensionPlugin()],
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
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // CRITICAL for Chrome extensions: all asset paths must be relative (./popup.js not /popup.js)
    base: './',
    rollupOptions: {
      input: {
        // Popup entry — vite outputs this relative to the html location
        popup: resolve(__dirname, 'src/popup/popup.html'),
        // Background service worker
        'background/service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        // Content script
        'content-scripts/content-entry': resolve(__dirname, 'src/content-scripts/content-entry.ts'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
    assetsInlineLimit: 0,
    minify: false,
    sourcemap: true,
    target: 'es2020',
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['tests/setup.ts'],
    include: ['tests/unit/**/*.test.ts'],
  },
});
