import type { PlatformId, RetrievalItem } from "@/lib/geo/retrieval/types"

function detectPlatform(url: string): PlatformId | null {
  const u = url.toLowerCase()
  if (u.includes("zhihu.com")) return "zhihu"
  if (u.includes("xiaohongshu.com") || u.includes("xhslink.com")) return "xiaohongshu"
  if (u.includes("tieba.baidu.com")) return "tieba"
  return null
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function pickTitle(html: string, fallback: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
  if (og?.[1]) return og[1].trim()
  const t = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (t?.[1]) return t[1].trim()
  return fallback
}

export async function extractFromUrl(url: string): Promise<RetrievalItem | null> {
  const platform = detectPlatform(url)
  if (!platform) return null

  const res = await fetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "User-Agent": "Mozilla/5.0 (compatible; AgentHub-GEO/1.0)",
    },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  })

  if (!res.ok) {
    throw new Error(`URL 提取失败 HTTP ${res.status}`)
  }

  const html = await res.text()
  const text = stripHtml(html).slice(0, 600)
  const title = pickTitle(html, url)

  return {
    platform,
    title,
    url,
    snippet: text || "（未能提取正文，请手动打开链接）",
    notes: "来自用户粘贴 URL 的正文摘录",
    score: 95,
  }
}

export async function extractFromUrls(urls: string[]): Promise<RetrievalItem[]> {
  const out: RetrievalItem[] = []
  for (const url of urls) {
    const trimmed = url.trim()
    if (!trimmed) continue
    try {
      const item = await extractFromUrl(trimmed)
      if (item) out.push(item)
    } catch {
      out.push({
        platform: detectPlatform(trimmed) ?? "tieba",
        title: trimmed,
        url: trimmed,
        snippet: "链接提取失败，请检查 URL 是否可公开访问",
        notes: "提取错误",
        score: 10,
      })
    }
  }
  return out
}
