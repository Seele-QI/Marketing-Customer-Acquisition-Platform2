import {
  CUSTOMER_ERROR_MESSAGES,
  isTechnicalErrorMessage,
} from "@/lib/api/customer-network-error"

export type ApiErrorRuntime = "auto" | "desktop" | "web"

export type ParseApiErrorOptions = {
  runtime?: ApiErrorRuntime
}

function isDesktopRuntime(runtime: ApiErrorRuntime = "auto"): boolean {
  if (runtime === "desktop") return true
  if (runtime === "web") return false
  return typeof window !== "undefined" && Boolean(window.electronAPI)
}

/** 解析 FastAPI / Next API 的 detail 字段为可读中文/英文消息。 */
export function parseApiDetail(detail: unknown, fallback = "请求失败"): string {
  if (typeof detail === "string" && detail.trim()) return detail.trim()
  if (detail && typeof detail === "object") {
    const o = detail as Record<string, unknown>
    if (typeof o.message === "string" && o.message.trim()) return o.message.trim()
    if (typeof o.code === "string") {
      const msg = typeof o.message === "string" ? o.message.trim() : ""
      return msg ? `${o.code}: ${msg}` : o.code
    }
  }
  return fallback
}

/** 根据 HTTP status + body 生成用户可见错误（文案/视频通用）。 */
export function parseApiErrorResponse(
  status: number,
  body: { detail?: unknown },
  fallback = "请求失败",
  options: ParseApiErrorOptions = {},
): string {
  const detail = parseApiDetail(body?.detail, fallback)
  const code =
    body?.detail && typeof body.detail === "object" && typeof (body.detail as Record<string, unknown>).code === "string"
      ? String((body.detail as Record<string, unknown>).code).trim().toUpperCase()
      : ""
  if (status === 401) {
    return detail !== fallback && detail !== code ? detail : "请先登录"
  }
  if (status === 402) {
    return "积分不足，请充值"
  }
  if (/MODEL_(?:PERMISSION|ACCESS)_(?:DENIED|REQUIRED)|MODEL_NOT_AUTHORIZED/.test(code)) {
    return detail !== code && detail !== fallback ? detail : "当前模型无调用权限"
  }
  if (["SERVICE_CONFIG_UPDATING", "CONFIG_UPDATE_IN_PROGRESS", "SERVICE_UPDATING"].includes(code)) {
    return CUSTOMER_ERROR_MESSAGES.updating
  }
  if (["CONFIG_UPDATE_FAILED", "SERVICE_UPDATE_FAILED"].includes(code)) {
    return CUSTOMER_ERROR_MESSAGES.updateFailed
  }
  if (["FASTAPI_UNAVAILABLE", "FASTAPI_PROXY_FAILED", "LOCAL_SERVICE_UNAVAILABLE"].includes(code)) {
    return isDesktopRuntime(options.runtime)
      ? CUSTOMER_ERROR_MESSAGES.localUnavailable
      : CUSTOMER_ERROR_MESSAGES.generic
  }
  if (["CLOUD_UNAVAILABLE", "CLOUD_SERVICE_UNAVAILABLE", "UPSTREAM_UNAVAILABLE"].includes(code)) {
    return CUSTOMER_ERROR_MESSAGES.cloudUnavailable
  }
  if (
    status === 408 ||
    status === 504 ||
    /(?:TIMEOUT|TIMED_OUT)$/.test(code)
  ) {
    return CUSTOMER_ERROR_MESSAGES.timeout
  }
  if (status === 502) return CUSTOMER_ERROR_MESSAGES.cloudUnavailable
  if (status === 503) return CUSTOMER_ERROR_MESSAGES.generic
  if (isTechnicalErrorMessage(detail) || /^(?:FASTAPI|ECONN|ERR_NETWORK|UPSTREAM)_/.test(code)) {
    return CUSTOMER_ERROR_MESSAGES.generic
  }
  return detail
}
