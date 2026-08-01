/**
 * 云端配置同步客户端
 *
 * 登录后调用 POST /api/config/sync，将 Key 写入 credential-store。
 * 403 → 清空凭证并通知渲染进程重新登录。
 */

import type { BrowserWindow } from 'electron';
import { getMachineId } from './machine-id';
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
  isValidSyncedProvider,
  type CredentialData,
  type SyncedFeature,
  type SyncedProvider,
} from './credential-store';
import { hasPlanLlmKeys, presentPlanLlmKeyNames } from './env-injector';
import logger from './logger';

const SESSION_COOKIE = 'session_id';
const CLIENT_VERSION = '0.1.0';
const DEFAULT_TIMEOUT_MS = 15_000;

export type ConfigSyncResult =
  | { ok: true; unchanged: boolean; config_version: string }
  | { ok: false; code: string; message: string; requireLogin?: boolean };

export interface ConfigSyncOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  loadCredentials?: typeof loadCredentials;
  saveCredentials?: typeof saveCredentials;
  clearCredentials?: typeof clearCredentials;
}

class ConfigRequestTimeoutError extends Error {}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new ConfigRequestTimeoutError());
    }, Math.max(1, timeoutMs));
  });
  try {
    return await Promise.race([
      fetchImpl(url, { ...init, signal: controller.signal }),
      timeout,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function parseJsonWithTimeout(resp: Response, timeoutMs: number): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new ConfigRequestTimeoutError()), Math.max(1, timeoutMs));
  });
  try {
    return await Promise.race([resp.json(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function cloudApiUrl(): string {
  return (process.env.CLOUD_API_URL || '').trim();
}

async function readSessionId(win: BrowserWindow | null, nextOrigin: string): Promise<string | null> {
  if (!win || win.isDestroyed()) return null;
  try {
    const cookies = await win.webContents.session.cookies.get({ url: nextOrigin });
    const hit = cookies.find((c) => c.name === SESSION_COOKIE);
    return hit?.value?.trim() || null;
  } catch {
    logger.warn('config-sync: read session cookie failed');
    return null;
  }
}

export async function syncConfig(
  win: BrowserWindow | null,
  nextOrigin: string,
  options: ConfigSyncOptions = {},
): Promise<ConfigSyncResult> {
  const base = cloudApiUrl();
  if (!base) {
    return { ok: false, code: 'CLOUD_URL_MISSING', message: '未配置 CLOUD_API_URL' };
  }

  const sessionId = await readSessionId(win, nextOrigin);
  if (!sessionId) {
    return { ok: false, code: 'NOT_LOGGED_IN', message: '未登录，无法同步配置' };
  }

  let creds: CredentialData | null;
  try {
    creds = (options.loadCredentials ?? loadCredentials)();
  } catch {
    logger.error('config-sync: credential store read failed');
    return { ok: false, code: 'STORE_ERROR', message: '客户端配置读取失败，请重启程序后再试。' };
  }
  const knownVersion = creds?.config_version || '';
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadlineAt = Date.now() + timeoutMs;

  const url = `${base.replace(/\/+$/, '')}/api/config/sync`;
  let resp: Response;
  try {
    resp = await fetchWithTimeout(options.fetchImpl ?? fetch, url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE}=${sessionId}`,
      },
      body: JSON.stringify({
        client_version: CLIENT_VERSION,
        known_version: knownVersion,
      }),
    }, timeoutMs);
  } catch (error) {
    if (error instanceof ConfigRequestTimeoutError) {
      logger.warn('config-sync: request timed out');
      return { ok: false, code: 'REQUEST_TIMEOUT', message: '服务器响应较慢，请稍后重试。' };
    }
    logger.error('config-sync: network request failed');
    return { ok: false, code: 'NETWORK_ERROR', message: '当前网络无法连接云端服务，请检查网络后重试。' };
  }

  if (resp.status === 403) {
    try {
      (options.clearCredentials ?? clearCredentials)();
    } catch {
      logger.error('config-sync: credential store clear failed');
    }
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: '账号已封禁或会话无效',
      requireLogin: true,
    };
  }

  if (resp.status === 401) {
    return {
      ok: false,
      code: 'NOT_LOGGED_IN',
      message: '登录已过期，请重新登录',
      requireLogin: true,
    };
  }

  if (!resp.ok) {
    logger.warn('config-sync: upstream error status=' + resp.status);
    return { ok: false, code: 'UPSTREAM_ERROR', message: '云端配置服务暂时不可用，请稍后重试。' };
  }

  let data: {
    config_version?: string;
    unchanged?: boolean;
    keys?: Record<string, string>;
    providers?: SyncedProvider[];
    features?: SyncedFeature[];
  };
  try {
    const parsed = await parseJsonWithTimeout(resp, Math.max(1, deadlineAt - Date.now()));
    if (!parsed || typeof parsed !== 'object') throw new Error('invalid response shape');
    data = parsed as typeof data;
  } catch (error) {
    if (error instanceof ConfigRequestTimeoutError) {
      logger.warn('config-sync: response parsing timed out');
      return { ok: false, code: 'REQUEST_TIMEOUT', message: '服务器响应较慢，请稍后重试。' };
    }
    logger.warn('config-sync: invalid JSON response');
    return { ok: false, code: 'INVALID_RESPONSE', message: '云端配置响应异常，请稍后重试。' };
  }

  if (data.config_version !== undefined && typeof data.config_version !== 'string') {
    return { ok: false, code: 'INVALID_RESPONSE', message: '云端配置响应异常，请稍后重试。' };
  }
  const version = (data.config_version || '').trim() || 'cfg_v1';
  if (data.unchanged) {
    logger.info('config-sync: unchanged', version);
    return { ok: true, unchanged: true, config_version: version };
  }

  const keysValid = data.keys === undefined || (
    data.keys !== null
    && typeof data.keys === 'object'
    && !Array.isArray(data.keys)
    && Object.values(data.keys).every((value) => typeof value === 'string')
  );
  const providersValid = data.providers === undefined || (
    Array.isArray(data.providers) && data.providers.every(isValidSyncedProvider)
  );
  const featuresValid = data.features === undefined || Array.isArray(data.features);
  if (!keysValid || !providersValid || !featuresValid) {
    return { ok: false, code: 'INVALID_RESPONSE', message: '云端配置响应异常，请稍后重试。' };
  }
  const keys = data.keys || {};
  const providers = data.providers || [];
  const features = data.features || [];
  if (!Object.keys(keys).length && !providers.length && !features.length) {
    return { ok: false, code: 'EMPTY_KEYS', message: '云端未返回有效 Key' };
  }

  const next: CredentialData = {
    machine_id: getMachineId(),
    config_version: version,
    synced_at: Date.now(),
    keys,
    ...(providers.length ? { providers } : {}),
    ...(features.length ? { features } : {}),
  };
  try {
    (options.saveCredentials ?? saveCredentials)(next);
  } catch {
    logger.error('config-sync: credential store write failed');
    return { ok: false, code: 'STORE_ERROR', message: '客户端配置保存失败，请重启程序后再试。' };
  }
  const planKeys = presentPlanLlmKeyNames(keys);
  if (hasPlanLlmKeys(keys) || providers.some((p) => p.kind === 'llm')) {
    logger.info(
      'config-sync: saved keys',
      version,
      Object.keys(keys).length,
      'providers=',
      providers.length,
      'plan-llm:',
      planKeys.join(',') || '(from providers)',
    );
  } else {
    logger.warn(
      'config-sync: saved keys but plan-script LLM keys missing from pool. ' +
        '请在云端管理后台配置模型，或 CONFIG_KEY_POOL 含 NEWAPI_KEY / DEEPSEEK_API_KEY。',
    );
  }
  return { ok: true, unchanged: false, config_version: version };
}
