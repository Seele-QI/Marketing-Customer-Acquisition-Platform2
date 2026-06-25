#!/usr/bin/env node
/**
 * 构建 embeddable Python + 依赖 + lib/ 到 resources/python/
 *
 * 流程：
 * 1. 下载 Python 3.13 embeddable zip（python.org/ftp）
 * 2. 解压到 resources/python/
 * 3. 改 python313._pth 启用 site-packages
 * 4. 下载 get-pip.py，bootstrap pip
 * 5. pip install --target 装 requirements.txt 全部依赖
 * 6. cp lib/ → resources/python/lib/
 *
 * 触发：pnpm resources:build
 *
 * 注意：embeddable Python 没有 tkinter / IDLE，但 fastapi 不需要这些。
 */

import { existsSync, mkdirSync, cpSync, rmSync, writeFileSync, readFileSync, statSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const target = path.join(projectRoot, 'resources', 'python');
const cacheDir = path.join(projectRoot, '.electron-cache', 'python');

/* ============ 配置 ============ */

// Python 3.13 embeddable（amd64）
// 来源：https://www.python.org/ftp/python/
const PY_VERSION = '3.13.13';
const PY_EMBED_URL = 'https://www.python.org/ftp/python/' + PY_VERSION + '/python-' + PY_VERSION + '-embed-amd64.zip';
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

/* ============ Step 1: 下载 embeddable zip ============ */

async function downloadFile(url, dest) {
  if (existsSync(dest)) {
    console.log('[build-python] cached: ' + path.basename(dest));
    return;
  }
  console.log('[build-python] downloading: ' + url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error('download failed: ' + res.status + ' ' + res.statusText);
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log('[build-python] downloaded: ' + (statSync(dest).size / 1024 / 1024).toFixed(1) + 'MB');
}

async function step1_downloadEmbed() {
  const zipPath = path.join(cacheDir, 'python-' + PY_VERSION + '-embed-amd64.zip');
  await downloadFile(PY_EMBED_URL, zipPath);
  return zipPath;
}

/* ============ Step 2: 解压到 target ============ */

async function step2_extract(zipPath) {
  console.log('[build-python] extracting to ' + target);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });

  // Windows 用 tar.exe 解 .zip
  const isWin = process.platform === 'win32';
  const cmd = isWin ? 'tar' : 'unzip';
  const args = isWin ? ['-xf', zipPath, '-C', target] : ['-o', zipPath, '-d', target];

  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    throw new Error(cmd + ' exit ' + result.status);
  }
}

/* ============ Step 3: 改 _pth 文件启用 site-packages ============ */

