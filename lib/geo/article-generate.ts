import crypto from "node:crypto"

import {
  buildArticleRewritePrompt,
  buildArticleSystemPrompt,
  buildArticleUserPrompt,
  type ArticlePromptContext,
} from "@/lib/geo/article-prompt"
import {
  ARTICLE_HARD_MAX_CHARS,
  countChars,
  enforceArticleFormat,
} from "@/lib/geo/article-format"
import {
  findArticleRisks,
  summarizeRiskFindings,
} from "@/lib/geo/article-compliance"
import {
  selectArticleStructure,
  validateArticleStructure,
} from "@/lib/geo/article-structure"
import {
  getMatrixPlatformLabel,
  viralSkillIdsForPlatforms,
} from "@/lib/geo/matrix-platforms"
import type { ArticleJob, GeneratedArticle } from "@/lib/geo/article-types"
import {
  completeText,
  type CompleteTextBilling,
  type CompleteTextParams,
  type LlmProviderId,
} from "@/lib/geo/llm/router"

export type GenerateArticlesParams = ArticlePromptContext & {
  provider?: LlmProviderId
  batchId: string
  userId?: number
  cookieHeader?: string
  complete?: (params: CompleteTextParams) => Promise<string>
}

export type ArticleProgressEvent =
  | { type: "job_start"; jobId: string; index: number; total: number }
  | { type: "job_done"; jobId: string; article: GeneratedArticle }
  | { type: "job_error"; jobId: string; error: string }

/** 短文生成，token 预算相应下调 */
const MAX_TOKENS = 2048
const DEFAULT_CONCURRENCY = 20
const MAX_COMPLIANCE_REGENERATIONS = 2

function billingFor(
  params: GenerateArticlesParams,
  jobId: string,
  suffix?:
    | "rewrite"
    | `compliance-retry-${number}`
    | `provider-compliance-retry-${number}`,
): CompleteTextBilling | undefined {
  if (params.userId == null || !params.cookieHeader) return undefined
  return {
    userId: params.userId,
    cookieHeader: params.cookieHeader,
    refIdPrefix: `geo-article:${params.batchId}:${jobId}${suffix ? `:${suffix}` : ""}`,
    provider: params.provider ?? "deepseek",
    businessTask: {
      businessTaskId: params.batchId,
      businessType: "geo_article_batch",
      billingStage: "llm_generation",
    },
  }
}

function hasComplianceReason(reasons: string[]): boolean {
  return reasons.some((reason) => reason.startsWith("平台合规："))
}

const COMPLIANCE_ERROR_RE =
  /违禁|敏感|合规|审核|安全策略|内容风控|content[\s_-]*(?:filter|moderation)|moderation|policy violation/i

function isComplianceProviderError(error: unknown): boolean {
  return error instanceof Error && COMPLIANCE_ERROR_RE.test(error.message)
}

function buildComplianceRegenerationPrompt(
  job: ArticleJob,
  ctx: ArticlePromptContext,
): string {
  return `${buildArticleUserPrompt(job, ctx)}

【重新创作要求】
上一稿未通过发布平台的合规检查。请从零重新创作一篇全新文章，不得复用上一稿措辞；避免绝对化承诺、效果保证、诱导互动、虚假权威和平台敏感表达。只输出完整成稿。`
}

