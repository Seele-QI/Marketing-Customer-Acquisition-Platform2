/**
 * 每 1 分钟自动同步云端 Key / 模型配置。
 */

import logger from './logger';

const ONE_MINUTE_MS = 60 * 1000;

let timer: ReturnType<typeof setInterval> | null = null;

export type ConfigSyncRequest = () => Promise<unknown>;

export function startConfigSyncScheduler(
  requestSync: ConfigSyncRequest,
): void {
  stopConfigSyncScheduler();

  const run = async () => {
    try {
      await requestSync();
    } catch (error) {
      logger.error('config-scheduler: sync failed unexpectedly', error);
    }
  };

  void run();
  timer = setInterval(() => {
    void run();
  }, ONE_MINUTE_MS);
  logger.info('config-scheduler: started (interval 1m)');
}

export function stopConfigSyncScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
