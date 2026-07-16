/**
 * 自动更新服务（electron-updater 封装）
 *
 * - 软更：设置页检查 / 下载 / 安装；启动静默检查 + 托盘提示
 * - 强更：manifest force_update → 应用内下载 → quitAndInstall（不打开浏览器）
 * - Feed：UPDATE_FEED_URL / CENTRAL_UPDATE_URL，或 electron-builder.yml publish
 */

import { ipcMain, app, dialog, BrowserWindow } from 'electron';
import logger from './logger';
import type { TrayController } from './tray-controller';
import { toFriendlyUpdateError } from '../utils/friendly-update-error';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error';

export type UpdateState = {
  status: UpdateStatus;
  currentVersion: string;
  availableVersion?: string;
  releaseNotes?: string;
  percent?: number;
  transferred?: number;
  total?: number;
  error?: string;
  forceRequired?: boolean;
};

let trayRef: TrayController | null = null;
let autoUpdater: any = null;
let quietCheck = false;
let broadcastWin: BrowserWindow | null = null;
let updateState: UpdateState = {
  status: 'idle',
  currentVersion: '',
};

function getAutoUpdater(): any {
  if (autoUpdater) return autoUpdater;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('electron-updater');
    autoUpdater = mod.autoUpdater;
    return autoUpdater;
  } catch {
    return null;
  }
}

function resolveFeedUrl(): string {
  return (
    (process.env.UPDATE_FEED_URL || '').trim() ||
    (process.env.CENTRAL_UPDATE_URL || '').trim()
  ).replace(/\/?$/, '/');
}

