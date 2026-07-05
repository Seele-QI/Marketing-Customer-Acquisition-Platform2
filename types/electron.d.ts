/** 渲染进程通过 preload 暴露的 Electron API */
interface ElectronAPI {
  checkForUpdate: () => Promise<unknown>
  downloadUpdate: () => Promise<unknown>
  installUpdate: () => Promise<unknown>
  getAppVersion: () => Promise<string>
  openLogsFolder: () => Promise<unknown>
  exportLogs: () => Promise<unknown>
  isElectron: true
  platform: string
}

interface Window {
  electronAPI?: ElectronAPI
}
