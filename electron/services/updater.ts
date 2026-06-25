/**
 * 自动更新服务（electron-updater 封装）
 *
 * - 差分更新 + 断点续传
 * - 不自动下载，等用户确认
 * - 下载完弹"立即重启安装"
 * - publish 配置见 electron-builder.yml
 *
 * 注意：electron-updater 需 `pnpm add electron-updater@^6` 安装。
 * 在未安装环境下，所有更新操作会自动降级为 no-op。
 */

import { ipcMain, app } from 'electron';
import logger from './logger';
import type { TrayController } from './tray-controller';

let trayRef: TrayController | null = null;
let autoUpdater: any = null;

function getAutoUpdater(): any {
  if (autoUpdater) return autoUpdater;
  try {
    const mod = require('electron-updater');
    autoUpdater = mod.autoUpdater;
    return autoUpdater;
  } catch {
    return null;
  }
}

export function setupAutoUpdater(tray: TrayController) {
  trayRef = tray;
  const au = getAutoUpdater();
  if (!au) {
    logger.warn('electron-updater not installed, auto-update disabled');
    return;
  }

  au.logger = logger as any;
  au.autoDownload = false;
  au.autoInstallOnAppQuit = true;
  au.allowDowngrade = false;

  au.on('checking-for-update', () => logger.info('updater: checking...'));
  au.on('update-available', (info: any) => {
    logger.info('updater: update available', info.version);
    tray.notify('发现新版本', `v${info.version} 可用`);
  });
  au.on('update-not-available', () => {
    tray.notify('中台助手', '已是最新版本');
  });
  au.on('update-downloaded', () => {
    tray.notify('更新已就绪', '下次启动时自动安装');
  });
  au.on('error', (err: Error) => {
    logger.error('updater: error', err);
    tray.notify('更新失败', err.message || '未知错误');
  });
}

export function registerUpdaterIpc() {
  ipcMain.handle('check-for-update', async () => {
    const au = getAutoUpdater();
    if (!au) return { ok: false, error: 'electron-updater 未安装' };
    try {
      const result = await au.checkForUpdates();
      return { ok: true, info: result?.updateInfo };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('download-update', async () => {
    const au = getAutoUpdater();
    if (!au) return { ok: false, error: 'electron-updater 未安装' };
    try {
      await au.downloadUpdate();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  });

  ipcMain.handle('install-update', () => {
    const au = getAutoUpdater();
    if (au) au.quitAndInstall(true, true);
  });

  ipcMain.handle('get-app-version', () => app.getVersion());
}