function normalizeReleaseNotes(raw: unknown): string {
  if (raw == null) return '';
  if (typeof raw === 'string') return raw.trim();
  if (Array.isArray(raw)) {
    return raw
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'note' in item) {
          return String((item as { note?: unknown }).note || '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return String(raw).trim();
}

function setState(partial: Partial<UpdateState>) {
  updateState = {
    ...updateState,
    currentVersion: updateState.currentVersion || app.getVersion(),
    ...partial,
  };
  emitToRenderer('update-status', { ...updateState });
}

function emitToRenderer(channel: string, payload: unknown) {
  try {
    if (broadcastWin && !broadcastWin.isDestroyed()) {
      broadcastWin.webContents.send(channel, payload);
    }
  } catch {
    /* ignore */
  }
}

/** 主窗口创建后注入，用于向设置页推送进度/状态 */
export function setUpdaterMainWindow(win: BrowserWindow | null) {
  broadcastWin = win;
}

export function setupAutoUpdater(tray: TrayController) {
  trayRef = tray;
  updateState.currentVersion = app.getVersion();

  const au = getAutoUpdater();
  if (!au) {
    logger.warn('electron-updater not installed, auto-update disabled');
    return;
  }

  const feed = resolveFeedUrl();
  if (feed && feed !== '/') {
    try {
      au.setFeedURL({ provider: 'generic', url: feed });
      logger.info('updater: feed', feed);
    } catch (err) {
      logger.warn('updater: setFeedURL failed', err);
    }
  } else {
    logger.warn('updater: UPDATE_FEED_URL / CENTRAL_UPDATE_URL unset; using builder publish url if any');
  }

  au.logger = logger as any;
  au.autoDownload = false;
  au.autoInstallOnAppQuit = true;
  au.allowDowngrade = false;

  au.on('checking-for-update', () => {
    logger.info('updater: checking...');
    setState({ status: 'checking', error: undefined });
  });

  au.on('update-available', (info: any) => {
    const version = String(info?.version || '');
    const notes = normalizeReleaseNotes(info?.releaseNotes);
    logger.info('updater: update available', version);
    setState({
      status: 'available',
      availableVersion: version,
      releaseNotes: notes || undefined,
      error: undefined,
      percent: 0,
    });
    trayRef?.notify('发现新版本', `v${version} 可用，请到「设置」页下载更新`);
  });

  au.on('update-not-available', () => {
    setState({
      status: 'not-available',
      availableVersion: undefined,
      releaseNotes: undefined,
      percent: undefined,
      error: undefined,
    });
    if (!quietCheck) trayRef?.notify('招财猫', '已是最新版本');
  });

  au.on('download-progress', (progress: any) => {
    const percent = Number(progress?.percent ?? 0);
    const transferred = Number(progress?.transferred ?? 0);
    const total = Number(progress?.total ?? 0);
    setState({
      status: 'downloading',
      percent,
      transferred,
      total,
    });
    emitToRenderer('update-download-progress', { percent, transferred, total });
  });

  au.on('update-downloaded', (info: any) => {
    const version = String(info?.version || updateState.availableVersion || '');
    logger.info('updater: downloaded', version);
    setState({
      status: 'ready',
      availableVersion: version || updateState.availableVersion,
      percent: 100,
      error: undefined,
    });
    trayRef?.notify('更新已就绪', '可在「设置」页安装并重启');
  });

  au.on('error', (err: Error) => {
    const raw = err?.message || '未知错误';
    const friendly = toFriendlyUpdateError(raw);
    logger.error('updater: error', raw);
    setState({
      status: 'error',
      error: friendly,
    });
    if (!quietCheck) trayRef?.notify('更新失败', friendly);
    emitToRenderer('updater-error', { message: friendly });
  });
}

/** 启动时安静检查一次（不打扰「已是最新」） */
export function checkForUpdatesQuiet() {
  const au = getAutoUpdater();
  if (!au || !app.isPackaged) return;
  quietCheck = true;
  au.checkForUpdates()
    .catch((err: Error) => logger.warn('updater quiet check failed', err?.message || err))
    .finally(() => {
      setTimeout(() => {
        quietCheck = false;
      }, 5000);
    });
}

/**
 * 云端策略层强更：GET /api/central/manifest
 * force 时应用内下载并 quitAndInstall；返回 true 表示调用方应结束启动（退出或即将安装重启）
 */
function deriveWebBaseFromApi(apiBase: string): string {
  // mcap-cloud-api.xxx → mcap-cloud-web.xxx
  return apiBase
    .replace(/mcap-cloud-api/i, 'mcap-cloud-web')
    .replace(/zhongtai-cloud-api/i, 'zhongtai-cloud-web')
    .replace(/\/api\.?/i, (m) => (m.toLowerCase().includes('api') ? m.replace(/api/i, 'web') : m));
}

/** 按优先级探测 manifest：显式 URL → api → web 旁路 → 自定义 CLOUD_WEB_URL */
function resolveManifestBases(cloudApiBase: string): string[] {
  const bases: string[] = [];
  const push = (raw: string) => {
    const b = (raw || '').trim().replace(/\/+$/, '');
    if (b && !bases.includes(b)) bases.push(b);
  };
  push(process.env.CLOUD_MANIFEST_URL || '');
  push(cloudApiBase);
  push(process.env.CLOUD_WEB_URL || '');
  push(process.env.NEXT_PUBLIC_APP_URL || '');
  if (cloudApiBase) push(deriveWebBaseFromApi(cloudApiBase));
  return bases;
}

type ManifestPayload = {
  force_update?: boolean;
  latest_version?: string;
  release_notes?: string;
  update_url?: string;
};

async function fetchManifest(cloudApiBase: string): Promise<ManifestPayload | null> {
  const version = encodeURIComponent(app.getVersion());
  for (const base of resolveManifestBases(cloudApiBase)) {
    const url = `${base}/api/central/manifest?client_version=${version}`;
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(12000) });
      if (!r.ok) {
        logger.warn('manifest probe failed', r.status, url);
        continue;
      }
      const data = (await r.json()) as ManifestPayload;
      logger.info('manifest ok via', base);
      return data;
    } catch (err) {
      logger.warn('manifest probe error', url, err);
    }
  }

  // 云端精简镜像缺路由时：用打包 env 本地判定强更门槛（需同步 CENTRAL_FORCE_UPDATE_BELOW）
  const minVer = (process.env.CENTRAL_FORCE_UPDATE_BELOW || '').trim();
  const latest = (process.env.CENTRAL_LATEST_VERSION || '').trim() || '最新';
  const notes = (process.env.CENTRAL_RELEASE_NOTES || '').trim();
  if (minVer) {
    const client = app.getVersion();
    const force = (() => {
      const parse = (v: string) => {
        try {
          return v.split('.').map((x) => parseInt(x, 10) || 0);
        } catch {
          return [0];
        }
      };
      const a = parse(client);
      const b = parse(minVer);
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i++) {
        const x = a[i] ?? 0;
        const y = b[i] ?? 0;
        if (x < y) return true;
        if (x > y) return false;
      }
      return false;
    })();
    logger.warn('manifest: using packaged CENTRAL_FORCE_UPDATE_BELOW fallback', {
      minVer,
      client,
      force,
    });
    return {
      force_update: force,
      latest_version: latest,
      release_notes: notes,
      update_url: resolveFeedUrl(),
    };
  }

  return null;
}

