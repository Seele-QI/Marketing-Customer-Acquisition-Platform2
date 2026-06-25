/**
 * 进程树清理工具
 *
 * Windows 下 child_process.spawn 的子进程（如 uvicorn、node server.js），
 * `process.kill(pid)` 只能杀直接子进程，Python 多进程模型下孙子进程会孤儿。
 * 必须用 `taskkill /F /T /PID <pid>` 整树杀。
 */

import { spawn } from 'node:child_process';
import { platform } from 'node:process';

/**
 * 杀整棵进程树。
 * - Windows: taskkill /F /T /PID <pid>
 * - POSIX:   kill -9 -<pid>（杀进程组）
 */
export function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (!pid || pid <= 0) {
      resolve();
      return;
    }

    if (platform === 'win32') {
      const tk = spawn('taskkill', ['/F', '/T', '/PID', String(pid)], {
        windowsHide: true,
        stdio: 'ignore',
      });
      tk.on('exit', () => resolve());
      tk.on('error', () => resolve()); // 进程已退出，taskkill 失败也 OK
    } else {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        // 进程组不存在
      }
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 已退出
      }
      resolve();
    }
  });
}

/**
 * 等待端口可连接（HTTP GET 拿到响应）。
 * 用于判断子进程是否真的 ready（spawn 后端口已 listen 但 HTTP 还没准备好）。
 */
export async function waitForHttpReady(
  url: string,
  timeoutMs = 30_000,
  intervalMs = 500,
): Promise<void> {
  const start = Date.now();
  // 用内置 fetch（Node 18+），超时用 AbortController
  while (Date.now() - start < timeoutMs) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 2000);
      const res = await fetch(url, { signal: ctrl.signal });
      clearTimeout(timer);
      // 任何 HTTP 响应（200/401/403/404/500）都算 ready —— 服务在跑
      if (res.status > 0) return;
    } catch {
      // 还没起来，继续等
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`waitForHttpReady timeout: ${url}`);
}