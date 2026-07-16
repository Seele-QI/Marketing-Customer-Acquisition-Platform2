/**
 * 将 electron-updater / Chromium net 原始错误映射为用户可读文案。
 * 与 lib/update-error.ts 保持同逻辑（Electron rootDir 不能引用 lib/）。
 */

const NETWORK_ERROR_RE =
  /net::ERR_|ERR_CONNECTION|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|getaddrinfo|socket hang up|ECONNREFUSED|ENETUNREACH/i;

const FRIENDLY_NETWORK = '无法连接更新服务器，请检查网络或稍后重试';

const MAX_LEN = 200;

export function toFriendlyUpdateError(raw: string | undefined | null): string {
  const text = String(raw || '').trim();
  if (!text) return '更新失败，请稍后重试';
  if (NETWORK_ERROR_RE.test(text)) return FRIENDLY_NETWORK;
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN)}…` : text;
}
