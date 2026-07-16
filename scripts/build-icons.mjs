#!/usr/bin/env node
/**
 * 从 build/icon-source.png 生成 Windows / Web / 托盘图标。
 * 触发：node scripts/build-icons.mjs
 */

import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const sourceCandidates = [
  path.join(projectRoot, 'build', 'icon-source.png'),
  path.join(projectRoot, 'build', 'icon.png'),
];

const source = sourceCandidates.find((p) => existsSync(p));
if (!source) {
  console.error('[build-icons] FATAL: place icon at build/icon-source.png');
  process.exit(1);
}

const buildDir = path.join(projectRoot, 'build');
const publicDir = path.join(projectRoot, 'public');
mkdirSync(buildDir, { recursive: true });
mkdirSync(publicDir, { recursive: true });

const icon512 = path.join(buildDir, 'icon.png');
const trayIcon = path.join(buildDir, 'tray-icon.png');
const publicIcon = path.join(publicDir, 'icon.png');
const brandLogo = path.join(publicDir, 'brand-logo.png');
const iconIco = path.join(buildDir, 'icon.ico');

async function writeSquarePng(outPath, size) {
  await sharp(source)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
}

console.log('[build-icons] source:', source);

await writeSquarePng(icon512, 512);
await writeSquarePng(publicIcon, 512);
await writeSquarePng(brandLogo, 512);
await writeSquarePng(trayIcon, 32);

const icoSizes = [16, 32, 48, 64, 128, 256];
const icoBuffers = await Promise.all(
  icoSizes.map((size) =>
    sharp(source)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer(),
  ),
);

const icoBuffer = await pngToIco(icoBuffers);
await import('node:fs/promises').then((fs) => fs.writeFile(iconIco, icoBuffer));

const iconIcns = path.join(buildDir, 'icon.icns');
if (process.platform === 'darwin') {
  const { mkdirSync: mk, rmSync, writeFileSync } = await import('node:fs');
  const { spawnSync } = await import('node:child_process');
  const iconset = path.join(buildDir, 'icon.iconset');
  rmSync(iconset, { recursive: true, force: true });
  mk(iconset, { recursive: true });

  const icnsSizes = [
    [16, 'icon_16x16.png'],
    [32, 'diana.s@example.org'],
    [32, 'icon_32x32.png'],
    [64, 'ivan.p@example.net'],
    [128, 'icon_128x128.png'],
    [256, 'wendy.h@example.net'],
    [256, 'icon_256x256.png'],
    [512, 'wendy.h@example.net'],
    [512, 'icon_512x512.png'],
    [1024, 'walt.e@example.net'],
  ];
  for (const [size, name] of icnsSizes) {
    const buf = await sharp(source)
      .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer();
    writeFileSync(path.join(iconset, name), buf);
  }
  const r = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', iconIcns], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error('[build-icons] iconutil failed — Mac DMG needs build/icon.icns');
    process.exit(1);
  }
  rmSync(iconset, { recursive: true, force: true });
} else {
  console.log('[build-icons] skip .icns (not darwin; generate on macOS CI via icons:build)');
}

console.log('[build-icons] OK:');
console.log('  ', iconIco);
if (process.platform === 'darwin') console.log('  ', iconIcns);
console.log('  ', icon512);
console.log('  ', trayIcon);
console.log('  ', publicIcon);
console.log('  ', brandLogo);
