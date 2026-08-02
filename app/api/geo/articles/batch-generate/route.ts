import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { getServerFastapiBase } from "@/lib/fastapi-base"
import { completeCloudArticleText } from "@/lib/geo/article-cloud-completion"
import { expandMatrixJobs } from "@/lib/geo/article-batch-jobs"
import { generateArticlesConcurrent } from "@/lib/geo/article-generate"
import type { BatchGenerateEvent } from "@/lib/geo/article-types"
import { viralSkillIdsForPlatforms } from "@/lib/geo/matrix-platforms"
import { settleGeoArticleBilling, type CompleteTextParams } from "@/lib/geo/llm/router"
import { listCopywritingProviderCandidates } from "@/lib/llm/copywriting-router"
import type { MatrixProject } from "@/lib/geo/matrix-types"

export const runtime = "nodejs"
export const maxDuration = 300

const CLOUD_MODEL_NOT_READY = "CLOUD_MODEL_NOT_READY"
const CLOUD_MODEL_UNAVAILABLE = "CLOUD_MODEL_UNAVAILABLE"
const GEO_ARTICLE_GENERATION_CONCURRENCY = Math.max(
  1,
  Math.min(8, Number(process.env.GEO_ARTICLE_GENERATION_CONCURRENCY) || 3),
)
const GEO_ARTICLE_PROVIDER_TIMEOUT_MS = Math.max(
  15_000,
  Math.min(90_000, Number(process.env.GEO_ARTICLE_PROVIDER_TIMEOUT_MS) || 45_000),
)

async function fetchProject(
  projectId: string,
  cookieHeader: string,
): Promise<MatrixProject | null> {
  const base = getServerFastapiBase()
  if (!base) return null
  const resp = await fetch(`${base}/api/geo/matrix-projects/${projectId}`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })
  if (!resp.ok) return null
  const data = (await resp.json()) as { project?: MatrixProject }
  return data.project ?? null
}

function encodeSse(event: BatchGenerateEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`
}

async function handleBatchGenerate(
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
    return NextResponse.json({ error: "请选择矩阵项目" }, { status: 400 })
  }
  const project = await fetchProject(projectId, cookieHeader)
  if (!project) {
    return NextResponse.json({ error: "矩阵项目不存在" }, { status: 404 })
  }

  const providers = listCopywritingProviderCandidates({
    hasImages: false,
    featureId: "geo.article.generate",
  })
    .filter((candidate) => candidate.source === "cloud")
    .map((candidate) => ({
      ...candidate,
      timeoutMs: Math.min(candidate.timeoutMs, GEO_ARTICLE_PROVIDER_TIMEOUT_MS),
    }))
  if (providers.length === 0) {
    return NextResponse.json(
      { code: CLOUD_MODEL_NOT_READY, error: "云端模型配置尚未同步，请稍后重试" },
      { status: 503 },
    )
  }

  const dates = Array.isArray(body.dates) ? body.dates.map(String).filter(Boolean) : []
  const rawCopies =
    typeof body.copiesPerSlot === "number" ? body.copiesPerSlot : Number(body.copiesPerSlot)
  let preview
  try {
    preview = expandMatrixJobs({
      mode: "matrix",
      project,
      dates,
      copiesPerSlot: Number.isFinite(rawCopies) ? rawCopies : undefined,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "任务展开失败" },
      { status: 400 },
    )
  }

  const batchId = crypto.randomUUID()
  const jobs = preview.jobs
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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      let closed = false
      const send = (event: BatchGenerateEvent) => {
        if (!closed) controller.enqueue(encoder.encode(encodeSse(event)))
      }
      const heartbeat = setInterval(() => {
        if (!closed) controller.enqueue(encoder.encode(": keepalive\n\n"))
      }, 10_000)

      send({
        type: "batch_start",
        batchId,
        total: jobs.length,
        jobs: jobs.map((job) => ({
          jobId: job.jobId,
          title: job.title,
          platformId: job.platformId,
          date: job.date,
        })),
      })

      let successCount = 0
      let failCount = 0
      try {
        await generateArticlesConcurrent(
          jobs,
          {
            batchId,
            modelSkillId: project.modelSkillId,
            viralSkillIds: viralSkillIdsForPlatforms(
              project.matrix.platforms.map((platform) => platform.platformId),
            ),
            enterpriseSnapshot: project.enterpriseSnapshot,
            userId,
            cookieHeader,
            complete,
          },
          {
            concurrency: GEO_ARTICLE_GENERATION_CONCURRENCY,
            onProgress: (event) => {
              if (event.type === "job_start") {
                send({
                  type: "job_start",
                  jobId: event.jobId,
                  index: event.index,
                  total: event.total,
                })
              } else if (event.type === "job_done") {
                successCount += 1
                send({ type: "job_done", jobId: event.jobId, article: event.article })
              } else {
                failCount += 1
                send({ type: "job_error", jobId: event.jobId, error: event.error })
              }
            },
          },
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : CLOUD_MODEL_UNAVAILABLE
        send({ type: "job_error", jobId: "batch", error: message })
      }

      clearInterval(heartbeat)
      send({ type: "batch_complete", successCount, failCount })
      closed = true
      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

export async function POST(req: Request) {
  return withAuth(async (innerReq, { userId, cookieHeader }) =>
    handleBatchGenerate(innerReq, cookieHeader, userId),
  )(req)
}
