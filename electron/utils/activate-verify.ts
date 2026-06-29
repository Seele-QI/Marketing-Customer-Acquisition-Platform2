/**
 * Verify Ed25519 signatures on central activation responses.
 * Canonical payload must match lib/central_signing.py exactly.
 */

import crypto from 'node:crypto';

/** Override via env at build/runtime; empty = skip verify (dev only). */
const PUBLIC_KEY_PEM =
  process.env.CENTRAL_SIGNING_PUBLIC_KEY?.trim() ||
  '';

const MAX_SERVER_TIME_SKEW_SEC = 300;

export type ActivateVerifyInput = {
  plan: string;
  expires_at: number;
  keys: Record<string, string>;
  server_time: number;
  signature?: string;
  key_id?: string;
};

function canonicalActivatePayload(input: ActivateVerifyInput): string {
  const sortedKeys: Record<string, string> = {};
  for (const k of Object.keys(input.keys || {}).sort()) {
    sortedKeys[k] = String(input.keys[k]);
  }
  const payload = {
    expires_at: Number(input.expires_at),
    keys: sortedKeys,
    plan: String(input.plan),
    server_time: Number(input.server_time),
  };
  return JSON.stringify(payload);
}

export function verifyActivateResponse(input: ActivateVerifyInput): {
  ok: boolean;
  code?: string;
  message?: string;
} {
  if (!PUBLIC_KEY_PEM) {
    if (!input.signature) {
      return { ok: true };
    }
    return {
      ok: false,
      code: 'NO_PUBLIC_KEY',
      message: '未配置验签公钥，拒绝带签名的激活响应',
    };
  }

  if (!input.signature) {
    return { ok: false, code: 'MISSING_SIGNATURE', message: '激活响应缺少签名' };
  }

  const skew = Math.abs(Date.now() / 1000 - Number(input.server_time || 0));
  if (skew > MAX_SERVER_TIME_SKEW_SEC) {
    return { ok: false, code: 'SERVER_TIME_SKEW', message: '激活响应时间戳异常' };
  }

  try {
    const message = Buffer.from(canonicalActivatePayload(input), 'utf8');
    const signature = Buffer.from(input.signature, 'base64');
    const valid = crypto.verify(null, message, PUBLIC_KEY_PEM, signature);
    if (!valid) {
      return { ok: false, code: 'INVALID_SIGNATURE', message: '激活响应签名校验失败' };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: 'INVALID_SIGNATURE', message: '激活响应签名校验失败' };
  }
}
