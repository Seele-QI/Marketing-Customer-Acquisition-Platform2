#!/usr/bin/env node
/**
 * 解压 ffmpeg 二进制到 resources/ffmpeg/bin/
 *
 * 来源：tools/ffmpeg/ffmpeg.zip
 * 目标：resources/ffmpeg/bin/ffmpeg.exe + ffprobe.exe
 *
 * 触发时机：
 * - 阶段 2 出包前
 * - `pnpm resources:build` 自动跑
 */

import { existsSync, mkdirSync, copyFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const zipSrc = path.join(projectRoot, 'tools', 'ffmpeg', 'ffmpeg.zip');
const targetDir = path.join(projectRoot, 'resources', 'ffmpeg', 'bin');

console.log('[extract-ffmpeg] source:', zipSrc);
console.log('[extract-ffmpeg] target:', targetDir);

if (!existsSync(zipSrc)) {
  console.error(`[extract-ffmpeg] ERROR: ${zipSrc} not found`);
  console.error('  Expected ffmpeg.zip in tools/ffmpeg/. Download from:');
  console.error('  https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip');
  process.exit(1);
}

// 目标目录
mkdirSync(targetDir, { recursive: true });

// 检查是否已经解压好（避免重复）
const ffmpegExe = path.join(targetDir, 'ffmpeg.exe');
const ffprobeExe = path.join(targetDir, 'ffprobe.exe');
if (existsSync(ffmpegExe) && existsSync(ffprobeExe)) {
  console.log('[extract-ffmpeg] already extracted, skipping');
  process.exit(0);
}

// 简易解压：用系统 tar.exe（Windows 10+ 自带）
// 或者用 unzip（git bash 自带）
// 不引入 adm-zip 等第三方依赖，保持轻量

const isWindows = process.platform === 'win32';

async function tryExtract() {
  if (isWindows) {
    // tar.exe 可解压 zip（Windows 10 1803+ 内置）
    return new Promise((resolve, reject) => {
      const { spawn } = require('node:child_process');
      const tmpDir = path.join(projectRoot, 'resources', 'ffmpeg', '_tmp');
      mkdirSync(tmpDir, { recursive: true });
      const tk = spawn(
        'tar',
        ['-xf', zipSrc, '-C', tmpDir],
        { stdio: 'inherit', shell: false }
      );
      tk.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`tar exit ${code}`));
          return;
        }
        // tar 解出 <dirname>/bin/ffmpeg.exe 结构
        const entries = readdirSync(tmpDir);
        if (entries.length === 0) {
          reject(new Error('no entries extracted'));
          return;
        }
        const innerDir = path.join(tmpDir, entries[0], 'bin');
        if (!existsSync(innerDir)) {
          reject(new Error(`expected bin/ inside ${entries[0]}`));
          return;
        }
        for (const f of readdirSync(innerDir)) {
          if (f.endsWith('.exe')) {
            copyFileSync(path.join(innerDir, f), path.join(targetDir, f));
          }
        }
        // 清理 tmp
        rmSync(tmpDir, { recursive: true, force: true });
        resolve();
      });
      tk.on('error', reject);
    });
  } else {
    // POSIX: 用 unzip
    return new Promise((resolve, reject) => {
      const { spawn } = require('node:child_process');
      const tmpDir = path.join(projectRoot, 'resources', 'ffmpeg', '_tmp');
      mkdirSync(tmpDir, { recursive: true });
      const tk = spawn('unzip', ['-o', zipSrc, '-d', tmpDir], { stdio: 'inherit' });
      tk.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`unzip exit ${code}`));
          return;
        }
        const entries = readdirSync(tmpDir);
        const innerDir = path.join(tmpDir, entries[0], 'bin');
        for (const f of readdirSync(innerDir)) {
          copyFileSync(path.join(innerDir, f), path.join(targetDir, f));
        }
        rmSync(tmpDir, { recursive: true, force: true });
        resolve();
      });
      tk.on('error', reject);
    });
  }
}

try {
  await tryExtract();
} catch (err) {
  console.error('[extract-ffmpeg] FAILED:', err.message);
  process.exit(1);
}

// 校验
if (!existsSync(ffmpegExe)) {
  console.error('[extract-ffmpeg] ERROR: ffmpeg.exe not found after extract');
  process.exit(1);
}
if (!existsSync(ffprobeExe)) {
  console.error('[extract-ffmpeg] ERROR: ffprobe.exe not found after extract');
  process.exit(1);
}

const ffmpegStat = statSync(ffmpegExe);
const ffprobeStat = statSync(ffprobeExe);
console.log(
  `[extract-ffmpeg] OK: ffmpeg.exe=${(ffmpegStat.size / 1024 / 1024).toFixed(1)}MB, ` +
    `ffprobe.exe=${(ffprobeStat.size / 1024 / 1024).toFixed(1)}MB`
);