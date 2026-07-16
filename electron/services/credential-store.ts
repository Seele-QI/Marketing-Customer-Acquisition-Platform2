/**
 * 凭证持久化存储
 *
 * - 读/写 userData/credentials.bin
 * - 加密：AES-256-GCM(machine_id)
 * - 云端 /api/config/sync 下发的 Key 缓存在此
 */

import * as fs from 'node:fs';
import { app } from 'electron';
import * as path from 'node:path';
import { encryptCredentials, decryptCredentials } from '../utils/crypto';
import { getMachineId } from './machine-id';
import logger from './logger';

export interface CredentialData {
  machine_id: string;
  config_version: string;
  synced_at: number;
  keys: Record<string, string>;
}

function credentialsPath(): string {
  return path.join(app.getPath('userData'), 'credentials.bin');
}

/** 加载已缓存的配置。不存在、解密失败或无 keys → null */
export function loadCredentials(): CredentialData | null {
  const file = credentialsPath();
  if (!fs.existsSync(file)) {
    logger.info('credential store: no file');
    return null;
  }
  try {
    const blob = fs.readFileSync(file);
    const mid = getMachineId();
    const plain = decryptCredentials(blob, mid);
    const data = JSON.parse(plain) as CredentialData;
    if (!data.keys || typeof data.keys !== 'object' || !Object.keys(data.keys).length) {
      logger.warn('credential store: missing keys');
      return null;
    }
    logger.info(
      'credential store: loaded OK, version=%s synced_at=%s',
      data.config_version || 'unknown',
      data.synced_at ? new Date(data.synced_at).toISOString() : 'n/a',
    );
    return data;
  } catch (err) {
    logger.warn('credential store: decrypt failed', err);
    return null;
  }
}

/** 保存配置到磁盘 */
export function saveCredentials(data: CredentialData): void {
  const plain = JSON.stringify(data);
  const mid = getMachineId();
  const blob = encryptCredentials(plain, mid);
  fs.writeFileSync(credentialsPath(), blob);
  logger.info('credential store: saved');
}

/** 删除凭证（登出 / 封禁） */
export function clearCredentials(): void {
  const file = credentialsPath();
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    logger.info('credential store: cleared');
  }
}
