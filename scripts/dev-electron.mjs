#!/usr/bin/env node
/**
 * dev 启动脚本：编译 Electron TypeScript，然后用 electron . 启动
 *
 * 行为：
 * 0. **杀残留**：kill 本项目的旧 next dev（避免"Another next dev server"冲突）
 * 1. 跑 `tsc -p electron/tsconfig.json` 编译到 dist-electron/
 * 2. spawn `electron .` 加载 dist-electron/main.js
 * 3. 主进程会拉起 dev 期的 next + uvicorn（端口 3010/8010）
 *
 * 注意：dev 期不读 .env.example 注入 key（开发用 Next.js dev server 自带的 .env.local）
 */

import { spawn, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

/* ============ Step 0: 杀残留 next dev 进程 ============ */

try {
  // 杀所有占用 3000/3010 端口的残留进程。
  // 用 netstat 找 PID（比 wmic 更可靠，兼容 Win11 + 中文路径）。
  const isWin = process.platform === 'win32';
  if (isWin) {
    const ports = [3000, 3010];
    for (const port of ports) {
      try {
        const out = execSync(`netstat -ano | findstr :${port}`, { encoding: 'utf-8', timeout: 5000 });
        const lines = out.split('\n').filter(l => l.includes('LISTENING'));
        const pids = [...new Set(lines.map(l => l.trim().split(/\s+/).pop()).filter(Boolean))];
        for (const pid of pids) {
          if (pid && pid !== '0') {
            try { execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore', timeout: 3000 }); } catch {}
            console.log(`[dev-electron] killed process on port ${port} (pid ${pid})`);
          }
        }
      } catch {}
    }
  }
} catch {
  // ignore cleanup failures
}

console.log('[dev-electron] compiling electron TypeScript...');

const tsc = spawn('npx', ['tsc', '-p', 'electron/tsconfig.json'], {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

tsc.on('exit', (code) => {
  if (code !== 0) {
    console.error(`[dev-electron] tsc exited with code ${code}`);
    process.exit(code ?? 1);
  }

  const mainJs = path.join(projectRoot, 'electron', 'dist-electron', 'main.js');
  if (!existsSync(mainJs)) {
    console.error(`[dev-electron] main.js not found: ${mainJs}`);
    process.exit(1);
  }

  console.log('[dev-electron] compiled OK, launching electron...');

  // 用 electron 二进制启动，传入项目根作为 cwd，让 main.ts 走 dev 分支
  const electronBin = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  const electronCmd = existsSync(electronBin) ? electronBin : 'electron';

  const child = spawn(electronCmd, ['.'], {
    cwd: projectRoot,
    stdio: 'inherit',
    env: {
      ...process.env,
      // 关键：让 main.ts 知道是 dev 模式（app.isPackaged=false 也成立，但显式标记更稳）
      NODE_ENV: process.env.NODE_ENV ?? 'development',
    },
  });

  // 转发退出码
  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });

  // ctrl-c 转发
  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
});