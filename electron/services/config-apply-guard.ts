export type ConfigApplyGuardResult = 'idle' | 'timed_out' | 'unavailable';

type ConfigApplyGuardOptions = {
  probeActive: () => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  pollIntervalMs?: number;
  maxWaitMs?: number;
};

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_MAX_WAIT_MS = 55 * 60 * 1_000;

/**
 * 云配置更新需要重启本地子进程。数字人视频仍在执行时先等任务进入终态，
 * 避免杀掉 FastAPI 内的上游轮询协程。
 */
export async function waitForVideoTasksIdle(
  options: ConfigApplyGuardOptions,
): Promise<ConfigApplyGuardResult> {
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxWaitMs = options.maxWaitMs ?? DEFAULT_MAX_WAIT_MS;
  const startedAt = now();

  for (;;) {
    let active: boolean;
    try {
      active = await options.probeActive();
    } catch {
      return 'unavailable';
    }
    if (!active) return 'idle';
    if (now() - startedAt >= maxWaitMs) return 'timed_out';
    await sleep(pollIntervalMs);
  }
}

