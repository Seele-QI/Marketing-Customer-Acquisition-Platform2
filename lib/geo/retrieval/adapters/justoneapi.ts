import { readServerEnv } from "@/lib/server-env"
import type { PlatformId, RetrievalItem } from "@/lib/geo/retrieval/types"

const SOURCE_MAP: Record<"zhihu" | "xiaohongshu", string> = {
  zhihu: "ZHIHU",
  xiaohongshu: "XIAOHONGSHU",
}

function getToken(): string {
  return readServerEnv("JUSTONEAPI_TOKEN")
}

export function isJustOneApiConfigured(): boolean {
  return Boolean(getToken())
}

export async function searchJustOneApi(
  keyword: string,
  platform: "zhihu" | "xiaohongshu",
): Promise<RetrievalItem[]> {
  const token = getToken()
  if (!token) {
    throw new Error("未配置 JUSTONEAPI_TOKEN，无法检索知乎/小红书")
  }

  const end = new Date()
  const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`

  const params = new URLSearchParams({
    token,
    keyword,
    source: SOURCE_MAP[platform],
    start: fmt(start),
    end: fmt(end),
  })

  const res = await fetch(`https://api.justoneapi.com/api/search/v1?${params}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    throw new Error(`Just One API HTTP ${res.status}`)
  }

  const payload = (await res.json()) as Record<string, unknown>
  const data = payload.data ?? payload.result ?? payload
  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as Record<string, unknown>)?.list)
      ? ((data as Record<string, unknown>).list as unknown[])
      : []

  return list.slice(0, 10).map((raw, idx) => {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    const title = String(o.title ?? o.name ?? o.content ?? `结果 ${idx + 1}`).trim()
    const url = String(o.url ?? o.link ?? o.shareUrl ?? "").trim() || undefined
    const snippet = String(o.desc ?? o.summary ?? o.text ?? o.content ?? "").slice(0, 280).trim()
    return {
      platform: platform as PlatformId,
      title: title || `未命名${platform === "zhihu" ? "知乎" : "小红书"}内容`,
      url,
      snippet: snippet || "（无摘要，请打开链接查看）",
      notes: platform === "zhihu" ? "长文论证/专业讨论来源" : "用户体验/趋势话术来源",
      score: 90 - idx,
    }
  })
}
