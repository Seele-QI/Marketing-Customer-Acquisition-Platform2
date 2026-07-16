/** 渲染进程通过 preload 暴露的 Electron API */

export type ElectronUpdateProgress = {
  percent?: number
  transferred?: number
  total?: number
}

export type ElectronUpdateStatus = {
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

export type ElectronAppInfo = {
  version: string
  isPackaged: boolean
  feedConfigured: boolean
}

export interface ElectronAPI {
  checkForUpdate: () => Promise<{
    ok: boolean
    error?: string
    info?: { version?: string; releaseNotes?: string }
    status?: string
  }>
  downloadUpdate: () => Promise<{ ok: boolean; error?: string }>
  installUpdate: () => Promise<{ ok: boolean } | void>
  getAppVersion: () => Promise<string>
  getAppInfo: () => Promise<ElectronAppInfo>
  getUpdateStatus: () => Promise<ElectronUpdateStatus>
  onUpdateProgress: (handler: (payload: ElectronUpdateProgress) => void) => () => void
  onUpdateStatus: (handler: (payload: ElectronUpdateStatus) => void) => () => void
  openLogsFolder: () => Promise<unknown>
  exportLogs: () => Promise<unknown>
  syncConfig: () => Promise<unknown>
  onAuthRequireLogin: (handler: (payload: { message?: string }) => void) => () => void
  /** 云端 Key sync + 子进程重启完成后触发 */
  onConfigKeysReady: (handler: (payload: { ok?: boolean }) => void) => () => void
  /** 本地 uvicorn 基址，用于 /static/video-* 资源 */
  localFastapiBase: string
  isElectron: true
  platform: string
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
