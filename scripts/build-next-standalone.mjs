#!/usr/bin/env node
/**
 * 构建 Next.js standalone 并拷贝到 resources/next-standalone/
 *
 * 流程：
 * 1. 跑 `pnpm build`（产出 .next/standalone）
 * 2. 复制 .next/standalone → resources/next-standalone/
 * 3. 复制 .next/static → resources/next-standalone/.next/static
 * 4. 复制 public/ → resources/next-standalone/public
 * 5. 复制项目根 main.py → resources/main.py
 * 6. 复制 routes/ → resources/routes/
 * 7. 复制 assets/bgm → resources/bgm
 *
 * 触发：`pnpm resources:build`
 */

import { existsSync, mkdirSync, cpSync, rmSync, statSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const standaloneSrc = path.join(projectRoot, '.next', 'standalone');
const staticSrc = path.join(projectRoot, '.next', 'static');
const publicSrc = path.join(projectRoot, 'public');
const bgmSrc = path.join(projectRoot, 'assets', 'bgm');
const mainPySrc = path.join(projectRoot, 'main.py');
const routesSrc = path.join(projectRoot, 'routes');

const target = path.join(projectRoot, 'resources', 'next-standalone');
const targetStatic = path.join(target, '.next', 'static');
const targetPublic = path.join(target, 'public');
const targetBgm = path.join(projectRoot, 'resources', 'bgm');
const targetMainPy = path.join(projectRoot, 'resources', 'main.py');
const targetRoutes = path.join(projectRoot, 'resources', 'routes');

console.log('[build-next-standalone] starting...');

/* ============ Step 1: pnpm build ============ */

async function runBuild() {
  console.log('[build-next-standalone] running pnpm build...');
  return new Promise((resolve, reject) => {
    const child = spawn('pnpm', ['build'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`pnpm build exit ${code}`));
    });
    child.on('error', reject);
  });
}

if (!existsSync(standaloneSrc)) {
  await runBuild();
}

if (!existsSync(standaloneSrc)) {
  console.error(`[build-next-standalone] FAIL: ${standaloneSrc} still missing after build`);
  process.exit(1);
}

/* ============ Step 2-4: 拷贝 ============ */

console.log(`[build-next-standalone] copying standalone → ${target}`);
if (existsSync(target)) rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(standaloneSrc, target, { recursive: true });

// .next/static 必须单独拷贝（Next standalone 不包含）
if (existsSync(staticSrc)) {
  console.log(`[build-next-standalone] copying static → ${targetStatic}`);
  mkdirSync(targetStatic, { recursive: true });
  cpSync(staticSrc, targetStatic, { recursive: true });
}

// public/（Next standalone 不包含）
if (existsSync(publicSrc)) {
  console.log(`[build-next-standalone] copying public → ${targetPublic}`);
  mkdirSync(targetPublic, { recursive: true });
  cpSync(publicSrc, targetPublic, { recursive: true });
}

/* ============ Step 5: main.py 复制 ============ */

console.log(`[build-next-standalone] copying main.py → ${targetMainPy}`);
if (existsSync(mainPySrc)) {
  cpSync(mainPySrc, targetMainPy);
} else {
  console.error(`[build-next-standalone] WARN: ${mainPySrc} not found`);
}

/* ============ Step 6: routes/ 复制 ============ */

console.log(`[build-next-standalone] copying routes/ → ${targetRoutes}`);
if (existsSync(routesSrc)) {
  if (existsSync(targetRoutes)) rmSync(targetRoutes, { recursive: true, force: true });
  cpSync(routesSrc, targetRoutes, { recursive: true });
} else {
  console.error(`[build-next-standalone] WARN: ${routesSrc} not found`);
}

/* ============ Step 7: BGM 复制 ============ */

console.log(`[build-next-standalone] copying bgm → ${targetBgm}`);
if (existsSync(bgmSrc)) {
  if (existsSync(targetBgm)) rmSync(targetBgm, { recursive: true, force: true });
  mkdirSync(targetBgm, { recursive: true });
  for (const f of readdirSync(bgmSrc)) {
    if (f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.aac') || f.endsWith('.m4a')) {
      cpSync(path.join(bgmSrc, f), path.join(targetBgm, f));
    }
  }
}

/* ============ 报告 ============ */

const totalSize = dirSize(target);
const bgmSize = existsSync(targetBgm) ? dirSize(targetBgm) : 0;
const mainPySize = existsSync(targetMainPy) ? statSync(targetMainPy).size : 0;
console.log(
  `[build-next-standalone] OK: standalone=${(totalSize / 1024 / 1024).toFixed(1)}MB, ` +
    `bgm=${(bgmSize / 1024 / 1024).toFixed(1)}MB, ` +
    `main.py=${(mainPySize / 1024).toFixed(1)}KB`,
);

function dirSize(p) {
  let total = 0;
  for (const e of readdirSync(p, { withFileTypes: true })) {
    const sub = path.join(p, e.name);
    if (e.isDirectory()) total += dirSize(sub);
    else total += statSync(sub).size;
  }
  return total;
}