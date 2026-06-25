/**
 * 端口探测工具（备用）
 *
 * 主流程用固定端口 3010 / 8010；此模块留给万一端口被占用时回退。
 */

import * as net from 'node:net';

export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net
      .createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port, host);
  });
}

/**
 * 从起始端口开始找空闲端口，最多尝试 max 次。
 * 返回第一个空闲端口；找不到抛错。
 */
export async function findFreePort(start = 3010, max = 50, host = '127.0.0.1'): Promise<number> {
  for (let p = start; p < start + max; p++) {
    if (await isPortFree(p, host)) return p;
  }
  throw new Error(`No free port found in range ${start}..${start + max - 1}`);
}/**
 * 检查端口是否可用
 */
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close();
      resolve(true);
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * 查找可用端口，从 startPort 开始递增检查
 * maxAttempts: 最多尝试次数，默认 20
 */
export async function findAvailablePort(startPort: number, maxAttempts: number = 20): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`找不到可用端口（从 ${startPort} 开始尝试 ${maxAttempts} 次）`);
}
