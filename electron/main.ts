/**
 * Electron 主进程入口
 *
 * prod：加载打包 .env → 子进程 → 主窗口 → 登录后云端 Key 同步
 */

import './apply-packaged-env';

import { app, BrowserWindow, ipcMain, dialog, session, shell, type IpcMainInvokeEvent } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from './services/logger';
import { childManager, registerQuitHook, type ChildSpec } from './services/child-process-manager';
import { TrayController, type TrayOptions } from './services/tray-controller';
import { setAutoLaunch, isAutoLaunchEnabled } from './services/auto-launch';
import { exportLogs, openLogsFolder } from './services/log-collector';
import { injectApiKeys } from './services/env-injector';
import { stripSystemProxy } from './utils/strip-system-proxy';
import { attachEditableContextMenu } from './utils/editable-context-menu';
import { syncConfig } from './services/config-sync-client';
import { startConfigSyncScheduler, stopConfigSyncScheduler } from './services/config-scheduler';
import { ConfigUpdateCoordinator } from './services/config-update-coordinator';
import { waitForVideoTasksIdle } from './services/config-apply-guard';
import {
  createServiceRuntimeStatus,
  type ServiceRuntimeStatus,
} from './services/service-runtime-status';
import { createRestartAppHandler } from './services/app-restart';
import { handleStartupFailure } from './services/startup-recovery';
import { sanitizeClientErrorReport } from './services/client-error-report';
import { isTrustedIpcEvent, isTrustedRendererUrl } from './services/trusted-ipc';
import { attachRendererNetworkLogBridge } from './services/renderer-network-log';
import {
  setupAutoUpdater,
  registerUpdaterIpc,
  checkForUpdatesQuiet,
  enforceManifestForceUpdate,
  setUpdaterMainWindow,
} from './services/updater';
import {
  NEXT_PORT,
  UVICORN_PORT,
  bgmDir,
  videoCacheDir,
  videoPostprocessDir,
  ffmpegBinDir,
  pythonRoot,
  pythonAppLibParent,
  nextStandaloneRoot,
  resourcesRoot,
  accountsDbPath,
  writePorts,
} from './utils/paths';
import { findFreePort as findAvailablePort } from './utils/port-finder';
import { ensureDistributionSecret } from './services/distribution-secret';

/* ============ 初始化 ============ */

if (process.platform === 'win32') {
  app.setAppUserModelId('com.cuocuoai');
}

// 必须在 app.whenReady() 之前：禁用系统代理，避免 electron-updater 走坏代理被 RST
app.commandLine.appendSwitch('no-proxy-server');

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;
let tray: TrayController | null = null;
let isQuitting = false;
let actualNextPort = NEXT_PORT;
let actualUvicornPort = UVICORN_PORT;
let serviceRuntimeStatus: ServiceRuntimeStatus = createServiceRuntimeStatus('idle');

function publishServiceRuntimeStatus(status: ServiceRuntimeStatus): void {
  serviceRuntimeStatus = status;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('service-runtime:status', status);
  }
}

const configUpdateCoordinator = new ConfigUpdateCoordinator({
  sync: () => syncConfig(mainWindow, nextOrigin()),
  apply: (configVersion) => restartChildrenWithFreshKeys(configVersion),
  publish: publishServiceRuntimeStatus,
  onSyncResult: (result) => {
    if (!result.ok && result.requireLogin) notifyRequireLogin(result.message);
  },
  onApplyError: (error, configVersion) => {
    logger.error(`config-update: failed to apply ${configVersion}`, error);
  },
});

const restartApp = createRestartAppHandler({
  beginQuit: () => { isQuitting = true; },
  stopScheduler: stopConfigSyncScheduler,
  stopChildren: () => childManager.stopAll(),
  onStopError: () => logger.error('app-restart: child cleanup failed; continuing controlled relaunch'),
  relaunch: () => app.relaunch(),
  exit: (code) => app.exit(code),
});

registerQuitHook();

function cloudApiUrl(): string {
  return (process.env.CLOUD_API_URL || '').trim();
}

/** 子进程内 fetch 不走 Windows 残留系统代理（与 Python httpx trust_env=False 对齐） */
function withoutSystemProxy(env: Record<string, string>): Record<string, string> {
  return stripSystemProxy(env);
}

function nextOrigin(): string {
  return `http://127.0.0.1:${actualNextPort}`;
}

