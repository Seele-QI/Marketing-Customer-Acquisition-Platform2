#!/usr/bin/env node
/**
 * 为已打包的 win-unpacked exe 写入图标（绕过 winCodeSign 解压权限问题）。
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rcedit } from 'rcedit';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release', 'win-unpacked');
const iconPath = path.join(projectRoot, 'build', 'icon.ico');
const packageJson = JSON.parse(
  readFileSync(path.join(projectRoot, 'package.json'), 'utf8'),
);
const version = packageJson.version;

if (!existsSync(iconPath)) {
  console.error('[patch-exe-icon] missing', iconPath);
  process.exit(1);
}

if (!existsSync(releaseDir)) {
  console.error('[patch-exe-icon] missing', releaseDir);
  process.exit(1);
}

const exe = readdirSync(releaseDir).find((f) => f.endsWith('.exe'));
if (!exe) {
  console.error('[patch-exe-icon] no .exe in', releaseDir);
  process.exit(1);
}

const exePath = path.join(releaseDir, exe);
console.log('[patch-exe-icon] patching', exePath);
await rcedit(exePath, {
  icon: iconPath,
  'file-version': version,
  'product-version': version,
  'version-string': {
    CompanyName: '招财猫',
    FileDescription: '招财猫 AI 营销获客中台',
    FileVersion: version,
    InternalName: '招财猫',
    LegalCopyright: 'Copyright © 2026 招财猫',
    OriginalFilename: exe,
    ProductName: '招财猫',
    ProductVersion: version,
  },
});
console.log('[patch-exe-icon] OK');
