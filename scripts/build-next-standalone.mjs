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

import { existsSync, mkdirSync, cpSync, rmSync, statSync, readdirSync, realpathSync } from 'node:fs';
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
const libSrc = path.join(projectRoot, 'lib');
const routesSrc = path.join(projectRoot, 'routes');
const scriptsSrc = path.join(projectRoot, 'scripts');

const target = path.join(projectRoot, 'resources', 'next-standalone');
const targetStatic = path.join(target, '.next', 'static');
const targetPublic = path.join(target, 'public');
const targetBgm = path.join(projectRoot, 'resources', 'bgm');
const targetMainPy = path.join(projectRoot, 'resources', 'main.py');
const targetRoutes = path.join(projectRoot, 'resources', 'routes');
const targetScripts = path.join(projectRoot, 'resources', 'scripts');
const pythonApplicationLibTargets = [
  path.join(projectRoot, 'resources', 'python', 'lib'),
  path.join(projectRoot, 'resources', 'runtime', 'darwin-arm64', 'python', 'applib', 'lib'),
  path.join(projectRoot, 'resources', 'runtime', 'darwin-x64', 'python', 'applib', 'lib'),
];

console.log('[build-next-standalone] starting...');

/* ============ Step 1: Next build ============ */

async function runBuild() {
  console.log('[build-next-standalone] running Next build (desktop FASTAPI → 127.0.0.1:8010)...');
  const nextCli = path.join(projectRoot, 'node_modules', 'next', 'dist', 'bin', 'next');
  return new Promise((resolve, reject) => {
    // Run the actual Next process. On Windows, `shell: true` can emit `exit`
    // before the descendant has finished materializing .next/standalone.
    const child = spawn(process.execPath, [nextCli, 'build'], {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false,
      env: {
        ...process.env,
        // 构建期写入客户端 bundle + routes-manifest rewrites，避免落到 dev 默认 8000
        FASTAPI_URL: 'http://127.0.0.1:8010',
        NEXT_PUBLIC_FASTAPI_URL: 'http://127.0.0.1:8010',
      },
    });
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`next build exit ${code}`));
    });
    child.on('error', reject);
  });
}

await runBuild();

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

/* ============ Step 4b: serverExternalPackages 补拷 ============ */

const SERVER_EXTERNAL_PACKAGES = ['mammoth'];

function copyPkgToStandalone(destRoot, srcPath, destRel) {
  const dest = path.join(destRoot, destRel);
  mkdirSync(path.dirname(dest), { recursive: true });
  if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
  cpSync(srcPath, dest, { recursive: true, dereference: true });
  console.log(`[build-next-standalone] copied external package: ${destRel}`);
}

/** Next standalone 在 pnpm 下常缺 hoisted symlink，Electron 运行时无法 resolve */
const RUNTIME_PNPM_PACKAGES = ['@swc/helpers', 'styled-jsx', '@next/env', 'react', 'react-dom'];

function resolveFromPnpmStore(nodeModulesRoot, pkgPath) {
  const pnpmDir = path.join(nodeModulesRoot, '.pnpm');
  if (!existsSync(pnpmDir)) return null;
  for (const entry of readdirSync(pnpmDir)) {
    const candidate = path.join(pnpmDir, entry, 'node_modules', ...pkgPath.split('/'));
    if (existsSync(path.join(candidate, 'package.json'))) {
      return candidate;
    }
  }
  return null;
}

function materializePnpmDeps() {
  const destRoot = path.join(target, 'node_modules');
  mkdirSync(destRoot, { recursive: true });

  for (const pkg of RUNTIME_PNPM_PACKAGES) {
    const destPath = path.join(destRoot, ...pkg.split('/'));
    if (existsSync(path.join(destPath, 'package.json'))) {
      console.log(`[build-next-standalone] already materialized: ${pkg}`);
      continue;
    }

    let src =
      resolveFromPnpmStore(destRoot, pkg) ||
      (existsSync(path.join(projectRoot, 'node_modules', ...pkg.split('/')))
        ? realpathSync(path.join(projectRoot, 'node_modules', ...pkg.split('/')))
        : null);

    if (!src) {
      console.error(`[build-next-standalone] WARN: cannot find ${pkg} for materialize`);
      continue;
    }
    copyPkgToStandalone(destRoot, src, pkg);
  }
}

function copyServerExternalPackages() {
  const destRoot = path.join(target, 'node_modules');
  mkdirSync(destRoot, { recursive: true });

  for (const pkg of SERVER_EXTERNAL_PACKAGES) {
    const src = path.join(projectRoot, 'node_modules', pkg);
    if (!existsSync(src)) {
      console.error(`[build-next-standalone] WARN: missing package ${pkg} in project node_modules`);
      continue;
    }
    copyPkgToStandalone(destRoot, realpathSync(src), pkg);
  }

  const pdfParseLink = path.join(projectRoot, 'node_modules', 'pdf-parse');
  if (!existsSync(pdfParseLink)) {
    console.error('[build-next-standalone] WARN: missing pdf-parse in project node_modules');
    return;
  }
  const pdfParseReal = realpathSync(pdfParseLink);
  copyPkgToStandalone(destRoot, pdfParseReal, 'pdf-parse');

  const pnpmPeerDir = path.dirname(pdfParseReal);
  for (const peer of ['pdfjs-dist', '@napi-rs']) {
    const peerSrc = path.join(pnpmPeerDir, peer);
    if (!existsSync(peerSrc)) {
      console.error(`[build-next-standalone] WARN: missing pnpm peer ${peer} for pdf-parse`);
      continue;
    }
    copyPkgToStandalone(destRoot, realpathSync(peerSrc), peer);
  }
}

copyServerExternalPackages();
materializePnpmDeps();

function syncPythonApplicationSources() {
  if (!existsSync(libSrc)) {
    throw new Error(`[build-next-standalone] missing Python application source: ${libSrc}`);
  }

  let synced = 0;
  for (const targetLib of pythonApplicationLibTargets) {
    if (!existsSync(targetLib)) continue;
    console.log(`[build-next-standalone] syncing Python lib/ -> ${targetLib}`);
    rmSync(targetLib, { recursive: true, force: true });
    cpSync(libSrc, targetLib, { recursive: true });
    synced += 1;
  }

  if (synced === 0) {
    throw new Error(
      '[build-next-standalone] no bundled Python application lib found; run build-python-bundle first',
    );
  }
}

syncPythonApplicationSources();

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

/* ============ Step 6b: scripts/ 复制（main.py 启动时 migrate 依赖） ============ */

console.log(`[build-next-standalone] copying scripts/ → ${targetScripts}`);
if (existsSync(scriptsSrc)) {
  if (existsSync(targetScripts)) rmSync(targetScripts, { recursive: true, force: true });
  mkdirSync(targetScripts, { recursive: true });
  for (const f of readdirSync(scriptsSrc)) {
    if (f.endsWith('.py')) {
      cpSync(path.join(scriptsSrc, f), path.join(targetScripts, f));
    }
  }
} else {
  console.error(`[build-next-standalone] WARN: ${scriptsSrc} not found`);
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
