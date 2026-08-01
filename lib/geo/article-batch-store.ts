import type { ArticleJob, GeneratedArticle } from "@/lib/geo/article-types"

export const ARTICLE_BATCH_STORAGE_KEY = "geo-article-batch-v1"

export type ArticleBatchConfig = {
  mode: "matrix"
  projectId: string
  dates: string[]
  /** 旧缓存兼容字段；新流程不读取。 */
  direction?: string
  /** 旧缓存兼容字段；新流程不读取。 */
  platformIds?: string[]
  /** 每个日期×平台（或方向模式下每个平台）生成篇数 */
  copiesPerSlot?: number
  illustrationsPerArticle?: number
}

export type ArticleBatchStore = {
  articles: GeneratedArticle[]
  lastConfig?: ArticleBatchConfig
  configsByProject?: Record<string, ArticleBatchConfig>
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
      configsByProject:
        parsed.configsByProject &&
        typeof parsed.configsByProject === "object"
          ? parsed.configsByProject
          : undefined,
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

function belongsToProject(
  value: { projectId?: string },
  projectId: string,
): boolean {
  return value.projectId === projectId
}

function scopeStore(store: ArticleBatchStore, projectId?: string): ArticleBatchStore {
  if (!projectId) return store
  const jobSnapshots = Object.fromEntries(
    Object.entries(store.jobSnapshots ?? {}).filter(([, job]) =>
      belongsToProject(job, projectId),
    ),
  )
  return {
    articles: store.articles.filter((article) =>
      belongsToProject(article, projectId),
    ),
    lastConfig:
      store.configsByProject?.[projectId] ??
      (store.lastConfig?.projectId === projectId ? store.lastConfig : undefined),
    configsByProject: store.configsByProject,
    jobSnapshots:
      Object.keys(jobSnapshots).length > 0 ? jobSnapshots : undefined,
    updatedAt: store.updatedAt,
  }
}

export function loadArticleBatch(projectId?: string): ArticleBatchStore {
  return scopeStore(readStore(), projectId)
}

export function saveArticles(
  articles: GeneratedArticle[],
  lastConfig?: ArticleBatchConfig,
): void {
  const projectId =
    lastConfig?.projectId ??
    articles.find((article) => Boolean(article.projectId))?.projectId
  const current = readStore()
  const preserved = projectId
    ? current.articles.filter((article) => article.projectId !== projectId)
    : []
  writeStore({
    ...current,
    articles: [...preserved, ...articles],
    lastConfig,
    updatedAt: Date.now(),
  })
}

export function upsertArticle(
  article: GeneratedArticle,
  projectId = article.projectId,
): GeneratedArticle[] {
  const store = readStore()
  const idx = store.articles.findIndex((a) => a.id === article.id)
  const next =
    idx >= 0
      ? store.articles.map((a, i) => (i === idx ? article : a))
      : [...store.articles, article]
  writeStore({ ...store, articles: next, updatedAt: Date.now() })
  return scopeStore({ ...store, articles: next }, projectId).articles
}

export function mergeArticles(
  incoming: GeneratedArticle[],
  projectId = incoming[0]?.projectId,
): GeneratedArticle[] {
  const store = readStore()
  const byKey = new Map(store.articles.map((a) => [a.jobId || a.id, a]))
  for (const a of incoming) {
    byKey.set(a.jobId || a.id, a)
  }
  const next = [...byKey.values()].sort((a, b) => b.createdAt - a.createdAt)
  writeStore({ ...store, articles: next, updatedAt: Date.now() })
  return scopeStore({ ...store, articles: next }, projectId).articles
}

export function removeArticle(id: string, projectId?: string): GeneratedArticle[] {
  const store = readStore()
  const next = store.articles.filter((a) => a.id !== id)
  writeStore({ ...store, articles: next, updatedAt: Date.now() })
  return scopeStore({ ...store, articles: next }, projectId).articles
}

export function saveBatchConfig(config: ArticleBatchConfig): void {
  const store = readStore()
  writeStore({
    ...store,
    lastConfig: config,
    configsByProject: {
      ...store.configsByProject,
      [config.projectId]: config,
    },
    updatedAt: Date.now(),
  })
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
