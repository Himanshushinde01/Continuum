// scripts/generate-icons.mjs
// Resizes icons/icon_source.png into all required Chrome extension sizes.
// Run with: node scripts/generate-icons.mjs

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const srcIcon = resolve(root, 'icons', 'icon_source.png');
const outDir = resolve(root, 'icons');

mkdirSync(outDir, { recursive: true });

const sizes = [16, 32, 48, 128];

for (const size of sizes) {
  await sharp(srcIcon)
    .resize(size, size, { fit: 'cover', position: 'center' })
    .png()
    .toFile(resolve(outDir, `icon${size}.png`));
  console.log(`✓ Generated icon${size}.png`);
}

console.log('\nAll icons generated in icons/');
