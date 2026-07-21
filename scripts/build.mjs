/**
 * scripts/build.mjs
 *
 * Three-pass build for the Continuum Chrome MV3 extension.
 *
 * WHY THREE PASSES?
 * ─────────────────
 * Vite (Rollup under the hood) uses a single output.format for all entries
 * in one build call. Chrome extensions need THREE different formats:
 *
 *   Popup          → ES module  (loaded via <script type="module">, code-splitting OK)
 *   Content script → IIFE       (Chrome runs content_scripts as classic scripts; any
 *                                bare `import` statement causes an immediate fatal error)
 *   Service worker → IIFE       (avoids needing "type":"module" in manifest background
 *                                block; simpler and equally functional)
 *
 * Pass 2 and 3 use inlineDynamicImports:true so ALL dependencies are bundled
 * into one file — no separate chunk imports, no bare `import` statements in output.
 */

import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

/** Path aliases — must match vite.config.ts */
const alias = {
  '@shared': resolve(root, 'src/shared'),
  '@core': resolve(root, 'src/core'),
  '@storage': resolve(root, 'src/storage'),
  '@content-scripts': resolve(root, 'src/content-scripts'),
  '@popup': resolve(root, 'src/popup'),
  '@types': resolve(root, 'src/types'),
};

const sharedBuildOptions = {
  minify: false,
  sourcemap: true,
  target: 'es2020',
  assetsInlineLimit: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// PASS 1 — Popup  (ES module, code-splitting allowed)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[1/3] Building popup (ES module + React)...');
await build({
  root,
  configFile: false,
  plugins: [react()],
  resolve: { alias },
  build: {
    ...sharedBuildOptions,
    outDir: 'dist',
    emptyOutDir: true,          // wipe dist/ clean on first pass only
    rollupOptions: {
      input: {
        popup: resolve(root, 'src/popup/popup.html'),
      },
      output: {
        format: 'es',           // ES module — popup.html loads it via <script type="module">
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: '[name][extname]',
      },
    },
  },
});
console.log('    ✓ dist/popup.js + dist/chunks/*');

// ─────────────────────────────────────────────────────────────────────────────
// PASS 2 — Content script  (IIFE, fully self-contained, no bare imports)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[2/3] Building content-entry (IIFE, inlineDynamicImports)...');
await build({
  root,
  configFile: false,
  resolve: { alias },
  build: {
    ...sharedBuildOptions,
    outDir: 'dist',
    emptyOutDir: false,         // never wipe — popup output must survive
    rollupOptions: {
      input: resolve(root, 'src/content-scripts/content-entry.ts'),
      output: {
        format: 'iife',
        name: 'ContinuumContent',   // required by Rollup for IIFE; not used at runtime
        inlineDynamicImports: true,     // bundle ALL deps into this one file, zero chunk imports
        entryFileNames: 'content-scripts/content-entry.js',
        // No chunkFileNames needed — inlineDynamicImports prevents any splitting
      },
    },
  },
});
console.log('    ✓ dist/content-scripts/content-entry.js  (zero import/export statements)');

// ─────────────────────────────────────────────────────────────────────────────
// PASS 3 — Background service worker  (IIFE, fully self-contained, no bare imports)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\n[3/3] Building service-worker (IIFE, inlineDynamicImports)...');
await build({
  root,
  configFile: false,
  resolve: { alias },
  build: {
    ...sharedBuildOptions,
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(root, 'src/background/service-worker.ts'),
      output: {
        format: 'iife',
        name: 'ContinuumServiceWorker',
        inlineDynamicImports: true,
        entryFileNames: 'background/service-worker.js',
      },
    },
  },
});
console.log('    ✓ dist/background/service-worker.js  (zero import/export statements)');

// ─────────────────────────────────────────────────────────────────────────────
// POST-PROCESSING — manifest, icons, popup.html path fix
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nPost-processing...');

// 1. Copy manifest.json
copyFileSync(resolve(root, 'manifest.json'), resolve(root, 'dist/manifest.json'));
console.log('    ✓ dist/manifest.json');

// 2. Copy PNG icons only (skip SVG source)
if (existsSync(resolve(root, 'icons'))) {
  mkdirSync(resolve(root, 'dist/icons'), { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const src = resolve(root, `icons/icon${size}.png`);
    if (existsSync(src)) {
      copyFileSync(src, resolve(root, `dist/icons/icon${size}.png`));
    }
  }
  console.log('    ✓ dist/icons/*.png');
}

// 3. Promote popup.html from dist/src/popup/ → dist/  and fix absolute → relative paths.
//    Chrome extensions cannot resolve /popup.js (root-relative); it must be ./popup.js.
const srcHtml = resolve(root, 'dist/src/popup/popup.html');
const destHtml = resolve(root, 'dist/popup.html');
if (existsSync(srcHtml)) {
  let html = readFileSync(srcHtml, 'utf-8');
  // Replace: src="/X" → src="./X"  and  href="/X" → href="./X"  (only single-slash, not //)
  html = html.replace(/(src|href)="\/((?!\/)[^"]*?)"/g, '$1="./$2"');
  writeFileSync(destHtml, html, 'utf-8');
  console.log('    ✓ dist/popup.html  (absolute → relative paths fixed)');
} else {
  // Fallback: popup.html may be at dist/ already when HTML is a flat entry
  if (existsSync(destHtml)) {
    let html = readFileSync(destHtml, 'utf-8');
    html = html.replace(/(src|href)="\/((?!\/)[^"]*?)"/g, '$1="./$2"');
    writeFileSync(destHtml, html, 'utf-8');
    console.log('    ✓ dist/popup.html  (paths fixed in-place)');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// VERIFICATION — grep for bare import/export in the two critical files
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nVerifying output...');

function verifyNoImports(file) {
  const filePath = resolve(root, file);
  if (!existsSync(filePath)) {
    console.error(`    ✗ MISSING: ${file}`);
    process.exit(1);
  }
  const contents = readFileSync(filePath, 'utf-8');
  const lines = contents.split('\n');
  const bad = lines.filter(l => /^\s*(import|export)\s/.test(l));
  if (bad.length > 0) {
    console.error(`    ✗ ${file} still has bare import/export statements!`);
    bad.slice(0, 3).forEach(l => console.error('      ' + l.slice(0, 120)));
    process.exit(1);
  }
  console.log(`    ✓ ${file}  — no bare import/export`);
}

verifyNoImports('dist/content-scripts/content-entry.js');
verifyNoImports('dist/background/service-worker.js');

console.log('\n✅ Build complete. dist/ is ready to load as unpacked in Chrome.\n');
