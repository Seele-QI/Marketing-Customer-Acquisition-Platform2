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

export type SyncedProvider = {
  id: number;
  kind: string;
  name: string;
  adapter: string;
  base_url: string;
  api_key: string;
  model: string;
  extra?: Record<string, unknown>;
  priority: number;
};

export type SyncedFeature = {
  feature_id: string;
  label?: string;
  category?: string;
  enabled?: boolean;
  billing_mode?: string;
  scene?: string;
  billing_key?: string;
  unit_cost?: number | null;
  economy_cost?: number | null;
  premium_cost?: number | null;
  segment_unit_cost?: number | null;
  price_version?: number;
  provider_ids?: number[];
};

export interface CredentialData {
  machine_id: string;
  config_version: string;
  synced_at: number;
  keys: Record<string, string>;
  /** 结构化渠道列表（可选；旧缓存可能没有） */
  providers?: SyncedProvider[];
  /** 功能目录快照（可选） */
  features?: SyncedFeature[];
}

export function isValidSyncedProvider(value: unknown): value is SyncedProvider {
  if (!value || typeof value !== 'object') return false;
  const provider = value as Record<string, unknown>;
  return Number.isFinite(provider.id)
    && typeof provider.kind === 'string' && Boolean(provider.kind.trim())
    && typeof provider.name === 'string'
    && typeof provider.adapter === 'string' && Boolean(provider.adapter.trim())
    && typeof provider.base_url === 'string' && Boolean(provider.base_url.trim())
    && typeof provider.api_key === 'string' && Boolean(provider.api_key.trim())
    && typeof provider.model === 'string' && Boolean(provider.model.trim())
    && Number.isFinite(provider.priority);
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
    const keysValid = data.keys === undefined || (
      data.keys !== null
      && typeof data.keys === 'object'
      && !Array.isArray(data.keys)
      && Object.values(data.keys).every((value) => typeof value === 'string')
    );
    const providersValid = data.providers === undefined || (
      Array.isArray(data.providers) && data.providers.every(isValidSyncedProvider)
    );
    const featuresValid = data.features === undefined || (
      Array.isArray(data.features)
      && data.features.every((f) => f && typeof f === 'object' && typeof (f as SyncedFeature).feature_id === 'string')
    );
    if (!keysValid || !providersValid || !featuresValid) {
      logger.warn('credential store: invalid credential shape');
      return null;
    }
    data.keys ??= {};
    const hasKeys = Object.keys(data.keys).length > 0;
    const hasProviders = Boolean(data.providers?.length);
    if (!hasKeys && !hasProviders) {
      logger.warn('credential store: missing keys and providers');
      return null;
    }
    logger.info(
      'credential store: loaded OK, version=%s synced_at=%s providers=%s',
      data.config_version || 'unknown',
      data.synced_at ? new Date(data.synced_at).toISOString() : 'n/a',
      Array.isArray(data.providers) ? data.providers.length : 0,
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
