#!/usr/bin/env node
/**
 * 出包前预检：确认 resources/ 下所有产物齐全
 *
 * 检查项：
 * - resources/python/python.exe + 关键依赖（fastapi/uvicorn/pydantic/...）
 * - resources/ffmpeg/bin/ffmpeg.exe + ffprobe.exe
 * - resources/next-standalone/server.js
 * - resources/main.py
 * - resources/bgm/*.mp3
 *
 * 触发：`pnpm preflight` 或 `pnpm dist` 之前自动跑
 */

import { existsSync, statSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const resources = path.join(projectRoot, 'resources');

const checks = [];
let failed = 0;

function check(label, ok, detail = '') {
  const icon = ok ? '✅' : '❌';
  console.log(`  ${icon} ${label}${detail ? ': ' + detail : ''}`);
  checks.push({ label, ok });
  if (!ok) failed++;
}

/* ============ resources/ 存在 ============ */

console.log('\n[preflight] === resources/ tree ===');
if (!existsSync(resources)) {
  console.error(`[preflight] FATAL: ${resources} does not exist`);
  console.error('  Run `pnpm resources:build` first');
  process.exit(1);
}

/* ============ Python ============ */

console.log('\n[preflight] === python ===');
const pythonRoot = path.join(resources, 'python');
const exeExt = process.platform === 'win32' ? '.exe' : '';
const pythonExe = path.join(pythonRoot, `python${exeExt}`);
check('python.exe exists', existsSync(pythonExe));

if (existsSync(pythonExe)) {
  const v = spawnSync(pythonExe, ['--version'], { encoding: 'utf-8' });
  check('python --version', v.status === 0, v.stdout.trim());
}

const sitePackages = path.join(pythonRoot, 'site-packages');
check('site-packages/ exists', existsSync(sitePackages));

const requiredPkgs = [
  'fastapi',
  'uvicorn',
  'pydantic',
  'httpx',
  'cryptography',
  'qrcode',
  'PIL',
  'resend',
  'yt_dlp',
];
if (existsSync(sitePackages)) {
  for (const pkg of requiredPkgs) {
    const pkgDir = path.join(sitePackages, pkg);
    check(`  ${pkg}`, existsSync(pkgDir));
  }
}

const libDst = path.join(pythonRoot, 'lib');
check('lib/ copied', existsSync(libDst));

/* ============ ffmpeg ============ */

console.log('\n[preflight] === ffmpeg ===');
const ffmpegBin = path.join(resources, 'ffmpeg', 'bin');
const ffmpegExe = path.join(ffmpegBin, `ffmpeg${exeExt}`);
const ffprobeExe = path.join(ffmpegBin, `ffprobe${exeExt}`);
check('ffmpeg.exe exists', existsSync(ffmpegExe), ffmpegExe);
check('ffprobe.exe exists', existsSync(ffprobeExe), ffprobeExe);

if (existsSync(ffmpegExe)) {
  const v = spawnSync(ffmpegExe, ['-version'], { encoding: 'utf-8' });
  const firstLine = v.stdout.split('\n')[0];
  check('ffmpeg -version', v.status === 0, firstLine);
}

/* ============ Next.js standalone ============ */

console.log('\n[preflight] === next-standalone ===');
const nextRoot = path.join(resources, 'next-standalone');
const serverJs = path.join(nextRoot, 'server.js');
check('server.js exists', existsSync(serverJs));

const staticDir = path.join(nextRoot, '.next', 'static');
check('.next/static exists', existsSync(staticDir));

const publicDir = path.join(nextRoot, 'public');
check('public/ exists', existsSync(publicDir));

/* ============ main.py ============ */

console.log('\n[preflight] === main.py ===');
const mainPy = path.join(resources, 'main.py');
check('main.py exists', existsSync(mainPy));
if (existsSync(mainPy)) {
  const size = statSync(mainPy).size;
  check('main.py size > 50KB', size > 50_000, `${(size / 1024).toFixed(1)}KB`);
}

/* ============ routes/ ============ */

console.log('\n[preflight] === routes/ ===');
const routesDir = path.join(resources, 'routes');
const promoRoutes = path.join(routesDir, 'promo_video_routes.py');
check('routes/ exists', existsSync(routesDir));
check('promo_video_routes.py exists', existsSync(promoRoutes));

/* ============ Python smoke import (optional) ============ */

if (existsSync(pythonExe) && existsSync(mainPy) && existsSync(libDst)) {
  console.log('\n[preflight] === python smoke import ===');
  const pythonPath = [resources, sitePackages, libDst].join(path.delimiter);
  const testDb = path.join(resources, '_preflight_smoke.db');
  const smoke = spawnSync(
    pythonExe,
    [
      '-c',
      "import sys; sys.path.insert(0, '.'); from routes import promo_video_routes; print('routes import ok')",
    ],
    {
      cwd: resources,
      encoding: 'utf-8',
      env: {
        ...process.env,
        PYTHONPATH: pythonPath,
        CREDIT_DB_OVERRIDE: testDb,
      },
    },
  );
  const smokeOk = smoke.status === 0;
  check(
    'import routes in resources cwd',
    smokeOk,
    smokeOk ? smoke.stdout.trim() : smoke.stderr.trim().slice(0, 200),
  );
}

/* ============ BGM ============ */

console.log('\n[preflight] === bgm ===');
const bgmDir = path.join(resources, 'bgm');
check('bgm/ exists', existsSync(bgmDir));
if (existsSync(bgmDir)) {
  const files = readdirSync(bgmDir).filter((f) => f.endsWith('.mp3'));
  check(`  mp3 count >= 16`, files.length >= 16, `${files.length} files`);
}

/* ============ 总结 ============ */

console.log('\n[preflight] === summary ===');
const passed = checks.filter((c) => c.ok).length;
console.log(`  passed: ${passed}/${checks.length}`);
if (failed > 0) {
  console.error(`\n[preflight] FAIL: ${failed} check(s) failed`);
  process.exit(1);
} else {
  console.log('\n[preflight] OK: all resources ready for packaging');
}