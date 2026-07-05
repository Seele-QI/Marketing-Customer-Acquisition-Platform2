import type { MatrixProject } from "@/lib/geo/matrix-types"
import { getMatrixPlatformLabel } from "@/lib/geo/matrix-platforms"
import {
  ARTICLE_BATCH_MAX_JOBS,
  type ArticleJob,
  type BatchJobPreview,
} from "@/lib/geo/article-types"

export { ARTICLE_BATCH_MAX_JOBS }

export type ExpandDirectionInput = {
  mode: "direction"
  direction: string
  platformIds: string[]
}

export type ExpandMatrixInput = {
  mode: "matrix"
  project: MatrixProject
  dates: string[]
  platformIds: string[]
}

export type ExpandJobsInput = ExpandDirectionInput | ExpandMatrixInput

function newJobId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().slice(0, 8)
  }
  return Math.random().toString(36).slice(2, 10)
}

export function expandDirectionJobs(input: ExpandDirectionInput): BatchJobPreview {
  const direction = input.direction.trim()
  if (!direction) {
    throw new Error("请填写创作方向")
  }
  if (input.platformIds.length < 1) {
    throw new Error("请至少选择一个平台")
  }

  const jobs: ArticleJob[] = input.platformIds.map((platformId) => {
    const label = getMatrixPlatformLabel(platformId)
    return {
      jobId: newJobId(),
      mode: "direction",
      platformId,
      title: `${direction} · ${label}`,
      brief: direction,
    }
  })

  if (jobs.length > ARTICLE_BATCH_MAX_JOBS) {
    throw new Error(`单次最多生成 ${ARTICLE_BATCH_MAX_JOBS} 篇，当前 ${jobs.length} 篇，请减少平台选择`)
  }

  return { jobs, skipped: [] }
}

export function expandMatrixJobs(input: ExpandMatrixInput): BatchJobPreview {
  const { project, dates, platformIds } = input
  if (platformIds.length < 1) {
    throw new Error("请至少选择一个平台")
  }
  if (dates.length < 1) {
    throw new Error("请至少选择一个日期")
  }

  const matrixPlatforms = project.matrix?.platforms ?? []
  if (matrixPlatforms.length < 1) {
    throw new Error("该项目尚未生成内容矩阵，请先在「内容矩阵规划」中生成矩阵")
  }

  const jobs: ArticleJob[] = []
  const skipped: BatchJobPreview["skipped"] = []
  const seen = new Set<string>()

  for (const date of dates) {
    for (const platformId of platformIds) {
      const key = `${date}|${platformId}`
      if (seen.has(key)) continue
      seen.add(key)

      const pm = matrixPlatforms.find((p) => p.platformId === platformId)
      const cell = pm?.cells?.find((c) => c.date === date)
      if (!cell) {
        skipped.push({
          date,
          platformId,
          reason: "矩阵中无对应格子",
        })
        continue
      }

      jobs.push({
        jobId: newJobId(),
        mode: "matrix",
        platformId,
        date,
        title: cell.title,
        brief: cell.contentDirection,
        matrixMeta: {
          themeArc: cell.themeArc,
          format: cell.format,
          geoIntent: cell.geoIntent,
          platformNative: cell.platformNative,
        },
      })
    }
  }

  if (jobs.length < 1) {
    throw new Error("所选日期与平台在矩阵中无有效格子，请调整选择或先生成矩阵")
  }
  if (jobs.length > ARTICLE_BATCH_MAX_JOBS) {
    throw new Error(
      `单次最多生成 ${ARTICLE_BATCH_MAX_JOBS} 篇，当前 ${jobs.length} 篇，请减少日期或平台`,
    )
  }

  return { jobs, skipped }
}

export function expandJobs(input: ExpandJobsInput): BatchJobPreview {
  if (input.mode === "direction") {
    return expandDirectionJobs(input)
  }
  return expandMatrixJobs(input)
}

/** 从矩阵项目提取可选日期列表（去重排序） */
export function listMatrixDates(project: MatrixProject | null): string[] {
  if (!project?.matrix?.platforms?.length) return []
  const dates = new Set<string>()
  for (const pm of project.matrix.platforms) {
    for (const cell of pm.cells ?? []) {
      if (cell.date) dates.add(cell.date)
    }
  }
  return [...dates].sort()
}
