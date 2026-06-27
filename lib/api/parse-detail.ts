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
): string {
  const detail = parseApiDetail(body?.detail, fallback)
  if (status === 401) {
    return detail !== fallback ? detail : "请先登录"
  }
  if (status === 402) {
    return "积分不足，请充值"
  }
  if (status === 503) {
    const code =
      body?.detail && typeof body.detail === "object"
        ? (body.detail as Record<string, unknown>).code
        : null
    if (code === "FASTAPI_UNAVAILABLE") {
      return "后端服务未配置或未启动，请运行 pnpm dev:all 或检查 FASTAPI_URL / NEXT_PUBLIC_FASTAPI_URL"
    }
  }
  return detail
}
