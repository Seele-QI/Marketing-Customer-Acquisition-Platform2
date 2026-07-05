import type { PlatformId, PlatformStatus, ResearchResponse, RetrievalItem } from "@/lib/geo/retrieval/types"
import { searchTrends } from "@/lib/geo/retrieval/adapters/tianapi"
import { isJustOneApiConfigured, searchJustOneApi } from "@/lib/geo/retrieval/adapters/justoneapi"
import { extractFromUrls } from "@/lib/geo/retrieval/adapters/url-extract"
import { isSerpApiConfigured, searchTiebaByKeyword } from "@/lib/geo/retrieval/adapters/tieba-fallback"

function dedupeItems(items: RetrievalItem[]): RetrievalItem[] {
  const seen = new Set<string>()
  const out: RetrievalItem[] = []
  for (const item of items) {
    const key = `${item.platform}|${item.url ?? ""}|${item.title}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
}

export async function runGeoResearch(input: {
  keyword: string
  platforms: PlatformId[]
  urls?: string[]
}): Promise<ResearchResponse> {
  const keyword = input.keyword.trim()
  const platforms = input.platforms.length
    ? input.platforms
    : (["zhihu", "xiaohongshu", "tieba", "trends"] as PlatformId[])

  const items: RetrievalItem[] = []
  const statuses: PlatformStatus[] = []
  let partial = false

  if (input.urls?.length) {
    const extracted = await extractFromUrls(input.urls)
    items.push(...extracted)
  }

  const tasks = platforms.map(async (platform) => {
    try {
      if (platform === "trends") {
        if (!keyword) {
          statuses.push({ platform, status: "skipped", message: "热搜检索需要关键词", count: 0 })
          return
        }
        const rows = await searchTrends(keyword)
        items.push(...rows)
        statuses.push({ platform, status: "ok", count: rows.length })
        return
      }

      if (platform === "zhihu" || platform === "xiaohongshu") {
        if (!keyword) {
          statuses.push({ platform, status: "skipped", message: "需要关键词", count: 0 })
          return
        }
        if (!isJustOneApiConfigured()) {
          partial = true
          statuses.push({
            platform,
            status: "unconfigured",
            message: "未配置 JUSTONEAPI_TOKEN",
            count: 0,
          })
          return
        }
        const rows = await searchJustOneApi(keyword, platform)
        items.push(...rows)
        statuses.push({ platform, status: "ok", count: rows.length })
        return
      }

      if (platform === "tieba") {
        if (keyword && isSerpApiConfigured()) {
          const rows = await searchTiebaByKeyword(keyword)
          items.push(...rows)
          statuses.push({ platform, status: "ok", count: rows.length })
          return
        }
        if (!keyword) {
          statuses.push({
            platform,
            status: "skipped",
            message: "贴吧关键词搜索需 SERPAPI_KEY，或粘贴贴吧 URL",
            count: 0,
          })
          return
        }
        partial = true
        statuses.push({
          platform,
          status: "unconfigured",
          message: "未配置 SERPAPI_KEY，请粘贴贴吧 URL 提取",
          count: 0,
        })
      }
    } catch (err) {
      partial = true
      statuses.push({
        platform,
        status: "error",
        message: err instanceof Error ? err.message : "检索失败",
        count: 0,
      })
    }
  })

  await Promise.all(tasks)

  return {
    keyword,
    partial,
    items: dedupeItems(items),
    platforms: statuses,
  }
}
