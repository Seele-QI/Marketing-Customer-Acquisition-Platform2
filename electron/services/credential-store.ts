/**
 * 凭证持久化存储
 *
 * - 读/写 userData/credentials.bin
 * - 加密：AES-256-GCM(machine_id)
 * - 失败 → 视作首次启动
 */

import * as fs from 'node:fs';
import { app } from 'electron';
import * as path from 'node:path';
import { encryptCredentials, decryptCredentials } from '../utils/crypto';
import { getMachineId } from './machine-id';
import logger from './logger';

export interface CredentialData {
  machine_id: string;
  activation_code: string;
  expires_at: number;
  keys: Record<string, string>;
}

function credentialsPath(): string {
  return path.join(app.getPath('userData'), 'credentials.bin');
}

/** 加载已缓存的激活凭证。不存在或解密失败 → null */
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
    if (!data.keys || !data.activation_code) {
      logger.warn('credential store: missing fields');
      return null;
    }
    logger.info('credential store: loaded OK, expires', new Date(data.expires_at * 1000).toISOString());
    return data;
  } catch (err) {
    logger.warn('credential store: decrypt failed', err);
    return null;
  }
}

/** 保存激活凭证到磁盘 */
export function saveCredentials(data: CredentialData): void {
  const plain = JSON.stringify(data);
  const mid = getMachineId();
  const blob = encryptCredentials(plain, mid);
  fs.writeFileSync(credentialsPath(), blob);
  logger.info('credential store: saved');
}

/** 删除凭证（撤销激活） */
export function clearCredentials(): void {
  const file = credentialsPath();
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    logger.info('credential store: cleared');
  }
}