function requireTrustedIpc(event: IpcMainInvokeEvent): void {
  if (!isTrustedIpcEvent(event, mainWindow, nextOrigin())) {
    logger.warn('ipc: rejected untrusted renderer request');
    throw new Error('FORBIDDEN');
  }
}

function openExternalHttps(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return;
    void shell.openExternal(parsed.href).catch(() => {
      logger.warn('navigation: failed to open external HTTPS URL');
    });
  } catch {
    // Ignore malformed and non-HTTPS targets.
  }
}

/* ============ 单实例锁 ============ */

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn('another instance is running, quit');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
  bootstrap();
}

/* ============ 主流程 ============ */

async function bootstrap() {
  await app.whenReady();
  logger.info('app ready, isDev=' + isDev);

  // 兜底：默认 session 直连（electron-updater 使用默认 session）
  try {
    await session.defaultSession.setProxy({ mode: 'direct' });
  } catch (err) {
    logger.warn('setProxy(direct) failed', err);
  }

  if (!isAutoLaunchEnabled()) {
    setAutoLaunch(true);
  }

  try {
    actualNextPort = await findAvailablePort(NEXT_PORT);
    actualUvicornPort = await findAvailablePort(UVICORN_PORT);
    logger.info(`ports allocated: next=${actualNextPort}, uvicorn=${actualUvicornPort}`);
  } catch (err) {
    logger.error('port allocation failed:', err);
    await handleStartupFailure({
      showMessageBox: (options) => dialog.showMessageBox(options),
      restartApp,
      exitApp: quitApp,
    });
    return;
  }

  writePorts(actualNextPort, actualUvicornPort);

  mainWindow = createMainWindow();
  setUpdaterMainWindow(mainWindow);

  const trayOpts: TrayOptions = {
    mainWindow,
    onShow: () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    onQuit: () => quitApp(),
    onShowLogs: () => {
      openLogsFolder();
    },
    onExportLogs: () => {
      exportLogs().catch((e: Error) => logger.error('export logs:', e));
    },
  };
  tray = new TrayController(trayOpts);
  tray.init();

  setupAutoUpdater(tray);
  registerUpdaterIpc(requireTrustedIpc);

  ipcMain.handle('open-logs-folder', (event) => {
    requireTrustedIpc(event);
    return openLogsFolder();
  });
  ipcMain.handle('export-logs', (event) => {
    requireTrustedIpc(event);
    return exportLogs();
  });
  ipcMain.handle('config:sync', (event) => {
    requireTrustedIpc(event);
    return handleConfigSync();
  });
  ipcMain.handle('service-runtime:get-status', (event) => {
    requireTrustedIpc(event);
    return serviceRuntimeStatus;
  });
  ipcMain.handle('app:restart', (event) => {
    requireTrustedIpc(event);
    return restartApp();
  });
  ipcMain.handle('client-error:report', (event, payload: unknown) => {
    requireTrustedIpc(event);
    const report = sanitizeClientErrorReport(payload);
    if (!report) return { ok: false };
    logger.warn('client-error:', report);
    return { ok: true };
  });

  if (!isDev && cloudApiUrl()) {
    const forced = await enforceManifestForceUpdate(cloudApiUrl());
    if (forced) {
      isQuitting = true;
      app.quit();
      return;
    }
  }

  try {
    await startChildren(actualNextPort, actualUvicornPort);
  } catch (err) {
    logger.error('failed to start child processes:', err);
    await handleStartupFailure({
      showMessageBox: (options) => dialog.showMessageBox(options),
      restartApp,
      exitApp: quitApp,
    });
    return;
  }

  if (cloudApiUrl()) {
    startConfigSyncScheduler(() => configUpdateCoordinator.requestSync());
  }

  mainWindow.loadURL(nextOrigin());

  if (!isDev) {
    setTimeout(() => checkForUpdatesQuiet(), 15_000);
  }
}

async function handleConfigSync() {
  return configUpdateCoordinator.requestSync();
}

function notifyRequireLogin(message: string) {
  mainWindow?.webContents.send('auth:require-login', { message });
}

