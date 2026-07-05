import crypto from "node:crypto"

import {
  buildArticleSystemPrompt,
  buildArticleUserPrompt,
  type ArticlePromptContext,
} from "@/lib/geo/article-prompt"
import type { ArticleJob, GeneratedArticle } from "@/lib/geo/article-types"
import {
  completeText,
  type CompleteTextBilling,
  type LlmProviderId,
} from "@/lib/geo/llm/router"

export type GenerateArticlesParams = ArticlePromptContext & {
  provider: LlmProviderId
  batchId: string
  userId?: number
  cookieHeader?: string
}

export type ArticleProgressEvent =
  | { type: "job_start"; jobId: string; index: number; total: number }
  | { type: "job_done"; jobId: string; article: GeneratedArticle }
  | { type: "job_error"; jobId: string; error: string }

const MAX_TOKENS = 4096
const DEFAULT_CONCURRENCY = 20

function billingFor(
  params: GenerateArticlesParams,
  jobId: string,
): CompleteTextBilling | undefined {
  if (params.userId == null || !params.cookieHeader) return undefined
  return {
    userId: params.userId,
    cookieHeader: params.cookieHeader,
    refIdPrefix: `geo-article:${params.batchId}:${jobId}`,
    provider: params.provider,
  }
}

export async function generateOneArticle(
  job: ArticleJob,
  params: GenerateArticlesParams,
): Promise<GeneratedArticle> {
  const id = crypto.randomUUID()
  const createdAt = Date.now()

  try {
    const markdown = await completeText({
      provider: params.provider,
      system: buildArticleSystemPrompt(),
      user: buildArticleUserPrompt(job, params),
      maxTokens: MAX_TOKENS,
      billing: billingFor(params, job.jobId),
    })

    const text = markdown.trim()
    if (!text) {
      throw new Error("模型未返回有效正文")
    }

    return {
      id,
      jobId: job.jobId,
      mode: job.mode,
      platformId: job.platformId,
      date: job.date,
      title: job.title,
      markdown: text,
      status: "success",
      createdAt,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败"
    return {
      id,
      jobId: job.jobId,
      mode: job.mode,
      platformId: job.platformId,
      date: job.date,
      title: job.title,
      markdown: "",
      status: "failed",
      error: message,
      createdAt,
    }
  }
}

/** 有限并发 worker pool */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0

  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i], i)
    }
  }

  const workers = Math.min(Math.max(1, limit), items.length)
  await Promise.all(Array.from({ length: workers }, () => worker()))
  return results
}

export async function generateArticlesConcurrent(
  jobs: ArticleJob[],
  params: GenerateArticlesParams,
  options?: {
    concurrency?: number
    onProgress?: (event: ArticleProgressEvent) => void
  },
): Promise<GeneratedArticle[]> {
  const concurrency = options?.concurrency ?? DEFAULT_CONCURRENCY
  const onProgress = options?.onProgress
  const total = jobs.length

  return mapWithConcurrency(jobs, concurrency, async (job, index) => {
    onProgress?.({ type: "job_start", jobId: job.jobId, index, total })
    const article = await generateOneArticle(job, params)
    if (article.status === "success") {
      onProgress?.({ type: "job_done", jobId: job.jobId, article })
    } else {
      onProgress?.({
        type: "job_error",
        jobId: job.jobId,
        error: article.error ?? "生成失败",
      })
    }
    return article
  })
}
