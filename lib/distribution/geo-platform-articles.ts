import type { GeneratedArticle } from "@/lib/geo/article-types"

export type PlatformArticleMatch = {
  platform: string
  article: GeneratedArticle
}

/**
 * Resolve one already-generated matrix article per target platform.
 * Never crosses project boundaries. The selected article is only the batch/date
 * anchor; it is not duplicated to the other platforms.
 */
export function matchGeoArticlesByPlatform(input: {
  articles: GeneratedArticle[]
  anchor: GeneratedArticle | undefined
  platforms: string[]
}): { matches: PlatformArticleMatch[]; missing: string[] } {
  const { anchor } = input
  if (!anchor) return { matches: [], missing: [...input.platforms] }

  const candidates = input.articles.filter((article) => {
    if (article.status !== "success") return false
    if (anchor.projectId) return article.projectId === anchor.projectId
    return !article.projectId
  })

  const choose = (platform: string) => {
    const exactDate = candidates
      .filter((article) => article.platformId === platform && article.date === anchor.date)
      .sort((a, b) => b.createdAt - a.createdAt)
    if (exactDate[0]) return exactDate[0]

    // Legacy articles may have no date. They can only match another undated
    // article from the same project scope.
    if (!anchor.date) {
      return candidates
        .filter((article) => article.platformId === platform && !article.date)
        .sort((a, b) => b.createdAt - a.createdAt)[0]
    }
    return undefined
  }

  const matches: PlatformArticleMatch[] = []
  const missing: string[] = []
  for (const platform of [...new Set(input.platforms)]) {
    const article = choose(platform)
    if (article) matches.push({ platform, article })
    else missing.push(platform)
  }
  return { matches, missing }
}
