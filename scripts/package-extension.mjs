// scripts/package-extension.mjs
// Builds the extension and creates a dist.zip ready for Chrome Web Store upload.
// Run with: node scripts/package-extension.mjs

import { execSync } from 'child_process';
import { createWriteStream, existsSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const distDir = resolve(root, 'dist');
const zipPath = resolve(root, 'continuum-extension.zip');

// 1. Build
console.log('📦 Building extension...');
execSync('npm run build', { cwd: root, stdio: 'inherit' });

// 2. Create zip using PowerShell's Compress-Archive (Windows)
console.log('\n🗜  Creating ZIP...');
execSync(
  `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipPath}' -Force"`,
  { cwd: root, stdio: 'inherit' }
);

console.log(`\n✅ Extension packaged: continuum-extension.zip`);
console.log(`   Upload this file to: https://chrome.google.com/webstore/devconsole`);
