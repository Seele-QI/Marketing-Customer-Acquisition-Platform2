/**
 * 火山方舟「图片生成」OpenAI 兼容响应解析（/images/generations）
 */

export function normalizeArkBaseUrl(raw: string): string {
  let t = raw.trim().replace(/\/+$/, "")
  if (t.endsWith("/chat/completions")) {
    t = t.slice(0, -"/chat/completions".length).replace(/\/+$/, "")
  }
  if (t.endsWith("/responses")) {
    t = t.slice(0, -"/responses".length).replace(/\/+$/, "")
  }
  return t
}

export function extractImageUrlsFromGenerationsJson(data: unknown): string[] {
  if (!data || typeof data !== "object") return []
  const d = data as Record<string, unknown>
  let arr: unknown = d.data
  // 部分上游把单张结果放在 data 对象而非数组里，需归一成数组再解析
  if (arr != null && !Array.isArray(arr)) {
    arr = [arr]
  }
  if (!Array.isArray(arr)) return []
  const out: string[] = []
  for (const item of arr) {
    if (!item || typeof item !== "object") continue
    const o = item as Record<string, unknown>
    if (typeof o.url === "string" && o.url.length > 0) {
      if (o.url.startsWith("http://") || o.url.startsWith("https://")) {
        out.push(o.url)
        continue
      }
      if (o.url.startsWith("//")) {
        out.push(`https:${o.url}`)
        continue
      }
      if (o.url.startsWith("data:image/")) {
        out.push(o.url)
        continue
      }
    }
    if (typeof o.b64_json === "string" && o.b64_json.length > 0) {
      out.push(`data:image/png;base64,${o.b64_json}`)
    }
  }
  return out
}

/** 方舟图片接口常用档位（与控制台「清晰度」选项对齐）；若上游不支持会返回可解析错误 */
export function mapResolutionToSize(resolution: string | undefined): string {
  const r = (resolution || "2K").trim()
  if (/^4k$/i.test(r)) return "4K"
  if (/^1k$/i.test(r)) return "1K"
  return "2K"
}
