import type { ConfigSyncResult } from './config-sync-client';
import {
  createServiceRuntimeStatus,
  type ServiceRuntimeStatus,
} from './service-runtime-status';

const UPDATE_FAILED_MESSAGE = '客户端服务更新未完成，请重启程序后再试。';

export type ConfigUpdateResult = ConfigSyncResult | {
  ok: false;
  code: 'APPLY_FAILED';
  message: string;
  config_version: string;
};

export interface ConfigUpdateCoordinatorOptions {
  sync: () => Promise<ConfigSyncResult>;
  /** Resolve only after both local services pass their generation-aware health checks. */
  apply: (configVersion: string) => Promise<void>;
  publish: (status: ServiceRuntimeStatus) => void;
  onSyncResult?: (result: ConfigSyncResult) => void | Promise<void>;
  onApplyError?: (error: unknown, configVersion: string) => void;
}

/**
 * Serializes cloud config synchronization and local service reloads.
 * A version is marked attempted before reload begins, so a failed version can
 * never create a background retry loop.
 */
export class ConfigUpdateCoordinator {
  private activeCycle: Promise<ConfigUpdateResult> | null = null;
  private queuedCycle: {
    promise: Promise<ConfigUpdateResult>;
    resolve: (result: ConfigUpdateResult) => void;
    reject: (error: unknown) => void;
  } | null = null;
  private readonly attemptedVersions = new Set<string>();
  private status = createServiceRuntimeStatus('idle');
  private readonly options: ConfigUpdateCoordinatorOptions;

  constructor(options: ConfigUpdateCoordinatorOptions) {
    this.options = options;
    this.options.publish(this.status);
  }

  getStatus(): ServiceRuntimeStatus {
    return { ...this.status };
  }

  requestSync(): Promise<ConfigUpdateResult> {
    if (!this.activeCycle) return this.startCycle();
    if (this.queuedCycle) return this.queuedCycle.promise;

    let resolve!: (result: ConfigUpdateResult) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<ConfigUpdateResult>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    this.queuedCycle = { promise, resolve, reject };
    return promise;
  }

  /**
   * The caller that starts a cycle receives that cycle's result. Calls arriving
   * while it is active share one queued-cycle promise, which is drained after
   * the active apply has completely finished.
   */
  private startCycle(): Promise<ConfigUpdateResult> {
    const cycle = this.runOnce();
    this.activeCycle = cycle;
    void cycle.then(
      () => this.finishCycle(cycle),
      () => this.finishCycle(cycle),
    );
    return cycle;
  }

  private finishCycle(cycle: Promise<ConfigUpdateResult>): void {
    if (this.activeCycle !== cycle) return;
    this.activeCycle = null;
    const queued = this.queuedCycle;
    if (!queued) return;
    this.queuedCycle = null;
    const next = this.startCycle();
    void next.then(queued.resolve, queued.reject);
  }

  private rememberAttemptedVersion(version: string): boolean {
    if (this.attemptedVersions.has(version)) return false;
    this.attemptedVersions.add(version);
    return true;
  }

  private setStatus(status: ServiceRuntimeStatus): void {
    this.status = status;
    this.options.publish(status);
  }

  private async runOnce(): Promise<ConfigUpdateResult> {
    const result = await this.options.sync();
    await this.options.onSyncResult?.(result);
    if (!result.ok || result.unchanged) return result;

    const version = result.config_version;
    if (!this.rememberAttemptedVersion(version)) return result;
    this.setStatus(createServiceRuntimeStatus('updating', { configVersion: version }));

    try {
      await this.options.apply(version);
      this.setStatus(createServiceRuntimeStatus('ready', { configVersion: version }));
      return result;
    } catch (error) {
      this.options.onApplyError?.(error, version);
      this.setStatus(createServiceRuntimeStatus('failed', {
        configVersion: version,
        message: UPDATE_FAILED_MESSAGE,
      }));
      return {
        ok: false,
        code: 'APPLY_FAILED',
        message: UPDATE_FAILED_MESSAGE,
        config_version: version,
      };
    }
  }
}
