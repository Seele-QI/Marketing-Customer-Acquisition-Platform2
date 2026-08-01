/**
 * Preload 脚本（contextBridge）
 *
 * 暴露给渲染进程的安全 API：更新 / 日志 / 云端 Key 同步
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { ServiceRuntimeStatus } from './services/service-runtime-status';

type ClientErrorReportPayload = {
  category: 'network' | 'local_service' | 'cloud_service' | 'timeout' | 'unknown'
  requestPath: string
  status?: number
  timestamp: string
}

type UpdateProgressPayload = {
  percent?: number
  transferred?: number
  total?: number
}

type UpdateStatusPayload = {
  status: string
  currentVersion: string
  availableVersion?: string
  releaseNotes?: string
  percent?: number
  transferred?: number
  total?: number
  error?: string
  forceRequired?: boolean
}

contextBridge.exposeInMainWorld('electronAPI', {
  // 版本与更新
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppInfo: () => ipcRenderer.invoke('get-app-info'),
  getUpdateStatus: () => ipcRenderer.invoke('get-update-status'),

  onUpdateProgress: (handler: (payload: UpdateProgressPayload) => void) => {
    const listener = (_event: unknown, payload: UpdateProgressPayload) => {
      handler(payload || {});
    };
    ipcRenderer.on('update-download-progress', listener);
    return () => ipcRenderer.removeListener('update-download-progress', listener);
  },

  onUpdateStatus: (handler: (payload: UpdateStatusPayload) => void) => {
    const listener = (_event: unknown, payload: UpdateStatusPayload) => {
      handler(payload);
    };
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },

  // 日志
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  exportLogs: () => ipcRenderer.invoke('export-logs'),

  // 云端 Key 同步（登录后由渲染进程触发）
  syncConfig: () => ipcRenderer.invoke('config:sync'),
  getServiceRuntimeStatus: (): Promise<ServiceRuntimeStatus> => (
    ipcRenderer.invoke('service-runtime:get-status')
  ),
  onServiceRuntimeStatus: (handler: (payload: ServiceRuntimeStatus) => void) => {
    const listener = (_event: unknown, payload: ServiceRuntimeStatus) => handler(payload);
    ipcRenderer.on('service-runtime:status', listener);
    return () => ipcRenderer.removeListener('service-runtime:status', listener);
  },
  restartApp: () => ipcRenderer.invoke('app:restart'),
  reportClientError: (payload: ClientErrorReportPayload) => (
    ipcRenderer.invoke('client-error:report', payload)
  ),

  onAuthRequireLogin: (handler: (payload: { message?: string }) => void) => {
    const listener = (_event: unknown, payload: { message?: string }) => {
      handler(payload);
    };
    ipcRenderer.on('auth:require-login', listener);
    return () => ipcRenderer.removeListener('auth:require-login', listener);
  },

  onConfigKeysReady: (handler: (payload: { ok?: boolean }) => void) => {
    const listener = (_event: unknown, payload: { ok?: boolean }) => {
      handler(payload || { ok: true });
    };
    ipcRenderer.on('config:keys-ready', listener);
    return () => ipcRenderer.removeListener('config:keys-ready', listener);
  },

  // 平台
  isElectron: true,
  platform: process.platform,
  /** 本地 FastAPI 静态资源基址（分镜图 / 视频 /static/*） */
  localFastapiBase: 'http://127.0.0.1:8010',
});
