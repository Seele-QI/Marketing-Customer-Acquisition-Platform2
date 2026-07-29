/**
 * 将 electron-updater / Chromium net 原始错误映射为用户可读文案。
 * 主进程与设置页共用，避免直接暴露 net::ERR_*。
 */

const NETWORK_ERROR_RE =
  /net::ERR_|ERR_CONNECTION|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|getaddrinfo|socket hang up|ECONNREFUSED|ENETUNREACH/i

const MISSING_UPDATE_CONFIG_RE =
  /ENOENT[\s\S]*app-update\.yml|app-update\.yml[\s\S]*ENOENT/i

const FRIENDLY_MISSING_UPDATE_CONFIG =
  "更新配置缺失，请运行更新修复工具或覆盖安装新版客户端"

const FRIENDLY_NETWORK =
  "无法连接更新服务器，请检查网络或稍后重试"

const MAX_LEN = 200

export function toFriendlyUpdateError(raw: string | undefined | null): string {
  const text = String(raw || "").trim()
  if (!text) return "更新失败，请稍后重试"
  if (MISSING_UPDATE_CONFIG_RE.test(text)) return FRIENDLY_MISSING_UPDATE_CONFIG
  if (NETWORK_ERROR_RE.test(text)) return FRIENDLY_NETWORK
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN)}…` : text
}
