/**
 * Electron 主进程入口
 *
 * prod：加载打包 .env → 子进程 → 主窗口 → 登录后云端 Key 同步
 */

import './apply-packaged-env';

import { app, BrowserWindow, ipcMain, dialog, session } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import logger from './services/logger';
import { childManager, registerQuitHook } from './services/child-process-manager';
import { TrayController, type TrayOptions } from './services/tray-controller';
import { setAutoLaunch, isAutoLaunchEnabled } from './services/auto-launch';
import { exportLogs, openLogsFolder } from './services/log-collector';
import { injectApiKeys } from './services/env-injector';
import { stripSystemProxy } from './utils/strip-system-proxy';
import { attachEditableContextMenu } from './utils/editable-context-menu';
import { syncConfig } from './services/config-sync-client';
import { startConfigSyncScheduler, stopConfigSyncScheduler } from './services/config-scheduler';
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
  logsDir,
} from './utils/paths';
import { findFreePort as findAvailablePort } from './utils/port-finder';

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

function readLogTail(name: string, lines = 20): string {
  try {
    const content = fs.readFileSync(path.join(logsDir(), `${name}.log`), 'utf-8');
    return content.split('\n').slice(-lines).join('\n').trim();
  } catch {
    return '';
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
    dialog.showErrorBox('端口分配失败', `无法找到可用端口：${(err as Error).message}`);
    app.quit();
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
  registerUpdaterIpc();

  ipcMain.handle('open-logs-folder', () => openLogsFolder());
  ipcMain.handle('export-logs', () => exportLogs());
  ipcMain.handle('config:sync', async () => handleConfigSync());

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
    const nextTail = readLogTail('next');
    const detail = nextTail
      ? `\n\n--- next.log (last 20 lines) ---\n${nextTail}`
      : '';
    dialog.showErrorBox(
      '启动失败',
      `无法启动后端服务，请检查日志：\n${path.join(app.getPath('userData'), 'logs')}\n\n错误：${(err as Error).message}${detail}`,
    );
    app.quit();
    return;
  }

  if (cloudApiUrl()) {
    startConfigSyncScheduler(
      () => mainWindow,
      nextOrigin,
      async (result) => {
        if (result.ok && !result.unchanged) {
          await restartChildrenWithFreshKeys();
        } else if (!result.ok && result.requireLogin) {
          notifyRequireLogin(result.message);
        }
      },
    );
  }

  mainWindow.loadURL(nextOrigin());

  if (!isDev) {
    setTimeout(() => checkForUpdatesQuiet(), 15_000);
  }
}

async function handleConfigSync() {
  const result = await syncConfig(mainWindow, nextOrigin());
  if (result.ok && !result.unchanged) {
    await restartChildrenWithFreshKeys();
  } else if (!result.ok && result.requireLogin) {
    notifyRequireLogin(result.message);
  }
  return result;
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

async function restartChildrenWithFreshKeys() {
  logger.info('restarting child processes after config sync');
  await startChildren(actualNextPort, actualUvicornPort);
  mainWindow?.webContents.send('config:keys-ready', { ok: true });
}

async function startChildren(nextPort: number, uvicornPort: number) {
  if (isDev) {
    const projectRoot = process.cwd();
    const cloudUrl = cloudApiUrl();
    const devEnv: Record<string, string> = withoutSystemProxy({
      NODE_ENV: 'development',
      PORT: String(nextPort),
      ...(cloudUrl ? { CLOUD_API_URL: cloudUrl } : {}),
    });
    await childManager.start({
      name: 'next',
      command: 'pnpm',
      args: ['exec', 'next', 'dev', '--port', String(nextPort)],
      cwd: projectRoot,
      env: devEnv,
      port: nextPort,
      startupTimeoutMs: 60_000,
    });
    const uvicornEnv: Record<string, string> = {
      NODE_ENV: 'production',
      PYTHONUNBUFFERED: '1',
      PORT: String(uvicornPort),
      ...(cloudUrl ? { CLOUD_API_URL: cloudUrl } : {}),
    };
    const injectedDev = withoutSystemProxy(await injectApiKeys(uvicornEnv));
    await childManager.start({
      name: 'uvicorn',
      command: 'python',
      args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(uvicornPort), '--no-access-log'],
      cwd: projectRoot,
      env: injectedDev,
      port: uvicornPort,
      healthUrl: `http://127.0.0.1:${uvicornPort}/health`,
      startupTimeoutMs: 30_000,
    });
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
    };
    const prodEnv = withoutSystemProxy(await injectApiKeys(baseEnv));
    const nextRoot = nextStandaloneRoot();
    await childManager.start({
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
        FASTAPI_URL: fastApiBase,
        NEXT_PUBLIC_FASTAPI_URL: fastApiBase,
        ...(cloudUrl ? { CLOUD_API_URL: cloudUrl } : {}),
      },
      port: nextPort,
      startupTimeoutMs: 60_000,
    });
    await childManager.start({
      name: 'uvicorn',
      command: pythonBin,
      args: ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(uvicornPort), '--no-access-log'],
      cwd: resourcesRoot(),
      env: {
        ...prodEnv,
        NODE_ENV: 'production',
        PORT: String(uvicornPort),
        FASTAPI_URL: fastApiBase,
        NEXT_PUBLIC_FASTAPI_URL: fastApiBase,
        ...(cloudUrl ? { CLOUD_API_URL: cloudUrl } : {}),
        PYTHONPATH: pythonPath,
      },
      port: uvicornPort,
      healthUrl: `http://127.0.0.1:${uvicornPort}/health`,
      startupTimeoutMs: 30_000,
    });
  }
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
