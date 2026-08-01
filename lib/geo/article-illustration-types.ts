export const ARTICLE_ILLUSTRATIONS_MAX = 5

export type ArticleIllustrationAspectRatio =
  | "3:4"
  | "4:3"
  | "9:16"
  | "16:9"

export type ArticleIllustrationStatus =
  | "queued"
  | "running"
  | "success"
  | "failed"

export type ArticleIllustrationItem = {
  illustrationId: string
  anchorHeading: string
  anchorOccurrence: number
  alt: string
  status: ArticleIllustrationStatus
  imageUrl?: string
  error?: string
}

export type ArticleIllustrationPlanItem = ArticleIllustrationItem & {
  prompt: string
  aspectRatio: ArticleIllustrationAspectRatio
  resolution: "1k"
}

export type ArticleIllustrationTaskSnapshot = {
  taskId: string
  projectId: string
  articleId: string
  requestedCount: number
  completedCount: number
  failedCount: number
  status: ArticleIllustrationStatus
  items: ArticleIllustrationItem[]
  warning?: string
  error?: string
  updatedAt: number
}

export type ArticleIllustrationGenerateRequest = {
  projectId: string
  articleId: string
  platformId: string
  title: string
  markdown: string
  illustrationCount: number
}

const GENERATE_REQUEST_KEYS = new Set([
  "projectId",
  "articleId",
  "platformId",
  "title",
  "markdown",
  "illustrationCount",
])

function requiredText(
  value: unknown,
  label: string,
  maxLength: number,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label}不能为空`)
  }
  const text = value.trim()
  if (text.length > maxLength) {
    throw new Error(`${label}长度超过限制`)
  }
  return text
}

export function clampIllustrationsPerArticle(value: unknown): number {
  const numeric = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.min(
    ARTICLE_ILLUSTRATIONS_MAX,
    Math.max(0, Math.round(numeric)),
  )
}

export function resolveArticleIllustrationRatio(
  platformId: string,
): ArticleIllustrationAspectRatio {
  if (platformId === "xiaohongshu" || platformId === "weibo") return "3:4"
  if (platformId === "douyin") return "9:16"
  if (platformId === "zhihu" || platformId === "netease" || platformId === "sohu") {
    return "16:9"
  }
  return "4:3"
}

export function parseArticleIllustrationGenerateRequest(
  raw: unknown,
): ArticleIllustrationGenerateRequest {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("请求体必须是对象")
  }
  const record = raw as Record<string, unknown>
  const unknownKeys = Object.keys(record).filter(
    (key) => !GENERATE_REQUEST_KEYS.has(key),
  )
  if (unknownKeys.length > 0) {
    throw new Error(`不支持的请求字段：${unknownKeys.join("、")}`)
  }
  const illustrationCount = Number(record.illustrationCount)
  if (
    !Number.isInteger(illustrationCount) ||
    illustrationCount < 1 ||
    illustrationCount > ARTICLE_ILLUSTRATIONS_MAX
  ) {
    throw new Error("每篇插图数量必须是 1 到 5 的整数")
  }
  return {
    projectId: requiredText(record.projectId, "矩阵项目", 120),
    articleId: requiredText(record.articleId, "文章", 160),
    platformId: requiredText(record.platformId, "发布平台", 60),
    title: requiredText(record.title, "文章标题", 300),
    markdown: requiredText(record.markdown, "文章正文", 80_000),
    illustrationCount,
  }
}

function parseItemStatus(value: unknown): ArticleIllustrationStatus {
  return value === "queued" ||
    value === "running" ||
    value === "success" ||
    value === "failed"
    ? value
    : "failed"
}

function safeImageUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined
  const url = value.trim()
  return /^\/static\/geo-article-illustrations\/[A-Za-z0-9._/-]+\.png$/.test(url)
    ? url
    : undefined
}

export function parseArticleIllustrationStatus(
  raw: unknown,
): ArticleIllustrationTaskSnapshot {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("图片任务状态无效")
  }
  const record = raw as Record<string, unknown>
  const rawItems = Array.isArray(record.items) ? record.items : []
  const items = rawItems.map((rawItem): ArticleIllustrationItem => {
    const item =
      rawItem && typeof rawItem === "object"
        ? (rawItem as Record<string, unknown>)
        : {}
    const status = parseItemStatus(item.status)
    const imageUrl = safeImageUrl(item.image_url ?? item.imageUrl)
    return {
      illustrationId: String(
        item.illustration_id ?? item.illustrationId ?? "",
      ),
      anchorHeading: String(item.anchor_heading ?? item.anchorHeading ?? ""),
      anchorOccurrence: Math.max(
        1,
        Number(item.anchor_occurrence ?? item.anchorOccurrence ?? 1) || 1,
      ),
      alt: String(item.alt ?? "文章插图"),
      status: status === "success" && !imageUrl ? "failed" : status,
      imageUrl,
      error:
        status === "success" && !imageUrl
          ? "图片结果地址无效"
          : typeof item.error === "string"
            ? item.error
            : undefined,
    }
  })
  const completedCount = items.filter((item) => item.status === "success").length
  const failedCount = items.filter((item) => item.status === "failed").length
  return {
    taskId: String(record.task_id ?? record.taskId ?? ""),
    projectId: String(record.project_id ?? record.projectId ?? ""),
    articleId: String(record.article_id ?? record.articleId ?? ""),
    requestedCount: items.length,
    completedCount,
    failedCount,
    status: parseItemStatus(record.status),
    items,
    warning: typeof record.warning === "string" ? record.warning : undefined,
    error: typeof record.error === "string" ? record.error : undefined,
    updatedAt: Date.now(),
  }
}
