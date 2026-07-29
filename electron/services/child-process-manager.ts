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
import { randomBytes } from 'node:crypto';
import * as fs from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import * as path from 'node:path';
import { app } from 'electron';
import { killProcessTree, waitForHttpReady } from '../utils/process-tree';
import { logsDir } from '../utils/paths';
import { stripSystemProxy } from '../utils/strip-system-proxy';
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
  /** Windows 下是否用 shell 启动（Next 子进程应设 false） */
  shell?: boolean;
  /** Require this exact child generation to echo its token from the health endpoint. */
  generationHealthCheck?: boolean;
}

interface ChildHandle {
  proc: ChildProcess;
  port: number;
  restartCount: number;
  lastCrashAt: number;
  stopping: boolean;
  restartTimer?: ReturnType<typeof setTimeout>;
  readinessAbort: AbortController;
  logStream: fs.WriteStream;
  logClosed: boolean;
  ready: boolean;
  rejectStartup?: (error: Error) => void;
  stopPromise?: Promise<void>;
  /** stderr 最近的行，用于检测致命错误（如"端口被占"） */
  recentStderr: string[];
}

export interface ChildProcessManagerOptions {
  exitWaitTimeoutMs?: number;
  killProcessTree?: typeof killProcessTree;
  restartBackoffBaseMs?: number;
}

class StartupCrashError extends Error {
  readonly restartCount: number;

  constructor(restartCount: number) {
    super(`child crashed during startup (restart #${restartCount})`);
    this.name = 'StartupCrashError';
    this.restartCount = restartCount;
  }
}

export class ChildProcessManager {
  private handles = new Map<string, ChildHandle>();
  private operationChains = new Map<string, Promise<void>>();
  private isQuitting = false;
  /** 连续崩溃超阈值后停止重启 */
  private readonly MAX_RESTART = 3;
  private readonly exitWaitTimeoutMs: number;
  private readonly killTree: typeof killProcessTree;
  private readonly restartBackoffBaseMs: number;
  private readonly shutdownAbort = new AbortController();

  constructor(options: ChildProcessManagerOptions = {}) {
    this.exitWaitTimeoutMs = options.exitWaitTimeoutMs ?? 5_000;
    this.killTree = options.killProcessTree ?? killProcessTree;
    this.restartBackoffBaseMs = options.restartBackoffBaseMs ?? 1_000;
  }

  private isHandleAlive(h: ChildHandle): boolean {
    return !h.stopping
      && h.proc.exitCode === null
      && (h.proc.signalCode ?? null) === null;
  }

  private closeLogStream(h: ChildHandle): void {
    if (h.logClosed) return;
    h.logClosed = true;
    h.logStream.end();
  }

  private restartBackoffMs(restartCount: number): number {
    return Math.min(this.restartBackoffBaseMs * 2 ** (restartCount - 1), 10_000);
  }

