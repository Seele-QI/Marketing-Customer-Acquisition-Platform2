/**
 * Preload 脚本（contextBridge）
 *
 * 暴露给渲染进程的安全 API：
 * - window.electronAPI.checkForUpdate()
 * - window.electronAPI.downloadUpdate()
 * - window.electronAPI.installUpdate()
 * - window.electronAPI.getAppVersion()
 * - window.electronAPI.openLogsFolder()
 * - window.electronAPI.exportLogs()
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // 版本与更新
  checkForUpdate: () => ipcRenderer.invoke('check-for-update'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // 日志
  openLogsFolder: () => ipcRenderer.invoke('open-logs-folder'),
  exportLogs: () => ipcRenderer.invoke('export-logs'),

  // 平台
  isElectron: true,
  platform: process.platform,
});