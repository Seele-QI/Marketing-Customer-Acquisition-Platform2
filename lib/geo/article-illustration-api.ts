import { parseApiErrorResponse } from "@/lib/api/parse-detail"
import {
  parseArticleIllustrationStatus,
  type ArticleIllustrationGenerateRequest,
  type ArticleIllustrationTaskSnapshot,
} from "@/lib/geo/article-illustration-types"

export type ArticleIllustrationTaskScope = {
  taskId: string
  projectId: string
  articleId: string
}

type PollOptions = {
  fetcher?: typeof fetch
  intervalMs?: number
  timeoutMs?: number
  sleep?: (ms: number) => Promise<void>
  now?: () => number
  signal?: AbortSignal
  onUpdate?: (snapshot: ArticleIllustrationTaskSnapshot) => void
  onRetry?: (error: Error, attempt: number) => void
}

class IllustrationApiError extends Error {
  readonly status: number

  constructor(
    message: string,
    status: number,
  ) {
    super(message)
    this.status = status
  }
}

async function parseResponse(
  response: Response,
  fallback: string,
): Promise<ArticleIllustrationTaskSnapshot> {
  let payload: unknown = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }
  if (!response.ok) {
    throw new IllustrationApiError(
      parseApiErrorResponse(
        response.status,
        payload as { detail?: unknown; error?: string },
        fallback,
      ),
      response.status,
    )
  }
  return parseArticleIllustrationStatus(payload)
}

export async function submitArticleIllustrationTask(
  input: ArticleIllustrationGenerateRequest,
  fetcher: typeof fetch = fetch,
): Promise<ArticleIllustrationTaskSnapshot> {
  const response = await fetcher("/api/geo/article-illustrations/generate", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  return parseResponse(response, "插图任务提交失败")
}

export async function queryArticleIllustrationStatus(
  scope: ArticleIllustrationTaskScope,
  fetcher: typeof fetch = fetch,
): Promise<ArticleIllustrationTaskSnapshot> {
  const query = new URLSearchParams({
    taskId: scope.taskId,
    projectId: scope.projectId,
    articleId: scope.articleId,
  })
  const response = await fetcher(
    `/api/geo/article-illustrations/status?${query.toString()}`,
    { credentials: "include", cache: "no-store" },
  )
  return parseResponse(response, "插图任务查询失败")
}

export async function retryFailedArticleIllustrations(
  scope: ArticleIllustrationTaskScope,
  failedIllustrationIds: string[],
  fetcher: typeof fetch = fetch,
): Promise<ArticleIllustrationTaskSnapshot> {
  const response = await fetcher("/api/geo/article-illustrations/retry", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      projectId: scope.projectId,
      articleId: scope.articleId,
      taskId: scope.taskId,
      failedIllustrationIds: [...new Set(failedIllustrationIds.filter(Boolean))],
    }),
  })
  return parseResponse(response, "插图重试失败")
}

function isTransient(error: unknown): boolean {
  if (error instanceof TypeError) return true
  if (error instanceof IllustrationApiError) {
    return error.status === 502 || error.status === 503 || error.status === 504
  }
  if (!(error instanceof Error)) return false
  return /(?:HTTP\s*)?(?:502|503|504)|网络|fetch failed|暂时繁忙/i.test(
    error.message,
  )
}

export async function waitForArticleIllustrationResult(
  scope: ArticleIllustrationTaskScope,
  options: PollOptions = {},
): Promise<ArticleIllustrationTaskSnapshot> {
  const fetcher = options.fetcher ?? fetch
  const intervalMs = options.intervalMs ?? 2_000
  const timeoutMs = options.timeoutMs ?? 10 * 60_000
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const now = options.now ?? Date.now
  const startedAt = now()
  let retries = 0

  while (true) {
    if (options.signal?.aborted) {
      throw new DOMException("轮询已停止", "AbortError")
    }
    if (now() - startedAt > timeoutMs) {
      throw new Error(`插图生成仍在后台进行，可稍后恢复：${scope.taskId}`)
    }
    try {
      const status = await queryArticleIllustrationStatus(scope, fetcher)
      retries = 0
      options.onUpdate?.(status)
      if (status.status === "success" || status.status === "failed") {
        return status
      }
    } catch (error) {
      if (!isTransient(error) || retries >= 3) throw error
      retries += 1
      options.onRetry?.(
        error instanceof Error ? error : new Error(String(error)),
        retries,
      )
    }
    await sleep(intervalMs)
  }
}
