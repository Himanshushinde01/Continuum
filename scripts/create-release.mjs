// scripts/create-release.mjs
// Prepares a GitHub release:
// 1. Builds the extension
// 2. Creates contextbridge-extension.zip
// 3. Prints the git commands to tag and push the release
//
// Run with: node scripts/create-release.mjs

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// Read version from package.json
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
const version = pkg.version;
const zipName = `contextbridge-extension.zip`;

console.log(`\n🚀 Preparing ContextBridge v${version} release...\n`);

// 1. Run tests first
console.log('1️⃣  Running tests...');
execSync('npm test', { cwd: root, stdio: 'inherit' });

// 2. Build + zip
console.log('\n2️⃣  Building and packaging...');
execSync('node scripts/package-extension.mjs', { cwd: root, stdio: 'inherit' });

if (!existsSync(resolve(root, zipName))) {
  console.error(`\n❌ ${zipName} not found — build may have failed`);
  process.exit(1);
}

// 3. Print GitHub release steps
console.log(`
✅ Release prepared!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Files to upload to GitHub Release:
   ${zipName}  (the extension for users to download)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📋 Next steps to publish on GitHub:

1. Commit everything:
   git add -A
   git commit -m "chore: release v${version}"

2. Tag the release:
   git tag v${version}

3. Push to GitHub:
   git push origin main
   git push origin v${version}

4. On GitHub.com:
   → Go to your repo → Releases → "Draft a new release"
   → Tag: v${version}
   → Title: ContextBridge v${version}
   → Upload: ${zipName}
   → Click "Publish release"

That's it! Users can then download ${zipName} and load it as unpacked.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
