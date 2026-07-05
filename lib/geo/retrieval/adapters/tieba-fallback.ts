import { readServerEnv } from "@/lib/server-env"
import type { RetrievalItem } from "@/lib/geo/retrieval/types"

function getSerpKey(): string {
  return readServerEnv("SERPAPI_KEY")
}

export function isSerpApiConfigured(): boolean {
  return Boolean(getSerpKey())
}

export async function searchTiebaByKeyword(keyword: string): Promise<RetrievalItem[]> {
  const key = getSerpKey()
  if (!key) {
    throw new Error("未配置 SERPAPI_KEY，贴吧仅支持粘贴 URL 提取")
  }

  const q = `site:tieba.baidu.com ${keyword}`
  const params = new URLSearchParams({ engine: "google", q, api_key: key, num: "8" })
  const res = await fetch(`https://serpapi.com/search.json?${params}`, {
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    throw new Error(`SerpAPI HTTP ${res.status}`)
  }

  const payload = (await res.json()) as Record<string, unknown>
  const results = Array.isArray(payload.organic_results) ? payload.organic_results : []

  return results.slice(0, 8).map((raw, idx) => {
    const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>
    return {
      platform: "tieba" as const,
      title: String(o.title ?? `贴吧结果 ${idx + 1}`).trim(),
      url: String(o.link ?? "").trim() || undefined,
      snippet: String(o.snippet ?? "").trim() || "（无摘要）",
      notes: "社区声量/争议点来源，勿当作行业事实",
      score: 80 - idx,
    }
  })
}
