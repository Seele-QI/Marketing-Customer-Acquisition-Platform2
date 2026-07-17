#!/usr/bin/env node
/**
 * 构建桌面打包用 Python 运行时 + 依赖 + 项目 lib/
 *
 * Windows: embeddable zip → resources/python/
 * Darwin:  python-build-standalone (arm64 + x64) → resources/runtime/darwin-{arch}/python/
 *
 * 触发：pnpm resources:build
 */

import {
  existsSync,
  mkdirSync,
  cpSync,
  rmSync,
  writeFileSync,
  readFileSync,
  statSync,
  readdirSync,
  chmodSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { Readable } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const cacheDir = path.join(projectRoot, '.electron-cache', 'python');
const GET_PIP_URL = 'https://bootstrap.pypa.io/get-pip.py';

/* Windows embeddable */
const PY_EMBED_VERSION = '3.13.13';
const PY_EMBED_URL =
  'https://www.python.org/ftp/python/' + PY_EMBED_VERSION + '/python-' + PY_EMBED_VERSION + '-embed-amd64.zip';

/* Darwin python-build-standalone */
const PY_STANDALONE_TAG = '20260623';
const PY_STANDALONE_VERSION = '3.13.14';
const PY_STANDALONE_BASE =
  `https://github.com/astral-sh/python-build-standalone/releases/download/${PY_STANDALONE_TAG}`;

const DARWIN_ARCHS = [
  {
    folder: 'darwin-arm64',
    triple: 'aarch64-apple-darwin',
    pipPlatforms: ['macosx_11_0_arm64', 'macosx_11_0_universal2'],
  },
  {
    folder: 'darwin-x64',
    triple: 'x86_64-apple-darwin',
    pipPlatforms: ['macosx_10_9_x86_64', 'macosx_10_9_universal2'],
  },
];

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

function copyProjectLib(destDir) {
  const libSrc = path.join(projectRoot, 'lib');
  if (!existsSync(libSrc)) {
    throw new Error('lib/ not found at ' + libSrc);
  }
  console.log('[build-python] copying lib/ -> ' + destDir);
  if (existsSync(destDir)) rmSync(destDir, { recursive: true, force: true });
  if (process.platform === 'win32') {
    mkdirSync(destDir, { recursive: true });
    const result = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Copy-Item -Path '${libSrc.replace(/'/g, "''")}' -Destination '${destDir.replace(/'/g, "''")}' -Recurse -Force`,
      ],
      { stdio: 'inherit' },
    );
    if (result.status !== 0) {
      throw new Error('Copy-Item lib/ failed: exit ' + result.status);
    }
  } else {
    cpSync(libSrc, destDir, { recursive: true });
  }
}

function ensurePythonLink(pythonRootDir) {
  const binDir = path.join(pythonRootDir, 'bin');
  const binPy = ['python3', `python${PY_STANDALONE_VERSION.split('.').slice(0, 2).join('.')}`]
    .map((name) => path.join(binDir, name))
    .find((candidate) => existsSync(candidate));
  const rootPy = path.join(pythonRootDir, 'python');
  if (!binPy) {
    throw new Error('missing bin/python3 or bin/python3.13 at ' + binDir);
  }
  chmodSync(binPy, 0o755);
  if (existsSync(rootPy)) {
    try {
      unlinkSync(rootPy);
    } catch {
      // ignore
    }
  }
  try {
    symlinkSync(path.join('bin', path.basename(binPy)), rootPy);
  } catch {
    cpSync(binPy, rootPy);
    chmodSync(rootPy, 0o755);
  }
}

function runPipInstall(pythonExe, pythonRootDir, appLibName) {
  const sitePackages = path.join(pythonRootDir, 'site-packages');
  mkdirSync(sitePackages, { recursive: true });

  console.log('[build-python] upgrading pip + setuptools...');
  spawnSync(
    pythonExe,
    ['-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel', '--quiet'],
    {
      cwd: pythonRootDir,
      env: { ...process.env, PYTHONPATH: sitePackages },
      stdio: 'inherit',
    },
  );

  console.log('[build-python] installing requirements into', sitePackages);
  const result = spawnSync(
    pythonExe,
    [
      '-m',
      'pip',
      'install',
      '-r',
      path.join(projectRoot, 'requirements.txt'),
      '--target',
      sitePackages,
      '--upgrade',
      '--no-warn-script-location',
    ],
    {
      cwd: pythonRootDir,
      env: { ...process.env, PYTHONPATH: sitePackages },
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new Error('pip install requirements.txt failed: exit ' + result.status);
  }

  // Windows: pythonRoot/lib 即项目包（from lib.xxx）
  // Darwin:  pythonRoot/applib/lib，避免覆盖 standalone 的 lib/python3.13，且不遮蔽 stdlib email
  const libDest =
    appLibName === 'applib'
      ? path.join(pythonRootDir, 'applib', 'lib')
      : path.join(pythonRootDir, 'lib');
  copyProjectLib(libDest);
}

function runCrossPlatformPipInstall(pythonRootDir, appLibName, pipPlatforms) {
  const sitePackages = path.join(pythonRootDir, 'site-packages');
  mkdirSync(sitePackages, { recursive: true });

  const platformArgs = pipPlatforms.flatMap((platformName) => ['--platform', platformName]);
  console.log(
    '[build-python] cross-installing requirements for',
    pipPlatforms.join(', '),
    'into',
    sitePackages,
  );
  const result = spawnSync(
    'python3',
    [
      '-m',
      'pip',
      'install',
      '-r',
      path.join(projectRoot, 'requirements.txt'),
      '--target',
      sitePackages,
      '--upgrade',
      '--only-binary=:all:',
      '--implementation',
      'cp',
      '--python-version',
      '3.13',
      '--abi',
      'cp313',
      ...platformArgs,
    ],
    {
      cwd: pythonRootDir,
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    throw new Error('cross-platform pip install failed: exit ' + result.status);
  }

  const libDest =
    appLibName === 'applib'
      ? path.join(pythonRootDir, 'applib', 'lib')
      : path.join(pythonRootDir, 'lib');
  copyProjectLib(libDest);
}

function smokeTest(pythonExe, pythonRootDir, appLibName) {
  const sitePackages = path.join(pythonRootDir, 'site-packages');
  // PYTHONPATH 放「lib 包的父目录」，切勿把 lib/ 本身放进去（会遮蔽 stdlib email）
  const libParent =
    appLibName === 'applib' ? path.join(pythonRootDir, 'applib') : pythonRootDir;
  const env = {
    ...process.env,
    PYTHONPATH: [sitePackages, libParent].join(path.delimiter),
  };
  console.log('[build-python] smoke test:', pythonExe);
  const result = spawnSync(
    pythonExe,
    [
      '-c',
      'import email.message, fastapi, uvicorn, pydantic, httpx, cryptography, qrcode, PIL, resend, yt_dlp; import lib.email; print("all imports OK, pydantic", pydantic.VERSION)',
    ],
    { cwd: pythonRootDir, env, encoding: 'utf-8' },
  );
  if (result.status !== 0) {
    throw new Error('smoke test failed: ' + (result.stderr || result.stdout));
  }
  console.log('[build-python]', result.stdout.trim());
}

/* ============ Windows ============ */

async function buildWindowsEmbed() {
  const target = path.join(projectRoot, 'resources', 'python');

  const zipPath = path.join(cacheDir, 'python-' + PY_EMBED_VERSION + '-embed-amd64.zip');
  await downloadFile(PY_EMBED_URL, zipPath);

  console.log('[build-python] extracting to ' + target);
  if (existsSync(target)) rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const result = spawnSync('tar', ['-xf', zipPath, '-C', target], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('tar exit ' + result.status);

  const entries = readdirSync(target);
  const pthFile = entries.find((e) => /^python[\d.]+\._pth$/.test(e));
  if (!pthFile) throw new Error('pythonX.Y._pth file not found in target');
  const pthPath = path.join(target, pthFile);
  let content = readFileSync(pthPath, 'utf-8');
  content = content.replace(/^#\s*import\s+site\s*$/m, 'import site');
  if (!content.includes('site-packages')) {
    content += '\n./site-packages\n./lib\n';
  }
  writeFileSync(pthPath, content, 'utf-8');
  console.log('[build-python] enabled site: ' + pthFile);

  const pythonExe = path.join(target, 'python.exe');
  const ver = spawnSync(pythonExe, ['--version'], { encoding: 'utf-8' });
  if (ver.status !== 0) throw new Error('python --version failed: ' + ver.stderr);
  console.log('[build-python] ' + ver.stdout.trim());

  const getPipPath = path.join(cacheDir, 'get-pip.py');
  await downloadFile(GET_PIP_URL, getPipPath);

  console.log('[build-python] bootstrapping pip...');
  const pipBoot = spawnSync(pythonExe, [getPipPath], {
    cwd: target,
    stdio: 'inherit',
    env: { ...process.env, PYTHONPATH: path.join(target, 'site-packages') },
  });
  if (pipBoot.status !== 0) throw new Error('get-pip.py failed: exit ' + pipBoot.status);

  runPipInstall(pythonExe, target, 'lib');
  smokeTest(pythonExe, target, 'lib');

  const all = readdirSync(target, { recursive: true });
  const totalSize = all
    .map((f) => path.join(target, f))
    .filter((f) => {
      try {
        return statSync(f).isFile();
      } catch {
        return false;
      }
    })
    .reduce((acc, f) => acc + statSync(f).size, 0);
  console.log('[build-python] OK (win): total ' + (totalSize / 1024 / 1024).toFixed(1) + 'MB in ' + target);
}

/* ============ Darwin ============ */

async function extractStandaloneTar(tarGzPath, target) {
  const tmpParent = path.join(projectRoot, '.electron-cache', 'python-extract-' + Date.now());
  mkdirSync(tmpParent, { recursive: true });
  try {
    const r = spawnSync('tar', ['-xzf', tarGzPath, '-C', tmpParent], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error('tar -xzf exit ' + r.status);
    const archiveRoot = path.join(tmpParent, 'python');
    const installRoot = path.join(archiveRoot, 'install');
    const extracted = existsSync(installRoot) ? installRoot : archiveRoot;
    if (!existsSync(extracted)) {
      throw new Error('expected python/install/ root inside standalone archive');
    }
    if (existsSync(target)) rmSync(target, { recursive: true, force: true });
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(extracted, target, { recursive: true });
  } finally {
    rmSync(tmpParent, { recursive: true, force: true });
  }
}

async function ensurePipOnStandalone(pythonExe, pythonRootDir) {
  const check = spawnSync(pythonExe, ['-m', 'pip', '--version'], {
    cwd: pythonRootDir,
    encoding: 'utf-8',
  });
  if (check.status === 0) {
    console.log('[build-python] pip ready:', check.stdout.trim());
    return;
  }
  const getPipPath = path.join(cacheDir, 'get-pip.py');
  await downloadFile(GET_PIP_URL, getPipPath);
  console.log('[build-python] bootstrapping pip for standalone...');
  const boot = spawnSync(pythonExe, [getPipPath], {
    cwd: pythonRootDir,
    stdio: 'inherit',
  });
  if (boot.status !== 0) throw new Error('get-pip.py failed: exit ' + boot.status);
}

async function buildDarwinArch(arch) {
  const archiveName = `cpython-${PY_STANDALONE_VERSION}+${PY_STANDALONE_TAG}-${arch.triple}-install_only.tar.gz`;
  const url = `${PY_STANDALONE_BASE}/${archiveName}`;
  const tarPath = path.join(cacheDir, archiveName);
  await downloadFile(url, tarPath);

  const target = path.join(projectRoot, 'resources', 'runtime', arch.folder, 'python');
  console.log('[build-python] extracting standalone →', target);
  await extractStandaloneTar(tarPath, target);
  ensurePythonLink(target);

  const pythonExe = path.join(target, 'python');
  const ver = spawnSync(pythonExe, ['--version'], { encoding: 'utf-8' });
  if (ver.status === 0) {
    console.log('[build-python]', arch.folder, ver.stdout.trim());
    await ensurePipOnStandalone(pythonExe, target);
    runPipInstall(pythonExe, target, 'applib');
    smokeTest(pythonExe, target, 'applib');
  } else {
    console.log(
      `[build-python] ${arch.folder} cannot execute on ${process.arch} runner; using cross-platform pip`,
    );
    runCrossPlatformPipInstall(target, 'applib', arch.pipPlatforms);
  }
  console.log('[build-python] OK:', arch.folder);
}

async function buildDarwinDual() {
  for (const arch of DARWIN_ARCHS) {
    await buildDarwinArch(arch);
  }
}

/* ============ Main ============ */

async function main() {
  try {
    mkdirSync(cacheDir, { recursive: true });
    if (process.platform === 'darwin') {
      await buildDarwinDual();
    } else if (process.platform === 'win32') {
      await buildWindowsEmbed();
    } else {
      throw new Error(`unsupported platform for python bundle: ${process.platform}`);
    }
  } catch (err) {
    console.error('[build-python] FAILED:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

await main();
