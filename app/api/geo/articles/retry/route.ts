import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { getServerFastapiBase } from "@/lib/fastapi-base"
import { completeCloudArticleText } from "@/lib/geo/article-cloud-completion"
import { buildRetryJob } from "@/lib/geo/article-batch-jobs"
import { generateOneArticle } from "@/lib/geo/article-generate"
import type { ArticleJob } from "@/lib/geo/article-types"
import { settleGeoArticleBilling, type CompleteTextParams } from "@/lib/geo/llm/router"
import { viralSkillIdsForPlatforms } from "@/lib/geo/matrix-platforms"
import type { MatrixProject } from "@/lib/geo/matrix-types"
import { listCopywritingProviderCandidates } from "@/lib/llm/copywriting-router"

export const runtime = "nodejs"
export const maxDuration = 120

const CLOUD_MODEL_NOT_READY = "CLOUD_MODEL_NOT_READY"
const CLOUD_MODEL_UNAVAILABLE = "CLOUD_MODEL_UNAVAILABLE"

async function fetchProject(
  projectId: string,
  cookieHeader: string,
): Promise<MatrixProject | null> {
  const base = getServerFastapiBase()
  if (!base) return null
  const response = await fetch(`${base}/api/geo/matrix-projects/${projectId}`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })
  if (!response.ok) return null
  return ((await response.json()) as { project?: MatrixProject }).project ?? null
}

function rebuildMatrixJob(raw: unknown, project: MatrixProject): ArticleJob | null {
  if (!raw || typeof raw !== "object") return null
  const value = raw as Record<string, unknown>
  const jobId = String(value.jobId ?? "").trim()
  const platformId = String(value.platformId ?? "").trim()
  const date = String(value.date ?? "").trim()
  const title = String(value.title ?? "").trim()
  if (!jobId || !platformId || !date) return null
  try {
    return buildRetryJob({
      jobId,
      mode: "matrix",
      platformId,
      date,
      title,
      project,
    })
  } catch {
    return null
  }
}

async function handleRetry(
  req: Request,
  cookieHeader: string,
  userId: number,
): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "无效 JSON" }, { status: 400 })
  }

  const projectId = String(body.projectId ?? "").trim()
  if (!projectId) {
    return NextResponse.json({ error: "缺少矩阵项目" }, { status: 400 })
  }
  const project = await fetchProject(projectId, cookieHeader)
  if (!project) {
    return NextResponse.json({ error: "矩阵项目不存在" }, { status: 404 })
  }
  const job = rebuildMatrixJob(body.job, project)
  if (!job) {
    return NextResponse.json({ error: "任务不属于当前内容矩阵" }, { status: 400 })
  }

  const providers = listCopywritingProviderCandidates({ hasImages: false }).filter(
    (candidate) => candidate.source === "cloud",
  )
  if (providers.length === 0) {
    return NextResponse.json(
      { code: CLOUD_MODEL_NOT_READY, error: "云端模型配置尚未同步，请稍后重试" },
      { status: 503 },
    )
  }

  const batchId = `retry-${crypto.randomUUID()}`
  const complete = async (params: CompleteTextParams): Promise<string> =>
    completeCloudArticleText({
      providers,
      system: params.system,
      user: params.user,
      maxTokens: params.maxTokens,
      settleBilling: async (provider) => {
        if (!params.billing) return
        await settleGeoArticleBilling({
          ...params.billing,
          provider: provider.model || provider.name,
        })
      },
    })

  const article = await generateOneArticle(job, {
    batchId,
    modelSkillId: project.modelSkillId,
    viralSkillIds: viralSkillIdsForPlatforms([job.platformId]),
    enterpriseSnapshot: project.enterpriseSnapshot,
    userId,
    cookieHeader,
    complete,
  })

  if (article.status === "failed") {
    const code = article.error?.includes(CLOUD_MODEL_UNAVAILABLE)
      ? CLOUD_MODEL_UNAVAILABLE
      : "ARTICLE_GENERATION_FAILED"
    return NextResponse.json(
      { code, error: article.error ?? "生成失败", article },
      { status: 502 },
    )
  }
  return NextResponse.json({ article })
}

export async function POST(req: Request) {
  return withAuth(async (innerReq, { userId, cookieHeader }) =>
    handleRetry(innerReq, cookieHeader, userId),
  )(req)
}