/* ============ 主窗口 ============ */

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    title: '招财猫',
    backgroundColor: '#0a0a0a',
    show: false,
    autoHideMenuBar: !isDev,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.once('ready-to-show', () => win.show());

  attachEditableContextMenu(win);

  win.webContents.on('will-navigate', (event, url) => {
    if (isTrustedRendererUrl(url, nextOrigin())) return;
    event.preventDefault();
    openExternalHttps(url);
  });

  attachRendererNetworkLogBridge(win, (message) => {
    logger.warn('renderer-network:', message);
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalHttps(url);
    return { action: 'deny' };
  });

  win.on('close', (e) => {
    if (!isQuitting && !process.argv.includes('--force-quit')) {
      e.preventDefault();
      win.hide();
      tray?.notify('招财猫', '已最小化到托盘，右键托盘图标可退出');
      return false;
    }
    return true;
  });

  win.on('closed', () => {
    mainWindow = null;
    setUpdaterMainWindow(null);
  });

  return win;
}

/* ============ 子进程 ============ */

type RuntimeChildSpecs = Record<'next' | 'uvicorn', ChildSpec>;

async function restartChildrenWithFreshKeys(configVersion?: string) {
  const waitStartedAt = Date.now();
  const guardResult = await waitForVideoTasksIdle({
    probeActive: async () => {
      const [videoResponse, planResponse] = await Promise.all([
        fetch(
          `http://127.0.0.1:${actualUvicornPort}/api/dh-video-v2/runtime-state`,
          { signal: AbortSignal.timeout(2_000) },
        ),
        fetch(
          `http://127.0.0.1:${actualNextPort}/api/dh-video-v2/plan-script/ready`,
          { signal: AbortSignal.timeout(2_000) },
        ),
      ]);
      if (!videoResponse.ok) throw new Error(`video runtime state HTTP ${videoResponse.status}`);
      if (!planResponse.ok) throw new Error(`plan runtime state HTTP ${planResponse.status}`);
      const video = await videoResponse.json() as { active?: boolean };
      const plan = await planResponse.json() as { active?: boolean };
      return video.active === true || plan.active === true;
    },
  });
  const waitedMs = Date.now() - waitStartedAt;
  if (waitedMs >= 1_000) {
    logger.info(`config-update: video task guard result=${guardResult} waited_ms=${waitedMs}`);
  }
  if (guardResult === 'timed_out') {
    logger.warn('config-update: video task guard timed out; applying config after task timeout window');
  } else if (guardResult === 'unavailable') {
    logger.warn('config-update: runtime state unavailable; applying config without task guard');
  }
  logger.info(`restarting child processes after config sync${configVersion ? ` (${configVersion})` : ''}`);
  const specs = await createChildSpecs(actualNextPort, actualUvicornPort);
  await startChildSpecs(specs, ['uvicorn', 'next']);
  mainWindow?.webContents.send('config:keys-ready', { ok: true });
}

