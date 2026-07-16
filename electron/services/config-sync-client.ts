/**
 * 云端配置同步客户端
 *
 * 登录后调用 POST /api/config/sync，将 Key 写入 credential-store。
 * 403 → 清空凭证并通知渲染进程重新登录。
 */

import { BrowserWindow } from 'electron';
import { getMachineId } from './machine-id';
import {
  clearCredentials,
  loadCredentials,
  saveCredentials,
  type CredentialData,
} from './credential-store';
import { hasPlanLlmKeys, presentPlanLlmKeyNames } from './env-injector';
import logger from './logger';

const SESSION_COOKIE = 'session_id';
const CLIENT_VERSION = '0.1.0';

export type ConfigSyncResult =
  | { ok: true; unchanged: boolean; config_version: string }
  | { ok: false; code: string; message: string; requireLogin?: boolean };

function cloudApiUrl(): string {
  return (process.env.CLOUD_API_URL || '').trim();
}

async function readSessionId(win: BrowserWindow | null, nextOrigin: string): Promise<string | null> {
  if (!win || win.isDestroyed()) return null;
  try {
    const cookies = await win.webContents.session.cookies.get({ url: nextOrigin });
    const hit = cookies.find((c) => c.name === SESSION_COOKIE);
    return hit?.value?.trim() || null;
  } catch (err) {
    logger.warn('config-sync: read session cookie failed', err);
    return null;
  }
}

export async function syncConfig(
  win: BrowserWindow | null,
  nextOrigin: string,
): Promise<ConfigSyncResult> {
  const base = cloudApiUrl();
  if (!base) {
    return { ok: false, code: 'CLOUD_URL_MISSING', message: '未配置 CLOUD_API_URL' };
  }

  const sessionId = await readSessionId(win, nextOrigin);
  if (!sessionId) {
    return { ok: false, code: 'NOT_LOGGED_IN', message: '未登录，无法同步配置' };
  }

  const creds = loadCredentials();
  const knownVersion = creds?.config_version || '';

  const url = `${base.replace(/\/+$/, '')}/api/config/sync`;
  let resp: Response;
  try {
    resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `${SESSION_COOKIE}=${sessionId}`,
      },
      body: JSON.stringify({
        client_version: CLIENT_VERSION,
        known_version: knownVersion,
      }),
    });
  } catch (err) {
    logger.error('config-sync: network error', err);
    return { ok: false, code: 'NETWORK_ERROR', message: '无法连接云端服务' };
  }

  if (resp.status === 403) {
    clearCredentials();
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
    const text = await resp.text().catch(() => '');
    logger.warn('config-sync: upstream error', resp.status, text);
    return { ok: false, code: 'UPSTREAM_ERROR', message: `同步失败 (${resp.status})` };
  }

  const data = (await resp.json()) as {
    config_version?: string;
    unchanged?: boolean;
    keys?: Record<string, string>;
  };

  const version = (data.config_version || '').trim() || 'cfg_v1';
  if (data.unchanged) {
    logger.info('config-sync: unchanged', version);
    return { ok: true, unchanged: true, config_version: version };
  }

  const keys = data.keys || {};
  if (!Object.keys(keys).length) {
    return { ok: false, code: 'EMPTY_KEYS', message: '云端未返回有效 Key' };
  }

  const next: CredentialData = {
    machine_id: getMachineId(),
    config_version: version,
    synced_at: Date.now(),
    keys,
  };
  saveCredentials(next);
  const planKeys = presentPlanLlmKeyNames(keys);
  if (hasPlanLlmKeys(keys)) {
    logger.info('config-sync: saved keys', version, Object.keys(keys).length, 'plan-llm:', planKeys.join(','));
  } else {
    logger.warn(
      'config-sync: saved keys but plan-script LLM keys missing from pool. ' +
        '云端 CONFIG_KEY_POOL 需含 NEWAPI_KEY 或 DEEPSEEK_API_KEY，否则安装包分镜必挂。',
    );
  }
  return { ok: true, unchanged: false, config_version: version };
}