function step3_enableSite() {
  const entries = readdirSync(target);
  const pthFile = entries.find((e) => /^python[\d.]+\._pth$/.test(e));
  if (!pthFile) {
    throw new Error('pythonX.Y._pth file not found in target');
  }
  const pthPath = path.join(target, pthFile);
  let content = readFileSync(pthPath, 'utf-8');

  // 取消注释 # import site
  content = content.replace(/^#\s*import\s+site\s*$/m, 'import site');

  // 添加 site-packages 到搜索路径
  if (!content.includes('site-packages')) {
    content += '\n./site-packages\n./lib\n';
  }

  writeFileSync(pthPath, content, 'utf-8');
  console.log('[build-python] enabled site: ' + pthFile);
}

/* ============ Step 4: bootstrap pip ============ */

async function step4_bootstrapPip() {
  const exeExt = process.platform === 'win32' ? '.exe' : '';
  const pythonExe = path.join(target, 'python' + exeExt);

  // 校验 python.exe 可执行
  const ver = spawnSync(pythonExe, ['--version'], { encoding: 'utf-8' });
  if (ver.status !== 0) {
    throw new Error('python --version failed: ' + ver.stderr);
  }
  console.log('[build-python] ' + ver.stdout.trim());

  // 下载 get-pip.py
  const getPipPath = path.join(cacheDir, 'get-pip.py');
  await downloadFile(GET_PIP_URL, getPipPath);

  // 跑 get-pip.py（embeddable 默认没 pip）
  console.log('[build-python] bootstrapping pip...');
  const result = spawnSync(pythonExe, [getPipPath], {
    cwd: target,
    stdio: 'inherit',
    env: Object.assign({}, process.env, { PYTHONPATH: path.join(target, 'site-packages') }),
  });
  if (result.status !== 0) {
    throw new Error('get-pip.py failed: exit ' + result.status);
  }

  // 校验 pip
  const pipCheck = spawnSync(pythonExe, ['-m', 'pip', '--version'], {
    cwd: target,
    env: Object.assign({}, process.env, { PYTHONPATH: path.join(target, 'site-packages') }),
    encoding: 'utf-8',
  });
  if (pipCheck.status !== 0) {
    throw new Error('pip not available: ' + pipCheck.stderr);
  }
  console.log('[build-python] pip ready: ' + pipCheck.stdout.trim());
}

/* ============ Step 5: pip install --target ============ */

function step5_installDeps() {
  const exeExt = process.platform === 'win32' ? '.exe' : '';
  const pythonExe = path.join(target, 'python' + exeExt);
  const sitePackages = path.join(target, 'site-packages');
  mkdirSync(sitePackages, { recursive: true });

  // 升级 pip + setuptools
  console.log('[build-python] upgrading pip + setuptools...');
  spawnSync(
    pythonExe,
    ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel', '--quiet'],
    {
      cwd: target,
      env: Object.assign({}, process.env, { PYTHONPATH: sitePackages }),
      stdio: 'inherit',
    },
  );

  // 装 requirements.txt
  console.log('[build-python] installing requirements...');
  const result = spawnSync(
    pythonExe,
    [
      '-m', 'pip', 'install',
      '-r', path.join(projectRoot, 'requirements.txt'),
      '--target', sitePackages,
      '--upgrade',
      '--no-warn-script-location',
    ],
    {
      cwd: target,
      env: Object.assign({}, process.env, { PYTHONPATH: sitePackages }),
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new Error('pip install requirements.txt failed: exit ' + result.status);
  }
}

/* ============ Step 6: 拷 lib/ ============ */

function step6_copyLib() {
  const libSrc = path.join(projectRoot, 'lib');
  const libDst = path.join(target, 'lib');
  if (!existsSync(libSrc)) {
    throw new Error('lib/ not found at ' + libSrc);
  }
  console.log('[build-python] copying lib/ -> ' + libDst);
  if (existsSync(libDst)) rmSync(libDst, { recursive: true, force: true });
  cpSync(libSrc, libDst, { recursive: true });
}

/* ============ Step 7: smoke test ============ */

function step7_smokeTest() {
  const exeExt = process.platform === 'win32' ? '.exe' : '';
  const pythonExe = path.join(target, 'python' + exeExt);
  const sitePackages = path.join(target, 'site-packages');
  const env = Object.assign({}, process.env, { PYTHONPATH: sitePackages });

  console.log('[build-python] smoke test: import fastapi, uvicorn, pydantic...');
  const result = spawnSync(
    pythonExe,
    ['-c', 'import fastapi, uvicorn, pydantic, httpx, cryptography, qrcode, PIL, resend, yt_dlp; print("all imports OK, pydantic", pydantic.VERSION)'],
    { cwd: target, env: env, encoding: 'utf-8' },
  );
  if (result.status !== 0) {
    throw new Error('smoke test failed: ' + result.stderr);
  }
  console.log('[build-python] ' + result.stdout.trim());
}

/* ============ Main ============ */

async function main() {
  try {
    mkdirSync(cacheDir, { recursive: true });
    const zipPath = await step1_downloadEmbed();
    await step2_extract(zipPath);
    step3_enableSite();
    await step4_bootstrapPip();
    step5_installDeps();
    step6_copyLib();
    step7_smokeTest();

    const entries = readdirSync(target, { recursive: true });
    const totalSize = entries
      .map((f) => path.join(target, f))
      .filter((f) => statSync(f).isFile())
      .reduce((acc, f) => acc + statSync(f).size, 0);
    console.log('[build-python] OK: total ' + (totalSize / 1024 / 1024).toFixed(1) + 'MB in ' + target);
  } catch (err) {
    console.error('[build-python] FAILED:', err.message);
    process.exit(1);
  }
}

await main();