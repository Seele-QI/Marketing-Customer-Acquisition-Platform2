import { fetchNetworkHotList } from "@/lib/tianapi-trends"
import type { PlatformId, RetrievalItem } from "@/lib/geo/retrieval/types"

export async function searchTrends(keyword: string): Promise<RetrievalItem[]> {
  const rows = await fetchNetworkHotList()
  const q = keyword.trim().toLowerCase()
  const matched = rows.filter((r) => !q || r.title.toLowerCase().includes(q))
  const list = (matched.length > 0 ? matched : rows).slice(0, 8)

  return list.map((r) => ({
    platform: "trends" as PlatformId,
    title: r.title,
    url: r.url,
    snippet: `热搜热度 ${r.hot_value} · ${r.platform}`,
    notes: "辅助信号：用于标题/话术灵感，不作为事实证据",
    score: 100 - r.rank,
  }))
}
