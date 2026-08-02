import type { GeneratedArticle } from "@/lib/geo/article-types"

export type PlatformArticleMatch = {
  platform: string
  article: GeneratedArticle
}

export const GEO_DISTRIBUTION_UNDATED = "__undated__"

export type GeoDistributionBatch = {
  projectId: string
  date: string
  articles: GeneratedArticle[]
  platformIds: string[]
  latestCreatedAt: number
}

function successfulMatrixArticles(articles: GeneratedArticle[]) {
  return articles.filter(
    (article) =>
      article.status === "success" &&
      article.mode === "matrix" &&
      Boolean(article.projectId) &&
      Boolean(article.platformId),
  )
}

/**
 * Produce the selectable project/date batches for one-click distribution.
 * Duplicate retries for the same platform are collapsed to the newest article.
 */
export function listGeoDistributionBatches(
  articles: GeneratedArticle[],
): GeoDistributionBatch[] {
  const grouped = new Map<string, GeneratedArticle[]>()
  for (const article of successfulMatrixArticles(articles)) {
    const date = article.date || GEO_DISTRIBUTION_UNDATED
    const key = `${article.projectId}\u0000${date}`
    const current = grouped.get(key) ?? []
    current.push(article)
    grouped.set(key, current)
  }

  return [...grouped.values()]
    .map((group) => {
      const newestByPlatform = new Map<string, GeneratedArticle>()
      for (const article of group) {
        const current = newestByPlatform.get(article.platformId)
        if (!current || current.createdAt < article.createdAt) {
          newestByPlatform.set(article.platformId, article)
        }
      }
      const batchArticles = [...newestByPlatform.values()].sort(
        (a, b) => b.createdAt - a.createdAt,
      )
      return {
        projectId: group[0].projectId as string,
        date: group[0].date || GEO_DISTRIBUTION_UNDATED,
        articles: batchArticles,
        platformIds: batchArticles.map((article) => article.platformId),
        latestCreatedAt: Math.max(...batchArticles.map((article) => article.createdAt)),
      }
    })
    .sort((a, b) => b.latestCreatedAt - a.latestCreatedAt)
}

/** Match exactly one article per connected platform inside a project/date batch. */
export function matchGeoArticlesByProjectDate(input: {
  articles: GeneratedArticle[]
  projectId: string
  date: string
  connectedPlatforms: string[]
}): {
  matches: PlatformArticleMatch[]
  unbound: string[]
} {
  const batch = listGeoDistributionBatches(input.articles).find(
    (item) => item.projectId === input.projectId && item.date === input.date,
  )
  if (!batch) return { matches: [], unbound: [] }

  const connected = new Set(input.connectedPlatforms)
  const matches: PlatformArticleMatch[] = []
  const unbound: string[] = []
  for (const article of batch.articles) {
    if (connected.has(article.platformId)) {
      matches.push({ platform: article.platformId, article })
    } else {
      unbound.push(article.platformId)
    }
  }
  return { matches, unbound }
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