  private waitForBackoff(ms: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        clearTimeout(timer);
        this.shutdownAbort.signal.removeEventListener('abort', onAbort);
        reject(new Error('restart aborted during shutdown'));
      };
      const timer = setTimeout(() => {
        this.shutdownAbort.signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      this.shutdownAbort.signal.addEventListener('abort', onAbort, { once: true });
    });
  }

  private async assertPortAvailable(name: string, port: number): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const probe = createNetServer();
      probe.once('error', (error) => {
        reject(new Error(`[${name}] port ${port} is already in use`, { cause: error }));
      });
      probe.listen({ host: '127.0.0.1', port, exclusive: true }, () => {
        probe.close((error) => error ? reject(error) : resolve());
      });
    });
  }

  private waitForProcessExit(name: string, proc: ChildProcess): Promise<boolean> {
    if (proc.exitCode !== null || (proc.signalCode ?? null) !== null) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = (didExit: boolean) => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) clearTimeout(timer);
        proc.off('exit', onExit);
        proc.off('error', onError);
        resolve(didExit);
      };
      const onExit = () => finish(true);
      const onError = () => finish(true);
      proc.once('exit', onExit);
      proc.once('error', onError);
      timer = setTimeout(() => {
        logger.warn(`[${name}] process exit wait timed out after ${this.exitWaitTimeoutMs}ms`);
        finish(false);
      }, this.exitWaitTimeoutMs);
    });
  }

  private runSerialized<T>(name: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.operationChains.get(name) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(() => undefined, () => undefined);
    this.operationChains.set(name, tail);
    return result.finally(() => {
      if (this.operationChains.get(name) === tail) {
        this.operationChains.delete(name);
      }
    });
  }

  /** 获取某子进程状态 */
  status(name: string): { alive: boolean; restartCount: number } | null {
    const h = this.handles.get(name);
    if (!h) return null;
    return { alive: this.isHandleAlive(h), restartCount: h.restartCount };
  }

  /**
   * 启动一个子进程。如果同名子进程已存在，先停掉。
   * 等待端口 HTTP ready 后返回。
   */
  async start(spec: ChildSpec): Promise<ChildHandle> {
    return this.runSerialized(spec.name, async () => {
      // 先停止旧进程（包括杀死进程树和清除 handle）
      await this.stopInternal(spec.name);
      return this.startInternal(spec);
    });
  }

  private handleExit(
    spec: ChildSpec,
    exitingHandle: ChildHandle,
    code: number | null,
    signal: NodeJS.Signals | null,
  ) {
    if (this.handles.get(spec.name) !== exitingHandle) {
      logger.info(`[${spec.name}] ignoring exit from stale process generation`);
      return;
    }

    if (exitingHandle.stopping) {
      logger.info(`[${spec.name}] exit during intentional stop (code=${code} signal=${signal})`);
      return;
    }

    if (this.isQuitting) {
      logger.info(`[${spec.name}] exit during quit (code=${code} signal=${signal})`);
      return;
    }

    if (code === 0) {
      logger.info(`[${spec.name}] clean exit (code=0)`);
      if (!exitingHandle.ready) {
        exitingHandle.rejectStartup?.(new Error(`[${spec.name}] exited during startup (code=0)`));
      }
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
      if (!h.ready) {
        h.rejectStartup?.(new Error(`[${spec.name}] port conflict during startup`));
      }
      this.handles.delete(spec.name);
      return;
    }

    h.restartCount += 1;
    h.lastCrashAt = Date.now();
    logger.error(`[${spec.name}] crashed (code=${code} signal=${signal}), restart #${h.restartCount}`);

    if (h.restartCount > this.MAX_RESTART) {
      logger.error(`[${spec.name}] exceeded MAX_RESTART=${this.MAX_RESTART}, NOT restarting`);
      if (!h.ready) {
        h.rejectStartup?.(new StartupCrashError(h.restartCount));
      }
      // 留待托盘弹气泡（阶段 3）
      return;
    }

    if (!h.ready) {
      h.rejectStartup?.(new StartupCrashError(h.restartCount));
      return;
    }

    const backoffMs = this.restartBackoffMs(h.restartCount);
    const prevCount = h.restartCount; // 保底：stop() 会删 handle，提前保存
    logger.info(`[${spec.name}] will restart in ${backoffMs}ms`);
    h.restartTimer = setTimeout(() => {
      h.restartTimer = undefined;
      if (!this.isQuitting && !h.stopping && this.handles.get(spec.name) === h) {
        this.restart(spec, prevCount, h).catch((e) => logger.error(`[${spec.name}] restart failed:`, e));
      }
    }, backoffMs);
  }

  /** 重启子进程（保底保留 crash 计数，start() 里的 stop 会清零） */
  private restart(
    spec: ChildSpec,
    prevCount: number,
    expectedHandle: ChildHandle,
  ): Promise<ChildHandle | null> {
    return this.runSerialized(spec.name, () => this.restartInternal(spec, prevCount, expectedHandle));
  }

  private async restartInternal(
    spec: ChildSpec,
    prevCount: number,
    expectedHandle: ChildHandle,
  ): Promise<ChildHandle | null> {
    if (this.handles.get(spec.name) !== expectedHandle || expectedHandle.stopping) {
      return null;
    }
    if (expectedHandle.proc.exitCode === null && (expectedHandle.proc.signalCode ?? null) === null) {
      logger.error(`[${spec.name}] refusing to restart before the old process has exited`);
      return null;
    }
    expectedHandle.stopping = true;
    // exit 事件已经确认该代进程结束；不得再按旧 PID taskkill（PID 可能已被复用）。
    this.handles.delete(spec.name);
    // 建新的 handle 时继承重启计数；startup crash 由当前串行 owner 继续重试。
    let restartCount = prevCount;
    while (!this.isQuitting && restartCount <= this.MAX_RESTART) {
      try {
        return await this.startInternal(spec, restartCount);
      } catch (error) {
        if (!(error instanceof StartupCrashError)) throw error;
        restartCount = error.restartCount;
        if (restartCount > this.MAX_RESTART) return null;
        const backoffMs = this.restartBackoffMs(restartCount);
        logger.info(`[${spec.name}] startup crash; retrying in ${backoffMs}ms`);
        await this.waitForBackoff(backoffMs);
      }
    }
    return null;
  }

  /** 创建子进程但不做 stop 清理 */
  private async startInternal(spec: ChildSpec, initialRestartCount = 0): Promise<ChildHandle> {
    await this.assertPortAvailable(spec.name, spec.port);
    if (this.isQuitting) throw new Error(`[${spec.name}] start aborted during shutdown`);
    const logFile = path.join(logsDir(), `${spec.name}.log`);
    const logStream = fs.createWriteStream(logFile, { flags: 'a' });
    logStream.write(`\n\n=== start ${new Date().toISOString()} ===\n`);
    logStream.write(`cmd: ${spec.command} ${spec.args.join(' ')}\n`);
    logStream.write(`cwd: ${spec.cwd}\n`);

    logger.info(`[${spec.name}] spawning: ${spec.command} ${spec.args.join(' ')}`);

    const useShell = spec.shell ?? (process.platform === 'win32');
    const generation = spec.generationHealthCheck ? randomBytes(32).toString('hex') : undefined;

    // 合并 process.env 后再剥代理，避免 Windows HTTP_PROXY 污染 Node fetch（分镜出站）
    const env = stripSystemProxy({
      ...process.env,
      ...(spec.env as Record<string, string | undefined>),
      ...(generation ? { ELECTRON_SERVICE_GENERATION: generation } : {}),
    });

    const proc = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      shell: useShell,
    });

    let rejectStartup!: (error: Error) => void;
    const startupFailure = new Promise<never>((_resolve, reject) => {
      rejectStartup = reject;
    });
    const h: ChildHandle = {
      proc,
      port: spec.port,
      restartCount: initialRestartCount,
      lastCrashAt: 0,
      stopping: false,
      readinessAbort: new AbortController(),
      logStream,
      logClosed: false,
      ready: false,
      rejectStartup,
      recentStderr: [],
    };
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
      rejectStartup(new Error(`[${spec.name}] failed to spawn: ${err.message}`, { cause: err }));
    });

    proc.on('exit', (code, signal) => this.handleExit(spec, h, code, signal));
    proc.on('close', () => this.closeLogStream(h));

    const healthUrl = spec.healthUrl ?? `http://127.0.0.1:${spec.port}/`;
    const timeout = spec.startupTimeoutMs ?? 30_000;
    try {
      await Promise.race([
        waitForHttpReady(healthUrl, timeout, 500, {
          signal: h.readinessAbort.signal,
          expectedHeader: generation
            ? { name: 'X-Electron-Service-Generation', value: generation }
            : undefined,
        }),
        startupFailure,
      ]);
      if (this.handles.get(spec.name) !== h || !this.isHandleAlive(h)) {
        throw new Error(`[${spec.name}] process exited before becoming ready`);
      }
      h.ready = true;
      logger.info(`[${spec.name}] ready at ${healthUrl}`);
    } catch (err) {
      logger.error(`[${spec.name}] startup failed (${timeout}ms), cleaning up`, err);
      if (this.handles.get(spec.name) === h) {
        await this.stopInternal(spec.name, h);
      }
      throw err;
    }

    return h;
  }

  /**
   * 停一个子进程（taskkill 整树）
   */
  async stop(name: string): Promise<void> {
    return this.runSerialized(name, () => this.stopInternal(name));
  }

  private async stopInternal(name: string, expectedHandle?: ChildHandle): Promise<void> {
    const h = this.handles.get(name);
    if (!h) return;
    if (expectedHandle && h !== expectedHandle) return;
    return this.stopHandle(name, h);
  }

  private stopHandle(name: string, h: ChildHandle): Promise<void> {
    if (h.stopPromise) return h.stopPromise;
    const wasAlive = this.isHandleAlive(h);
    h.stopping = true;
    h.readinessAbort.abort();
    if (h.restartTimer !== undefined) {
      clearTimeout(h.restartTimer);
      h.restartTimer = undefined;
    }
    if (this.handles.get(name) === h) this.handles.delete(name);
    h.stopPromise = (async () => {
      try {
        if (!h.proc.pid || !wasAlive) return;
        logger.info(`[${name}] killing pid ${h.proc.pid}`);
        const exited = this.waitForProcessExit(name, h.proc);
        const killed = Promise.resolve()
          .then(() => this.killTree(h.proc.pid!))
          .then(() => true)
          .catch((error) => {
            logger.warn(`[${name}] process-tree kill failed`, error);
            return false;
          });
        let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
        const deadline = new Promise<boolean>((resolve) => {
          deadlineTimer = setTimeout(() => resolve(false), this.exitWaitTimeoutMs);
        });
        const completed = Promise.all([killed, exited]).then(([didKill, didExit]) => didKill && didExit);
        const didComplete = await Promise.race([completed, deadline]);
        if (deadlineTimer !== undefined) clearTimeout(deadlineTimer);
        if (!didComplete) {
          logger.warn(`[${name}] continuing shutdown after ${this.exitWaitTimeoutMs}ms total deadline`);
        }
      } finally {
        this.closeLogStream(h);
      }
    })();
    return h.stopPromise;
  }

  /**
   * 停所有子进程。app 退出前调用。
   */
  async stopAll(): Promise<void> {
    this.isQuitting = true;
    this.shutdownAbort.abort();
    const current = [...this.handles.entries()];
    await Promise.all(current.map(([name, h]) => this.stopHandle(name, h)));
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