async function createChildSpecs(nextPort: number, uvicornPort: number): Promise<RuntimeChildSpecs> {
  const cookieEncryptionKey = ensureDistributionSecret();
  if (isDev) {
    const projectRoot = process.cwd();
    const cloudUrl = cloudApiUrl();
    const fastApiBase = `http://127.0.0.1:${uvicornPort}`;
    const devEnv: Record<string, string> = withoutSystemProxy({
      NODE_ENV: 'development',
      PORT: String(nextPort),
      FASTAPI_URL: fastApiBase,
      NEXT_PUBLIC_FASTAPI_URL: fastApiBase,
      COOKIE_ENCRYPTION_KEY: cookieEncryptionKey,
      ...(cloudUrl ? { CLOUD_API_URL: cloudUrl } : {}),
    });
    const injectedNextDev = withoutSystemProxy(await injectApiKeys(devEnv));
    return {
      next: {
        name: 'next',
        command: 'pnpm',
        args: ['exec', 'next', 'dev', '--port', String(nextPort)],
        cwd: projectRoot,
        env: injectedNextDev,
        port: nextPort,
        healthUrl: `http://127.0.0.1:${nextPort}/api/electron-health`,
        generationHealthCheck: true,
        startupTimeoutMs: 60_000,
      },
      uvicorn: {
        name: 'uvicorn',
        command: 'python',
        args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(uvicornPort), '--no-access-log'],
        cwd: projectRoot,
        env: {
          ...injectedNextDev,
          NODE_ENV: 'production',
          PYTHONUNBUFFERED: '1',
          PORT: String(uvicornPort),
        },
        port: uvicornPort,
        healthUrl: `http://127.0.0.1:${uvicornPort}/health`,
        generationHealthCheck: true,
        startupTimeoutMs: 30_000,
      },
    };
  } else {
    const exeExt = process.platform === 'win32' ? '.exe' : '';
    const fastApiBase = `http://127.0.0.1:${uvicornPort}`;
    const pyRoot = pythonRoot();
    const ffBin = ffmpegBinDir();
    const pythonBin = path.join(pyRoot, `python${exeExt}`);
    const ffmpegBin = path.join(ffBin, `ffmpeg${exeExt}`);
    const ffprobeBin = path.join(ffBin, `ffprobe${exeExt}`);
    if (process.platform === 'darwin') {
      for (const bin of [pythonBin, ffmpegBin, ffprobeBin]) {
        try {
          if (fs.existsSync(bin)) fs.chmodSync(bin, 0o755);
        } catch (err) {
          logger.warn(`chmod failed for ${bin}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }
    const pythonPath = [
      resourcesRoot(),
      path.join(pyRoot, 'site-packages'),
      pythonAppLibParent(),
    ].join(path.delimiter);
    const cloudUrl = cloudApiUrl();
    const baseEnv: Record<string, string> = {
      NODE_ENV: 'production',
      PYTHONUNBUFFERED: '1',
      FASTAPI_URL: fastApiBase,
      NEXT_PUBLIC_FASTAPI_URL: fastApiBase,
      ...(cloudUrl ? { CLOUD_API_URL: cloudUrl } : {}),
      FFMPEG_EXE: ffmpegBin,
      FFPROBE_EXE: ffprobeBin,
      DATA_DIR: videoCacheDir(),
      VIDEO_BGM_DIR: bgmDir(),
      VIDEO_POSTPROCESS_DIR: videoPostprocessDir(),
      CREDIT_DB_OVERRIDE: accountsDbPath(),
      COOKIE_ENCRYPTION_KEY: cookieEncryptionKey,
    };
    const prodEnv = withoutSystemProxy(await injectApiKeys(baseEnv));
    const nextRoot = nextStandaloneRoot();
    return {
      next: {
        name: 'next',
        command: process.execPath,
        args: [path.join(nextRoot, 'server.js')],
        cwd: nextRoot,
        shell: false,
        env: {
          ...prodEnv,
          ELECTRON_RUN_AS_NODE: '1',
          NODE_ENV: 'production',
          HOSTNAME: '127.0.0.1',
          PORT: String(nextPort),
          NODE_PATH: [
            path.join(nextRoot, 'node_modules'),
            path.join(nextRoot, 'node_modules', '.pnpm', 'node_modules'),
          ].join(path.delimiter),
        },
        port: nextPort,
        healthUrl: `http://127.0.0.1:${nextPort}/api/electron-health`,
        generationHealthCheck: true,
        startupTimeoutMs: 60_000,
      },
      uvicorn: {
        name: 'uvicorn',
        command: pythonBin,
        args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(uvicornPort), '--no-access-log'],
        cwd: resourcesRoot(),
        env: {
          ...prodEnv,
          NODE_ENV: 'production',
          PORT: String(uvicornPort),
          PYTHONPATH: pythonPath,
        },
        port: uvicornPort,
        healthUrl: `http://127.0.0.1:${uvicornPort}/health`,
        generationHealthCheck: true,
        startupTimeoutMs: 30_000,
      },
    };
  }
}

async function startChildSpecs(
  specs: RuntimeChildSpecs,
  order: ReadonlyArray<keyof RuntimeChildSpecs>,
): Promise<void> {
  for (const service of order) {
    await childManager.start(specs[service]);
  }
}

async function startChildren(nextPort: number, uvicornPort: number): Promise<void> {
  const specs = await createChildSpecs(nextPort, uvicornPort);
  await startChildSpecs(specs, ['next', 'uvicorn']);
}

/* ============ 退出 ============ */

async function quitApp() {
  logger.info('quit initiated by tray');
  isQuitting = true;
  stopConfigSyncScheduler();
  tray?.destroy();
  tray = null;
  await childManager.stopAll();
  app.exit(0);
}

app.on('window-all-closed', () => {
  // Windows 托盘存活，不关进程
});

app.on('activate', () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  }
});

process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('uncaughtException:', err);
});