const VALID_TAG_LINE_RE = /^标签：(?:#[^\s#]+)(?:\s+#[^\s#]+){2,4}$/

function validationReasons(formatted: string, job: ArticleJob): string[] {
  const reasons: string[] = []
  const lines = formatted
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
  const firstLine = lines[0] ?? ""
  const lastLine = lines.at(-1) ?? ""
  const structure = validateArticleStructure(formatted)
  const risks = findArticleRisks(formatted, job.platformId)

  if (countChars(formatted) > ARTICLE_HARD_MAX_CHARS) {
    reasons.push(`全文超过 ${ARTICLE_HARD_MAX_CHARS} 字`)
  }
  if (!firstLine || firstLine.startsWith("标签：") || firstLine.length > 100) {
    reasons.push("缺少清晰的首行标题")
  }
  if (structure.sectionCount < 3) {
    reasons.push("正文少于 3 个清晰小节")
  }
  if (structure.missingEnding) {
    reasons.push("缺少总结或常见问题结尾")
  }
  if (!VALID_TAG_LINE_RE.test(lastLine)) {
    reasons.push("文末标签格式不合格")
  }
  const riskSummary = summarizeRiskFindings(risks)
  if (riskSummary) {
    reasons.push(`平台合规：${riskSummary}`)
  }

  return reasons
}

function normalizeArticle(raw: string, job: ArticleJob): string {
  return enforceArticleFormat(raw, {
    title: job.title,
    platformLabel: getMatrixPlatformLabel(job.platformId),
  })
}

export async function generateOneArticle(
  job: ArticleJob,
  params: GenerateArticlesParams,
): Promise<GeneratedArticle> {
  const id = crypto.randomUUID()
  const createdAt = Date.now()

  try {
    const complete = params.complete ?? completeText
    const promptContext: ArticlePromptContext = {
      modelSkillId: params.modelSkillId,
      viralSkillIds: viralSkillIdsForPlatforms([job.platformId]),
      enterpriseSnapshot: params.enterpriseSnapshot,
    }
    let markdown: string
    try {
      markdown = await complete({
        provider: params.provider ?? "deepseek",
        system: buildArticleSystemPrompt(),
        user: buildArticleUserPrompt(job, promptContext),
        maxTokens: MAX_TOKENS,
        billing: billingFor(params, job.jobId),
      })
    } catch (initialError) {
      if (!isComplianceProviderError(initialError)) throw initialError
      let lastError: unknown = initialError
      markdown = ""
      for (
        let attempt = 1;
        attempt <= MAX_COMPLIANCE_REGENERATIONS;
        attempt += 1
      ) {
        try {
          markdown = await complete({
            provider: params.provider ?? "deepseek",
            system: buildArticleSystemPrompt(),
            user: buildComplianceRegenerationPrompt(job, promptContext),
            maxTokens: MAX_TOKENS,
            billing: billingFor(
              params,
              job.jobId,
              `provider-compliance-retry-${attempt}`,
            ),
          })
          if (markdown.trim()) break
        } catch (retryError) {
          lastError = retryError
          if (!isComplianceProviderError(retryError)) throw retryError
        }
      }
      if (!markdown.trim()) {
        const detail =
          lastError instanceof Error ? lastError.message : "平台合规审核未通过"
        throw new Error(`文章合规检查未通过，自动重新创作失败：${detail}`)
      }
    }

    const text = markdown.trim()
    if (!text) {
      throw new Error("模型未返回有效正文")
    }

    let formatted = normalizeArticle(text, job)
    if (!formatted.trim()) {
      throw new Error("格式化后正文为空")
    }

    const structureId = selectArticleStructure({
      title: job.title,
      brief: job.brief,
      format: job.matrixMeta?.format,
    })

    const firstReasons = validationReasons(formatted, job)
    if (firstReasons.length > 0) {
      let remainingReasons = firstReasons
      let rewriteFailure: unknown = null
      try {
        const rewritten = await complete({
          provider: params.provider ?? "deepseek",
          system: buildArticleSystemPrompt(),
          user: buildArticleRewritePrompt({
            job,
            original: formatted,
            structureId,
            reasons: firstReasons,
            ctx: promptContext,
          }),
          maxTokens: MAX_TOKENS,
          billing: billingFor(params, job.jobId, "rewrite"),
        })

        if (!rewritten.trim()) {
          throw new Error("模型未返回有效修订正文")
        }
        formatted = normalizeArticle(rewritten, job)
        remainingReasons = validationReasons(formatted, job)
      } catch (rewriteError) {
        rewriteFailure = rewriteError
      }

      if (remainingReasons.length > 0 && hasComplianceReason(remainingReasons)) {
        for (
          let attempt = 1;
          attempt <= MAX_COMPLIANCE_REGENERATIONS;
          attempt += 1
        ) {
          const regenerated = await complete({
            provider: params.provider ?? "deepseek",
            system: buildArticleSystemPrompt(),
            user: buildComplianceRegenerationPrompt(job, promptContext),
            maxTokens: MAX_TOKENS,
            billing: billingFor(
              params,
              job.jobId,
              `compliance-retry-${attempt}`,
            ),
          })
          if (!regenerated.trim()) continue
          formatted = normalizeArticle(regenerated, job)
          remainingReasons = validationReasons(formatted, job)
          if (remainingReasons.length === 0) break
        }
        if (remainingReasons.length > 0) {
          throw new Error(
            `文章合规检查未通过，自动重新创作仍未通过：${remainingReasons.join("；")}`,
          )
        }
      } else if (remainingReasons.length > 0 || rewriteFailure) {
        const detail = rewriteFailure instanceof Error
          ? rewriteFailure.message
          : remainingReasons.join("；") || "修订模型调用失败"
        throw new Error(
          `文章未通过篇幅、结构或平台合规校验，自动修订失败：${detail}`,
        )
      }
    }

    return {
      id,
      jobId: job.jobId,
      projectId: job.projectId,
      mode: job.mode,
      platformId: job.platformId,
      date: job.date,
      title: job.title,
      markdown: formatted,
      status: "success",
      createdAt,
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败"
    return {
      id,
      jobId: job.jobId,
      projectId: job.projectId,
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
