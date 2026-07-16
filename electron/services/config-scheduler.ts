/**
 * 每 12 小时自动同步云端 Key 配置。
 */

import type { BrowserWindow } from 'electron';
import logger from './logger';
import { syncConfig, type ConfigSyncResult } from './config-sync-client';

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

export type ConfigSyncHandler = (result: ConfigSyncResult) => void | Promise<void>;

export function startConfigSyncScheduler(
  getWindow: () => BrowserWindow | null,
  getNextOrigin: () => string,
  onResult?: ConfigSyncHandler,
): void {
  stopConfigSyncScheduler();

  const run = async () => {
    const result = await syncConfig(getWindow(), getNextOrigin());
    if (onResult) {
      await onResult(result);
    }
  };

  void run();
  timer = setInterval(() => {
    void run();
  }, TWELVE_HOURS_MS);
  logger.info('config-scheduler: started (interval 12h)');
}

export function stopConfigSyncScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
