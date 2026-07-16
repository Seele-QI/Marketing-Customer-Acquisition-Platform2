import type { MatrixCell } from "@/lib/geo/matrix-types"

/** 同一天×同一渠道可展开的篇数上限 */
export const ARTICLE_BATCH_COPIES_PER_SLOT_MAX = 10

export type ArticleJob = {
  jobId: string
  mode: "direction" | "matrix"
  platformId: string
  date?: string
  title: string
  brief: string
  matrixMeta?: Pick<
    MatrixCell,
    "themeArc" | "format" | "geoIntent" | "platformNative"
  >
}

export type GeneratedArticle = {
  id: string
  jobId: string
  mode: ArticleJob["mode"]
  platformId: string
  date?: string
  title: string
  markdown: string
  status: "success" | "failed"
  error?: string
  createdAt: number
}

export type RetryArticleRequest = {
  provider: string
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSnapshot?: string | null
  job: ArticleJob
}

export type BatchGenerateRequest = {
  provider: string
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSnapshot?: string | null
  mode: "direction" | "matrix"
  direction?: string
  projectId?: string
  dates?: string[]
  platformIds: string[]
  /** 每个日期×平台（或方向模式下每个平台）生成篇数，默认 1，范围 1–10 */
  copiesPerSlot?: number
}

export type BatchJobPreview = {
  jobs: ArticleJob[]
  skipped: { date: string; platformId: string; reason: string }[]
}

export type BatchGenerateEvent =
  | {
      type: "batch_start"
      batchId: string
      total: number
      jobs: { jobId: string; title: string; platformId: string; date?: string }[]
    }
  | { type: "job_start"; jobId: string; index: number; total: number }
  | {
      type: "job_done"
      jobId: string
      article: GeneratedArticle
    }
  | { type: "job_error"; jobId: string; error: string }
  | {
      type: "batch_complete"
      successCount: number
      failCount: number
    }
