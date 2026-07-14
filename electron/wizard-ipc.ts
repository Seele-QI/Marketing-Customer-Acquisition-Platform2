/**
 * 激活向导 IPC（主进程注册一次）
 */

import { ipcMain } from 'electron';
import logger from './services/logger';
import { getMachineId, getMachineIdShort } from './services/machine-id';
import { activate } from './services/activation-client';
import { saveCredentials } from './services/credential-store';

let wizardDoneCallback: (() => void) | null = null;

export function setWizardDoneCallback(cb: (() => void) | null): void {
  wizardDoneCallback = cb;
}

let handlersRegistered = false;

export function registerWizardIpcHandlers(): void {
  if (handlersRegistered) return;
  handlersRegistered = true;

  ipcMain.handle('wizard:activate', async (_event, code: string) => {
    try {
      const result = await activate(code);
      if (result.ok) {
        saveCredentials({
          machine_id: getMachineId(),
          activation_code: code,
          expires_at: result.expires_at,
          keys: result.keys,
        });
        logger.info('wizard: activation success');
        return { ok: true };
      }
      return { ok: false, error: result.error, code: result.code };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '激活失败';
      return { ok: false, error: message };
    }
  });

  ipcMain.handle('wizard:get-machine-id', () => getMachineIdShort());

  ipcMain.handle('wizard:done', () => {
    wizardDoneCallback?.();
    return { ok: true };
  });
}
