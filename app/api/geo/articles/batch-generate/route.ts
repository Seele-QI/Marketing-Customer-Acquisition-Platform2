import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { getServerFastapiBase } from "@/lib/fastapi-base"
import { expandJobs } from "@/lib/geo/article-batch-jobs"
import { generateArticlesConcurrent } from "@/lib/geo/article-generate"
import type { BatchGenerateEvent } from "@/lib/geo/article-types"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import type { MatrixProject } from "@/lib/geo/matrix-types"

export const runtime = "nodejs"
export const maxDuration = 300

const VALID_PROVIDERS = new Set<LlmProviderId>([
  "deepseek",
  "doubao",
  "kimi",
  "gpt",
  "claude",
  "gemini",
])

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

  const provider = String(body.provider ?? "deepseek") as LlmProviderId
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "不支持的模型 provider" }, { status: 400 })
  }

  const mode = body.mode === "matrix" ? "matrix" : "direction"
  const platformIds = Array.isArray(body.platformIds)
    ? body.platformIds.map(String).filter(Boolean)
    : []

  let preview
  try {
    if (mode === "direction") {
      preview = expandJobs({
        mode: "direction",
        direction: String(body.direction ?? ""),
        platformIds,
      })
    } else {
      const projectId = String(body.projectId ?? "").trim()
      if (!projectId) {
        return NextResponse.json({ error: "请选择矩阵项目" }, { status: 400 })
      }
      const project = await fetchProject(projectId, cookieHeader)
      if (!project) {
        return NextResponse.json({ error: "矩阵项目不存在" }, { status: 404 })
      }
      const dates = Array.isArray(body.dates) ? body.dates.map(String).filter(Boolean) : []
      preview = expandJobs({
        mode: "matrix",
        project,
        dates,
        platformIds,
      })
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "任务展开失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }

  const batchId = crypto.randomUUID()
  const jobs = preview.jobs
  const modelSkillId =
    body.modelSkillId === null || body.modelSkillId === undefined
      ? null
      : String(body.modelSkillId)
  const viralSkillIds = Array.isArray(body.viralSkillIds)
    ? body.viralSkillIds.map(String)
    : []
  const enterpriseSnapshot =
    body.enterpriseSnapshot != null ? String(body.enterpriseSnapshot) : null

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder()
      const send = (event: BatchGenerateEvent) => {
        controller.enqueue(encoder.encode(encodeSse(event)))
      }

      send({
        type: "batch_start",
        batchId,
        total: jobs.length,
        jobs: jobs.map((j) => ({
          jobId: j.jobId,
          title: j.title,
          platformId: j.platformId,
          date: j.date,
        })),
      })

      let successCount = 0
      let failCount = 0

      try {
        await generateArticlesConcurrent(
          jobs,
          {
            provider,
            batchId,
            modelSkillId,
            viralSkillIds,
            enterpriseSnapshot,
            userId,
            cookieHeader,
          },
          {
            concurrency: 20,
            onProgress: (ev) => {
              if (ev.type === "job_start") {
                send({
                  type: "job_start",
                  jobId: ev.jobId,
                  index: ev.index,
                  total: ev.total,
                })
              } else if (ev.type === "job_done") {
                successCount += 1
                send({ type: "job_done", jobId: ev.jobId, article: ev.article })
              } else if (ev.type === "job_error") {
                failCount += 1
                send({ type: "job_error", jobId: ev.jobId, error: ev.error })
              }
            },
          },
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : "批量生成失败"
        controller.enqueue(
          encoder.encode(
            encodeSse({
              type: "job_error",
              jobId: "batch",
              error: message,
            }),
          ),
        )
      }

      send({ type: "batch_complete", successCount, failCount })
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