export async function enforceManifestForceUpdate(cloudApiBase: string): Promise<boolean> {
  const base = (cloudApiBase || '').trim().replace(/\/+$/, '');
  if (!base || !app.isPackaged) return false;

  try {
    const data = await fetchManifest(base);
    if (!data) return false;
    if (!data.force_update) return false;

    setState({
      forceRequired: true,
      availableVersion: data.latest_version,
      releaseNotes: (data.release_notes || '').trim() || undefined,
    });

    for (;;) {
      const { response } = await dialog.showMessageBox({
        type: 'warning',
        title: '必须更新',
        message: `当前版本过低，请更新到 v${data.latest_version || '最新'} 后继续使用。`,
        detail: (data.release_notes || '').trim() || '将在应用内下载安装包并重启完成更新。',
        buttons: ['立即更新', '退出'],
        defaultId: 0,
        cancelId: 1,
      });

      if (response !== 0) {
        return true;
      }

      const au = getAutoUpdater();
      if (!au) {
        await dialog.showMessageBox({
          type: 'error',
          title: '更新失败',
          message: '自动更新组件不可用，请联系管理员获取安装包。',
          buttons: ['退出'],
        });
        return true;
      }

      try {
        quietCheck = true;
        au.autoDownload = true;
        setState({ status: 'downloading', percent: 0, error: undefined, forceRequired: true });
        trayRef?.notify('正在更新', '强制更新下载中，请稍候…');

        const downloaded = new Promise<void>((resolve, reject) => {
          const timer = setTimeout(() => {
            cleanup();
            reject(new Error('下载更新超时（30 分钟）'));
          }, 30 * 60 * 1000);
          const onDownloaded = () => {
            cleanup();
            resolve();
          };
          const onError = (err: Error) => {
            cleanup();
            reject(err);
          };
          const onNotAvailable = () => {
            cleanup();
            reject(new Error('强制更新已开启，但更新源未提供新版本，请核对 OSS latest.yml 与 CENTRAL_UPDATE_URL'));
          };
          function cleanup() {
            clearTimeout(timer);
            au.removeListener('update-downloaded', onDownloaded);
            au.removeListener('error', onError);
            au.removeListener('update-not-available', onNotAvailable);
          }
          au.once('update-downloaded', onDownloaded);
          au.once('error', onError);
          au.once('update-not-available', onNotAvailable);
        });

        await au.checkForUpdates();
        await downloaded;

        au.autoDownload = false;
        quietCheck = false;
        setState({ status: 'ready', percent: 100 });
        au.quitAndInstall(true, true);
        return true;
      } catch (err: any) {
        au.autoDownload = false;
        quietCheck = false;
        const message = err?.message || String(err);
        logger.error('force update download failed', message);
        setState({ status: 'error', error: message });

        const { response: retry } = await dialog.showMessageBox({
          type: 'error',
          title: '更新失败',
          message: '下载更新失败',
          detail: message,
          buttons: ['重试', '退出'],
          defaultId: 0,
          cancelId: 1,
        });
        if (retry !== 0) return true;
      }
    }
  } catch (err) {
    logger.warn('manifest force-update check failed', err);
    return false;
  }
}

export function registerUpdaterIpc() {
  ipcMain.handle('get-app-version', () => app.getVersion());

  ipcMain.handle('get-app-info', () => {
    const feed = resolveFeedUrl();
    return {
      version: app.getVersion(),
      isPackaged: app.isPackaged,
      feedConfigured: Boolean(feed && feed !== '/'),
    };
  });

  ipcMain.handle('get-update-status', () => ({
    ...updateState,
    currentVersion: updateState.currentVersion || app.getVersion(),
  }));

  ipcMain.handle('check-for-update', async () => {
    const au = getAutoUpdater();
    if (!au) return { ok: false, error: 'electron-updater 未安装' };
    if (!app.isPackaged) {
      return { ok: false, error: '开发模式不支持自动更新，请使用打包安装包验收' };
    }
    try {
      quietCheck = false;
      const result = await au.checkForUpdates();
      return {
        ok: true,
        info: result?.updateInfo
          ? {
              version: result.updateInfo.version,
              releaseNotes: normalizeReleaseNotes(result.updateInfo.releaseNotes),
            }
          : undefined,
        status: updateState.status,
      };
    } catch (err: any) {
      return { ok: false, error: toFriendlyUpdateError(err?.message) };
    }
  });

  ipcMain.handle('download-update', async () => {
    const au = getAutoUpdater();
    if (!au) return { ok: false, error: 'electron-updater 未安装' };
    if (!app.isPackaged) {
      return { ok: false, error: '开发模式不支持自动更新' };
    }
    try {
      quietCheck = false;
      setState({ status: 'downloading', percent: 0, error: undefined });
      await au.downloadUpdate();
      return { ok: true };
    } catch (err: any) {
      const friendly = toFriendlyUpdateError(err?.message);
      setState({ status: 'error', error: friendly });
      return { ok: false, error: friendly };
    }
  });

  ipcMain.handle('install-update', () => {
    const au = getAutoUpdater();
    if (au) au.quitAndInstall(true, true);
    return { ok: Boolean(au) };
  });
}
