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

import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, spawn } from 'node:child_process';

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
const isDarwin = process.platform === 'darwin';
const exeExt = process.platform === 'win32' ? '.exe' : '';
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

/** @type {{ root: string, appLib: string, label: string }[]} */
const pythonRoots = isDarwin
  ? [
      {
        root: path.join(resources, 'runtime', 'darwin-arm64', 'python'),
        appLib: path.join('applib', 'lib'),
        libParent: 'applib',
        label: 'darwin-arm64',
      },
      {
        root: path.join(resources, 'runtime', 'darwin-x64', 'python'),
        appLib: path.join('applib', 'lib'),
        libParent: 'applib',
        label: 'darwin-x64',
      },
    ]
  : [{ root: path.join(resources, 'python'), appLib: 'lib', libParent: '.', label: 'win' }];

let pythonExe = '';
let sitePackages = '';
let libDst = '';
let libParentDir = '';

for (const entry of pythonRoots) {
  console.log(`\n[preflight] === python (${entry.label}) ===`);
  const exe = path.join(entry.root, `python${exeExt}`);
  check(`${entry.label} python exists`, existsSync(exe), exe);
  if (existsSync(exe)) {
    const v = spawnSync(exe, ['--version'], { encoding: 'utf-8' });
    check(`${entry.label} python --version`, v.status === 0, (v.stdout || '').trim());
    if (!pythonExe) pythonExe = exe;
  }

  const sp = path.join(entry.root, 'site-packages');
  check(`${entry.label} site-packages/`, existsSync(sp));
  if (existsSync(sp)) {
    for (const pkg of requiredPkgs) {
      check(`  ${entry.label} ${pkg}`, existsSync(path.join(sp, pkg)));
    }
    if (!sitePackages) sitePackages = sp;
  }

  const appLib = path.join(entry.root, entry.appLib);
  check(`${entry.label} ${entry.appLib}/`, existsSync(appLib));
  check(`${entry.label} ${entry.appLib}/email.py`, existsSync(path.join(appLib, 'email.py')));
  if (!libDst && existsSync(appLib)) {
    libDst = appLib;
    libParentDir = path.join(entry.root, entry.libParent);
  }
}

/* ============ ffmpeg ============ */

console.log('\n[preflight] === ffmpeg ===');
const ffmpegBins = isDarwin
  ? [
      path.join(resources, 'runtime', 'darwin-arm64', 'ffmpeg', 'bin'),
      path.join(resources, 'runtime', 'darwin-x64', 'ffmpeg', 'bin'),
    ]
  : [path.join(resources, 'ffmpeg', 'bin')];

let ffmpegExe = '';
for (const ffmpegBin of ffmpegBins) {
  const ff = path.join(ffmpegBin, `ffmpeg${exeExt}`);
  const fp = path.join(ffmpegBin, `ffprobe${exeExt}`);
  check(`ffmpeg exists (${path.relative(resources, ffmpegBin)})`, existsSync(ff), ff);
  check(`ffprobe exists (${path.relative(resources, ffmpegBin)})`, existsSync(fp), fp);
  if (existsSync(ff)) {
    const v = spawnSync(ff, ['-version'], { encoding: 'utf-8' });
    const firstLine = (v.stdout || '').split('\n')[0];
    check(`ffmpeg -version (${path.basename(path.dirname(ffmpegBin))})`, v.status === 0, firstLine);
    if (!ffmpegExe) ffmpegExe = ff;
  }
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

const standaloneNodeModules = path.join(nextRoot, 'node_modules');
check('node_modules/pdf-parse exists', existsSync(path.join(standaloneNodeModules, 'pdf-parse')));
check('node_modules/pdfjs-dist exists', existsSync(path.join(standaloneNodeModules, 'pdfjs-dist')));
check('node_modules/mammoth exists', existsSync(path.join(standaloneNodeModules, 'mammoth')));
check(
  'node_modules/@swc/helpers exists',
  existsSync(path.join(standaloneNodeModules, '@swc', 'helpers', 'package.json')),
);
check(
  'node_modules/styled-jsx exists',
  existsSync(path.join(standaloneNodeModules, 'styled-jsx', 'package.json')),
);
check(
  'node_modules/@next/env exists',
  existsSync(path.join(standaloneNodeModules, '@next', 'env', 'package.json')),
);
check(
  'node_modules/react exists',
  existsSync(path.join(standaloneNodeModules, 'react', 'package.json')),
);
check(
  'node_modules/react-dom exists',
  existsSync(path.join(standaloneNodeModules, 'react-dom', 'package.json')),
);

if (existsSync(serverJs)) {
  console.log('\n[preflight] === next-standalone smoke ===');
  const nodeExe = resolveNodeExe();
  check('node runtime for smoke', Boolean(nodeExe), nodeExe || 'missing');

  if (nodeExe) {
    const requireSwc = spawnSync(
      nodeExe,
      ['-e', "require('@swc/helpers/_/_interop_require_default'); console.log('swc ok')"],
      {
        cwd: nextRoot,
        encoding: 'utf-8',
        env: {
          ...process.env,
          NODE_PATH: [
            standaloneNodeModules,
            path.join(standaloneNodeModules, '.pnpm', 'node_modules'),
          ].join(path.delimiter),
        },
      },
    );
    check(
      '@swc/helpers require smoke',
      requireSwc.status === 0,
      requireSwc.status === 0 ? requireSwc.stdout.trim() : requireSwc.stderr.trim().slice(0, 200),
    );

    const smokePort = 31999;
    const smoke = await smokeNextStandalone(nodeExe, nextRoot, smokePort);
    check(
      'server.js HTTP smoke',
      smoke.ok,
      smoke.ok ? `ready on :${smokePort}` : smoke.detail.slice(0, 200),
    );
  }
}

function resolveNodeExe() {
  const candidates = [
    path.join(projectRoot, '.build-tools', 'node-v22', process.platform === 'win32' ? 'node.exe' : 'node'),
    process.execPath,
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  const which = spawnSync(process.platform === 'win32' ? 'where' : 'which', ['node'], {
    encoding: 'utf-8',
    shell: process.platform === 'win32',
  });
  if (which.status === 0) {
    const first = which.stdout.split(/\r?\n/).find((line) => line.trim());
    if (first && existsSync(first.trim())) return first.trim();
  }
  return null;
}

async function smokeNextStandalone(nodeExe, nextRoot, port) {
  const serverJs = path.join(nextRoot, 'server.js');
  const child = spawn(nodeExe, [serverJs], {
    cwd: nextRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: '127.0.0.1',
      PORT: String(port),
      NODE_PATH: [
        path.join(nextRoot, 'node_modules'),
        path.join(nextRoot, 'node_modules', '.pnpm', 'node_modules'),
      ].join(path.delimiter),
    },
  });

  let stderr = '';
  child.stderr?.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      return { ok: false, detail: stderr || `exit ${child.exitCode}` };
    }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      if (res.status > 0) {
        child.kill();
        return { ok: true, detail: '' };
      }
    } catch {
      // not ready
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  child.kill();
  return { ok: false, detail: stderr || 'timeout waiting for HTTP' };
}

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

