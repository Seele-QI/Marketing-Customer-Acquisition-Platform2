import type { ArticleJob, GeneratedArticle } from "@/lib/geo/article-types"

export const ARTICLE_BATCH_STORAGE_KEY = "geo-article-batch-v1"

export type ArticleBatchConfig = {
  mode: "direction" | "matrix"
  direction?: string
  projectId?: string
  dates?: string[]
  platformIds: string[]
  /** 每个日期×平台（或方向模式下每个平台）生成篇数 */
  copiesPerSlot?: number
}

export type ArticleBatchStore = {
  articles: GeneratedArticle[]
  lastConfig?: ArticleBatchConfig
  jobSnapshots?: Record<string, ArticleJob>
  updatedAt: number
}

function readStore(): ArticleBatchStore {
  if (typeof window === "undefined") {
    return { articles: [], updatedAt: 0 }
  }
  try {
    const raw = localStorage.getItem(ARTICLE_BATCH_STORAGE_KEY)
    if (!raw) return { articles: [], updatedAt: 0 }
    const parsed = JSON.parse(raw) as ArticleBatchStore
    return {
      articles: Array.isArray(parsed.articles) ? parsed.articles : [],
      lastConfig: parsed.lastConfig,
      jobSnapshots:
        parsed.jobSnapshots && typeof parsed.jobSnapshots === "object"
          ? (parsed.jobSnapshots as Record<string, ArticleJob>)
          : undefined,
      updatedAt: parsed.updatedAt ?? 0,
    }
  } catch {
    return { articles: [], updatedAt: 0 }
  }
}

function writeStore(store: ArticleBatchStore): void {
  if (typeof window === "undefined") return
  localStorage.setItem(ARTICLE_BATCH_STORAGE_KEY, JSON.stringify(store))
}

export function loadArticleBatch(): ArticleBatchStore {
  return readStore()
}

export function saveArticles(
  articles: GeneratedArticle[],
  lastConfig?: ArticleBatchConfig,
): void {
  writeStore({
    articles,
    lastConfig,
    updatedAt: Date.now(),
  })
}

export function upsertArticle(article: GeneratedArticle): GeneratedArticle[] {
  const store = readStore()
  const idx = store.articles.findIndex((a) => a.id === article.id)
  const next =
    idx >= 0
      ? store.articles.map((a, i) => (i === idx ? article : a))
      : [...store.articles, article]
  writeStore({ ...store, articles: next, updatedAt: Date.now() })
  return next
}

export function mergeArticles(incoming: GeneratedArticle[]): GeneratedArticle[] {
  const store = readStore()
  const byKey = new Map(store.articles.map((a) => [a.jobId || a.id, a]))
  for (const a of incoming) {
    byKey.set(a.jobId || a.id, a)
  }
  const next = [...byKey.values()].sort((a, b) => b.createdAt - a.createdAt)
  writeStore({ ...store, articles: next, updatedAt: Date.now() })
  return next
}

export function removeArticle(id: string): GeneratedArticle[] {
  const store = readStore()
  const next = store.articles.filter((a) => a.id !== id)
  writeStore({ ...store, articles: next, updatedAt: Date.now() })
  return next
}

export function saveBatchConfig(config: ArticleBatchConfig): void {
  const store = readStore()
  writeStore({ ...store, lastConfig: config, updatedAt: Date.now() })
}

export function saveJobSnapshots(snapshots: Record<string, ArticleJob>): void {
  const store = readStore()
  writeStore({
    ...store,
    jobSnapshots: { ...store.jobSnapshots, ...snapshots },
    updatedAt: Date.now(),
  })
}

export function getJobSnapshot(jobId: string): ArticleJob | undefined {
  return readStore().jobSnapshots?.[jobId]
}
