#!/usr/bin/env node
/**
 * Ensure ffmpeg + ffprobe exist for the current host.
 * Prints JSON paths to stdout when --json is passed.
 */

import { existsSync, mkdirSync, copyFileSync, chmodSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const exeExt = process.platform === 'win32' ? '.exe' : '';

function darwinRuntimeBin() {
  const folder = process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  return path.join(projectRoot, 'resources', 'runtime', folder, 'ffmpeg', 'bin');
}

function resolveBins() {
  if (process.platform === 'darwin') {
    const runtimeBin = darwinRuntimeBin();
    return {
      binDir: runtimeBin,
      ffmpeg: path.join(runtimeBin, 'ffmpeg'),
      ffprobe: path.join(runtimeBin, 'ffprobe'),
    };
  }
  const binDir = path.join(projectRoot, 'tools', 'ffmpeg', 'bin');
  return {
    binDir,
    ffmpeg: path.join(binDir, `ffmpeg${exeExt}`),
    ffprobe: path.join(binDir, `ffprobe${exeExt}`),
  };
}

let bins = resolveBins();

if (!existsSync(bins.ffmpeg) || !existsSync(bins.ffprobe)) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'extract-ffmpeg.mjs')], {
    stdio: 'inherit',
    cwd: projectRoot,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  bins = resolveBins();
}

if (!existsSync(bins.ffmpeg) || !existsSync(bins.ffprobe)) {
  console.error('[ensure-ffmpeg] binaries still missing after extract');
  process.exit(1);
}

if (process.platform === 'darwin') {
  try {
    chmodSync(bins.ffmpeg, 0o755);
    chmodSync(bins.ffprobe, 0o755);
  } catch {
    // ignore
  }
  // Also mirror host-arch binaries into tools/ffmpeg/bin for local scripts
  const toolsBin = path.join(projectRoot, 'tools', 'ffmpeg', 'bin');
  mkdirSync(toolsBin, { recursive: true });
  const toolsFfmpeg = path.join(toolsBin, 'ffmpeg');
  const toolsFfprobe = path.join(toolsBin, 'ffprobe');
  if (!existsSync(toolsFfmpeg)) copyFileSync(bins.ffmpeg, toolsFfmpeg);
  if (!existsSync(toolsFfprobe)) copyFileSync(bins.ffprobe, toolsFfprobe);
  try {
    chmodSync(toolsFfmpeg, 0o755);
    chmodSync(toolsFfprobe, 0o755);
  } catch {
    // ignore
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ffmpeg: bins.ffmpeg, ffprobe: bins.ffprobe, binDir: bins.binDir }));
} else {
  console.log(`[ensure-ffmpeg] OK: ${bins.ffmpeg}`);
}
