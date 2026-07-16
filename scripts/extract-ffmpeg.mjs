#!/usr/bin/env node
/**
 * 准备 Electron 打包用 ffmpeg / ffprobe：
 *
 * Windows: tools/ffmpeg/ffmpeg.zip → tools/ffmpeg/bin + resources/ffmpeg/bin
 * Darwin:  下载 eugeneware/ffmpeg-static 双架构 → resources/runtime/darwin-{arch}/ffmpeg/bin
 *
 * 触发：pnpm ffmpeg:ensure | pnpm resources:build
 */

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  rmSync,
  readdirSync,
  statSync,
  chmodSync,
  createWriteStream,
  createReadStream,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { createGunzip } from 'node:zlib';
import { Readable } from 'node:stream';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const FFMPEG_STATIC_TAG = 'b6.1.1';
const FFMPEG_STATIC_BASE =
  `https://github.com/eugeneware/ffmpeg-static/releases/download/${FFMPEG_STATIC_TAG}`;

const DARWIN_ARCHS = [
  { folder: 'darwin-arm64', assetArch: 'darwin-arm64' },
  { folder: 'darwin-x64', assetArch: 'darwin-x64' },
];

async function downloadFile(url, dest) {
  if (existsSync(dest)) {
    console.log('[extract-ffmpeg] cached:', path.basename(dest));
    return;
  }
  console.log('[extract-ffmpeg] downloading:', url);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: ${res.status} ${res.statusText}`);
  }
  mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(Readable.fromWeb(res.body), createWriteStream(dest));
  console.log(
    '[extract-ffmpeg] downloaded:',
    (statSync(dest).size / 1024 / 1024).toFixed(1) + 'MB',
  );
}

async function gunzipTo(srcGz, dest) {
  mkdirSync(path.dirname(dest), { recursive: true });
  await pipeline(createReadStream(srcGz), createGunzip(), createWriteStream(dest));
  chmodSync(dest, 0o755);
}

/* ============ Windows (unchanged flow) ============ */

async function buildWindows() {
  const zipSrc = path.join(projectRoot, 'tools', 'ffmpeg', 'ffmpeg.zip');
  const targetDirs = [
    path.join(projectRoot, 'tools', 'ffmpeg', 'bin'),
    path.join(projectRoot, 'resources', 'ffmpeg', 'bin'),
  ];
  const ffmpegName = 'ffmpeg.exe';
  const ffprobeName = 'ffprobe.exe';

  function allTargetsReady() {
    return targetDirs.every((dir) => {
      return existsSync(path.join(dir, ffmpegName)) && existsSync(path.join(dir, ffprobeName));
    });
  }

  function copyBinFromInner(innerBinDir, targetDir) {
    mkdirSync(targetDir, { recursive: true });
    for (const f of readdirSync(innerBinDir)) {
      if (f === ffmpegName || f === ffprobeName || f.endsWith('.exe')) {
        copyFileSync(path.join(innerBinDir, f), path.join(targetDir, f));
      }
    }
  }

  async function extractToTmp() {
    const tmpDir = path.join(projectRoot, 'tools', 'ffmpeg', '_tmp_extract');
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
    await new Promise((resolve, reject) => {
      const tk = spawn('tar', ['-xf', zipSrc, '-C', tmpDir], { stdio: 'inherit', shell: false });
      tk.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`tar exit ${code}`))));
      tk.on('error', reject);
    });
    const entries = readdirSync(tmpDir);
    if (entries.length === 0) throw new Error('no entries extracted');
    const innerBin = path.join(tmpDir, entries[0], 'bin');
    if (!existsSync(innerBin)) throw new Error(`expected bin/ inside ${entries[0]}`);
    return innerBin;
  }

  console.log('[extract-ffmpeg] source:', zipSrc);

  if (allTargetsReady()) {
    console.log('[extract-ffmpeg] already extracted to all targets, skipping');
    return;
  }

  const toolsBinDir = targetDirs[0];
  const resourcesBinDir = targetDirs[1];
  const toolsFfmpeg = path.join(toolsBinDir, ffmpegName);
  const toolsFfprobe = path.join(toolsBinDir, ffprobeName);

  if (!existsSync(zipSrc)) {
    if (existsSync(toolsFfmpeg) && existsSync(toolsFfprobe)) {
      mkdirSync(resourcesBinDir, { recursive: true });
      const resFfmpeg = path.join(resourcesBinDir, ffmpegName);
      const resFfprobe = path.join(resourcesBinDir, ffprobeName);
      if (!existsSync(resFfmpeg)) copyFileSync(toolsFfmpeg, resFfmpeg);
      if (!existsSync(resFfprobe)) copyFileSync(toolsFfprobe, resFfprobe);
      console.log('[extract-ffmpeg] copied tools/ffmpeg/bin → resources/ffmpeg/bin (no zip)');
      return;
    }
    console.error(`[extract-ffmpeg] ERROR: ${zipSrc} not found`);
    console.error('  Download: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip');
    console.error('  Save as tools/ffmpeg/ffmpeg.zip');
    console.error('  Or place ffmpeg.exe + ffprobe.exe in tools/ffmpeg/bin/');
    process.exit(1);
  }

  const innerBin = await extractToTmp();
  for (const targetDir of targetDirs) {
    const ffmpegPath = path.join(targetDir, ffmpegName);
    const ffprobePath = path.join(targetDir, ffprobeName);
    if (existsSync(ffmpegPath) && existsSync(ffprobePath)) {
      console.log('[extract-ffmpeg] skip (ready):', targetDir);
      continue;
    }
    console.log('[extract-ffmpeg] writing:', targetDir);
    copyBinFromInner(innerBin, targetDir);
  }
  rmSync(path.join(projectRoot, 'tools', 'ffmpeg', '_tmp_extract'), {
    recursive: true,
    force: true,
  });

  for (const targetDir of targetDirs) {
    const ffmpegPath = path.join(targetDir, ffmpegName);
    const ffprobePath = path.join(targetDir, ffprobeName);
    if (!existsSync(ffmpegPath) || !existsSync(ffprobePath)) {
      console.error(`[extract-ffmpeg] ERROR: missing binaries in ${targetDir}`);
      process.exit(1);
    }
    const ffmpegStat = statSync(ffmpegPath);
    const ffprobeStat = statSync(ffprobePath);
    console.log(
      `[extract-ffmpeg] OK ${targetDir}: ffmpeg=${(ffmpegStat.size / 1024 / 1024).toFixed(1)}MB, ` +
        `ffprobe=${(ffprobeStat.size / 1024 / 1024).toFixed(1)}MB`,
    );
  }
}

/* ============ Darwin ============ */

async function buildDarwinArch(arch) {
  const cacheDir = path.join(projectRoot, '.electron-cache', 'ffmpeg');
  mkdirSync(cacheDir, { recursive: true });

  const binDir = path.join(
    projectRoot,
    'resources',
    'runtime',
    arch.folder,
    'ffmpeg',
    'bin',
  );
  const ffmpegOut = path.join(binDir, 'ffmpeg');
  const ffprobeOut = path.join(binDir, 'ffprobe');

  if (existsSync(ffmpegOut) && existsSync(ffprobeOut)) {
    console.log('[extract-ffmpeg] skip (ready):', binDir);
    chmodSync(ffmpegOut, 0o755);
    chmodSync(ffprobeOut, 0o755);
    return;
  }

  for (const tool of ['ffmpeg', 'ffprobe']) {
    const gzName = `${tool}-${arch.assetArch}.gz`;
    const gzPath = path.join(cacheDir, gzName);
    await downloadFile(`${FFMPEG_STATIC_BASE}/${gzName}`, gzPath);
    const out = path.join(binDir, tool);
    console.log('[extract-ffmpeg] gunzip →', out);
    await gunzipTo(gzPath, out);
  }

  console.log(
    `[extract-ffmpeg] OK ${arch.folder}: ffmpeg=${(statSync(ffmpegOut).size / 1024 / 1024).toFixed(1)}MB, ` +
      `ffprobe=${(statSync(ffprobeOut).size / 1024 / 1024).toFixed(1)}MB`,
  );
}

async function buildDarwin() {
  for (const arch of DARWIN_ARCHS) {
    await buildDarwinArch(arch);
  }
}

/* ============ Main ============ */

try {
  if (process.platform === 'darwin') {
    await buildDarwin();
  } else if (process.platform === 'win32') {
    await buildWindows();
  } else {
    console.error(`[extract-ffmpeg] unsupported platform: ${process.platform}`);
    process.exit(1);
  }
} catch (err) {
  console.error('[extract-ffmpeg] FAILED:', err instanceof Error ? err.message : err);
  process.exit(1);
}
