/**
 * 激活服务 HTTP 客户端
 *
 * - POST /api/central/activate  → 激活码校验 + 密钥下发
 * - GET  /api/central/manifest   → 版本检查
 * - POST /api/central/heartbeat  → 心跳 + 注销检测
 */

import { getMachineId } from './machine-id';
import logger from './logger';
import { verifyActivateResponse } from '../utils/activate-verify';

const BASE_URL = process.env.CENTRAL_SERVICE_URL || 'https://your-server.example.com';
const APP_VERSION = '0.1.0';

export interface ActivationResult {
  ok: boolean;
  plan: string;
  expires_at: number;
  keys: Record<string, string>;
  server_time: number;
  error?: string;
  code?: string;
}

/** 激活码校验 */
export async function activate(code: string): Promise<ActivationResult> {
  const mid = getMachineId();
  try {
    const res = await fetch(`${BASE_URL}/api/central/activate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ machine_id: mid, code, client_version: APP_VERSION }),
    });
    const body = await res.json();
    if (!res.ok) {
      return {
        ok: false,
        plan: '',
        expires_at: 0,
        keys: {},
        server_time: 0,
        error: body?.detail?.message || body?.message || `HTTP ${res.status}`,
        code: body?.detail?.code || body?.code,
      };
    }
    const verify = verifyActivateResponse({
      plan: body.plan,
      expires_at: body.expires_at,
      keys: body.keys || {},
      server_time: body.server_time,
      signature: body.signature,
      key_id: body.key_id,
    });
    if (!verify.ok) {
      logger.error('activate verify failed:', verify.code, verify.message);
      return {
        ok: false,
        plan: '',
        expires_at: 0,
        keys: {},
        server_time: 0,
        error: verify.message || '激活响应验签失败',
        code: verify.code,
      };
    }
    return { ok: true, ...body };
  } catch (err: any) {
    logger.error('activate:', err);
    return {
      ok: false,
      plan: '',
      expires_at: 0,
      keys: {},
      server_time: 0,
      error: err.message || '网络错误，无法连接激活服务',
    };
  }
}

/** 心跳 */
export async function heartbeat(code: string): Promise<{ ok: boolean; revoked: boolean }> {
  const mid = getMachineId();
  try {
    const res = await fetch(`${BASE_URL}/api/central/heartbeat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ machine_id: mid, code, client_version: APP_VERSION, ts: Date.now() / 1000 }),
    });
    if (!res.ok) return { ok: false, revoked: false };
    const body = await res.json();
    return { ok: true, revoked: !!body.revoked };
  } catch {
    return { ok: false, revoked: false };
  }
}