/* ============ packaged .env ============ */

console.log('\n[preflight] === packaged .env (local desktop) ===');
const packagedEnv = path.join(resources, '.env');
check('.env exists', existsSync(packagedEnv), packagedEnv);

const REQUIRED_ENV_KEYS = [
  'DEEPSEEK_API_KEY',
  'RUNNINGHUB_API_KEY',
  'EMAIL_HASH_SALT',
  'CREDIT_ADMIN_ACCESS_KEY',
  'ADMIN_PASSWORD_HASH',
  'ADMIN_PASSWORD_SALT',
];

function parseDotEnvSimple(content) {
  const config = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) config[key] = value;
  }
  return config;
}

if (existsSync(packagedEnv)) {
  const envConfig = parseDotEnvSimple(readFileSync(packagedEnv, 'utf-8'));
  const cloudUrl = (envConfig.CLOUD_API_URL || '').trim().replace(/\/+$/, '');
  const cloudMode = cloudUrl.startsWith('https://');
  // 云端 hybrid：API Key / 管理密钥由登录后 /api/config/sync 下发，不必打进安装包
  const optionalWhenCloud = new Set(['DEEPSEEK_API_KEY', 'CREDIT_ADMIN_ACCESS_KEY']);
  for (const key of REQUIRED_ENV_KEYS) {
    const value = (envConfig[key] || '').trim();
    const soft = cloudMode && optionalWhenCloud.has(key);
    if (soft && !value) {
      check(`  ${key} set`, true, '(云端 sync 下发，安装包可缺)');
    } else {
      check(`  ${key} set`, value.length > 0);
    }
  }

  check('  CLOUD_API_URL set (https)', cloudMode, cloudUrl || '(missing)');

  if (cloudMode) {
    try {
      const healthRes = await fetch(`${cloudUrl}/health`);
      const healthOk = healthRes.status === 200;
      let healthDetail = `HTTP ${healthRes.status}`;
      if (healthOk) {
        try {
          const body = await healthRes.json();
          healthDetail = body?.status === 'ok' ? 'ok' : JSON.stringify(body).slice(0, 80);
        } catch {
          healthDetail = 'ok (non-json body)';
        }
      }
      check(`  CLOUD_API_URL /health`, healthOk, healthDetail);
    } catch (err) {
      check(
        '  CLOUD_API_URL /health',
        false,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

/* ============ Python smoke import (optional) ============ */

if (existsSync(pythonExe) && existsSync(mainPy) && existsSync(libDst)) {
  console.log('\n[preflight] === python smoke import ===');
  const pythonPath = [resources, sitePackages, libParentDir || path.dirname(libDst)].join(
    path.delimiter,
  );
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