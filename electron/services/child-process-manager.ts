/**
 * 子进程管理器
 *
 * 负责拉起并守护 Next.js 和 FastAPI 子进程。
 * - spawn + pipe stdout/stderr 到日志文件
 * - crash 自动重启（指数退避）
 * - 连续崩溃超阈值弹气泡
 * - 退出时 taskkill 整树
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { app } from 'electron';
import { killProcessTree, waitForHttpReady } from '../utils/process-tree';
import { logsDir } from '../utils/paths';
import logger from './logger';

export interface ChildSpec {
  name: 'next' | 'uvicorn';
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  port: number;
  /** HTTP 健康检查 URL（默认 http://127.0.0.1:<port>） */
  healthUrl?: string;
  /** 启动超时（默认 30s） */
  startupTimeoutMs?: number;
}

interface ChildHandle {
  proc: ChildProcess;
  port: number;
  restartCount: number;
  lastCrashAt: number;
  /** stderr 最近的行，用于检测致命错误（如"端口被占"） */
  recentStderr: string[];
}

export class ChildProcessManager {
  private handles = new Map<string, ChildHandle>();
  private isQuitting = false;
  /** 连续崩溃超阈值后停止重启 */
  private readonly MAX_RESTART = 3;

  /** 获取某子进程状态 */
  status(name: string): { alive: boolean; restartCount: number } | null {
    const h = this.handles.get(name);
    if (!h) return null;
    return { alive: h.proc.exitCode === null, restartCount: h.restartCount };
  }

  /**
   * 启动一个子进程。如果同名子进程已存在，先停掉。
   * 等待端口 HTTP ready 后返回。
   */
  async start(spec: ChildSpec): Promise<ChildHandle> {
    // 先停止旧进程（包括杀死进程树和清除 handle）
    await this.stop(spec.name);
    return this.startInternal(spec);
  }

  private handleExit(spec: ChildSpec, code: number | null, signal: NodeJS.Signals | null) {
    if (this.isQuitting) {
      logger.info(`[${spec.name}] exit during quit (code=${code} signal=${signal})`);
      return;
    }

    if (code === 0) {
      logger.info(`[${spec.name}] clean exit (code=0)`);
      this.handles.delete(spec.name);
      return;
    }

    // 异常退出
    const h = this.handles.get(spec.name);
    if (!h) return;

    // "端口冲突"类错误不应该重试——重试一百次也没用
    const stderrTail = (h.recentStderr ?? []).join('\n');
    if (stderrTail.includes('Another next dev server is already running')
        || stderrTail.includes('address already in use')
        || stderrTail.includes('EADDRINUSE')) {
      logger.error(`[${spec.name}] port conflict (fatal), NOT restarting`);
      this.handles.delete(spec.name);
      return;
    }

    h.restartCount += 1;
    h.lastCrashAt = Date.now();
    logger.error(`[${spec.name}] crashed (code=${code} signal=${signal}), restart #${h.restartCount}`);

    if (h.restartCount > this.MAX_RESTART) {
      logger.error(`[${spec.name}] exceeded MAX_RESTART=${this.MAX_RESTART}, NOT restarting`);
      // 留待托盘弹气泡（阶段 3）
      return;
    }

    const backoffMs = Math.min(1000 * 2 ** (h.restartCount - 1), 10_000);
    const prevCount = h.restartCount; // 保底：stop() 会删 handle，提前保存
    logger.info(`[${spec.name}] will restart in ${backoffMs}ms`);
    setTimeout(() => {
      if (!this.isQuitting) {
        this.restart(spec, prevCount).catch((e) => logger.error(`[${spec.name}] restart failed:`, e));
      }
    }, backoffMs);
  }

  /** 重启子进程（保底保留 crash 计数，start() 里的 stop 会清零） */
  private async restart(spec: ChildSpec, prevCount: number): Promise<ChildHandle> {
    // 先停旧进程（不清除旧 handle 的 count，交给 start 重建）
    await this.killOnly(spec.name);
    // 建新的 handle 时继承重启计数
    const h = await this.startInternal(spec);
    h.restartCount = prevCount;
    return h;
  }

  /** 只杀进程，不删 handler */
  private async killOnly(name: string): Promise<void> {
    const h = this.handles.get(name);
    if (!h || !h.proc.pid) return;
    await killProcessTree(h.proc.pid);
  }

  /** 创建子进程但不做 stop 清理 */
  private async startInternal(spec: ChildSpec): Promise<ChildHandle> {
    const logFile = path.join(logsDir(), `${spec.name}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });
    logStream.write(`\n\n=== start ${new Date().toISOString()} ===\n`);
    logStream.write(`cmd: ${spec.command} ${spec.args.join(' ')}\n`);
    logStream.write(`cwd: ${spec.cwd}\n`);

    logger.info(`[${spec.name}] spawning: ${spec.command} ${spec.args.join(' ')}`);

    const proc = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: { ...process.env, ...spec.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: process.platform === 'win32',
    });

    const h: ChildHandle = { proc, port: spec.port, restartCount: 0, lastCrashAt: 0, recentStderr: [] };
    this.handles.set(spec.name, h);

    proc.stdout?.on('data', (chunk) => {
      logStream.write(chunk);
      logger.debug(`[${spec.name}.stdout] ${chunk.toString().trim()}`);
    });
    proc.stderr?.on('data', (chunk) => {
      logStream.write(chunk);
      const text = chunk.toString().trim();
      if (text) {
        h.recentStderr.push(text);
        if (h.recentStderr.length > 20) h.recentStderr.shift();
      }
      logger.warn(`[${spec.name}.stderr] ${text}`);
    });
    proc.on('error', (err) => {
      logger.error(`[${spec.name}] spawn error:`, err);
      logStream.write(`spawn error: ${err.message}\n`);
    });

    proc.on('exit', (code, signal) => this.handleExit(spec, code, signal));

    const healthUrl = spec.healthUrl ?? `http://127.0.0.1:${spec.port}/`;
    const timeout = spec.startupTimeoutMs ?? 30_000;
    try {
      await waitForHttpReady(healthUrl, timeout);
      logger.info(`[${spec.name}] ready at ${healthUrl}`);
    } catch (err) {
      logger.error(`[${spec.name}] startup timeout (${timeout}ms), killing`, err);
      await this.stop(spec.name);
      throw err;
    }

    return h;
  }

  /**
   * 停一个子进程（taskkill 整树）
   */
  async stop(name: string): Promise<void> {
    const h = this.handles.get(name);
    if (!h) return;
    this.handles.delete(name);
    if (h.proc.pid) {
      logger.info(`[${name}] killing pid ${h.proc.pid}`);
      await killProcessTree(h.proc.pid);
    }
  }

  /**
   * 停所有子进程。app 退出前调用。
   */
  async stopAll(): Promise<void> {
    this.isQuitting = true;
    const names = [...this.handles.keys()];
    await Promise.all(names.map((n) => this.stop(n)));
    logger.info('all child processes stopped');
  }

  /** 是否在退出中 */
  get quitting(): boolean {
    return this.isQuitting;
  }
}

// 单例
export const childManager = new ChildProcessManager();

/**
 * 注册 app 退出钩子。**必须在 app.whenReady() 之后调用**，
 * 不能在模块顶层（那时 app 还没初始化）。
 */
export function registerQuitHook() {
  app.on('before-quit', async (e) => {
    if (childManager.quitting) return;
    e.preventDefault();
    await childManager.stopAll();
    app.exit(0);
  });
}