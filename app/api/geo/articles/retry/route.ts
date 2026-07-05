import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { generateOneArticle } from "@/lib/geo/article-generate"
import type { ArticleJob } from "@/lib/geo/article-types"
import type { LlmProviderId } from "@/lib/geo/llm/router"

export const runtime = "nodejs"
export const maxDuration = 120

const VALID_PROVIDERS = new Set<LlmProviderId>([
  "deepseek",
  "doubao",
  "kimi",
  "gpt",
  "claude",
  "gemini",
])

function sanitizeJob(raw: unknown): ArticleJob | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const jobId = String(o.jobId ?? "").trim()
  const platformId = String(o.platformId ?? "").trim()
  const title = String(o.title ?? "").trim()
  const brief = String(o.brief ?? "").trim()
  const mode = o.mode === "matrix" ? "matrix" : "direction"
  if (!jobId || !platformId || !title || !brief) return null

  const job: ArticleJob = {
    jobId,
    mode,
    platformId,
    title,
    brief,
  }

  if (mode === "matrix") {
    const date = String(o.date ?? "").trim()
    if (!date) return null
    job.date = date
    const meta = o.matrixMeta
    if (meta && typeof meta === "object") {
      const m = meta as Record<string, unknown>
      job.matrixMeta = {
        themeArc: String(m.themeArc ?? ""),
        format: String(m.format ?? ""),
        geoIntent: String(m.geoIntent ?? ""),
        platformNative: String(m.platformNative ?? ""),
      }
    }
  }

  return job
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

  const provider = String(body.provider ?? "deepseek") as LlmProviderId
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "不支持的模型 provider" }, { status: 400 })
  }

  const job = sanitizeJob(body.job)
  if (!job) {
    return NextResponse.json({ error: "无效的任务参数" }, { status: 400 })
  }

  const modelSkillId =
    body.modelSkillId === null || body.modelSkillId === undefined
      ? null
      : String(body.modelSkillId)
  const viralSkillIds = Array.isArray(body.viralSkillIds)
    ? body.viralSkillIds.map(String)
    : []
  const enterpriseSnapshot =
    body.enterpriseSnapshot != null ? String(body.enterpriseSnapshot) : null

  const batchId = `retry-${crypto.randomUUID()}`
  const article = await generateOneArticle(job, {
    provider,
    batchId,
    modelSkillId,
    viralSkillIds,
    enterpriseSnapshot,
    userId,
    cookieHeader,
  })

  if (article.status === "failed") {
    return NextResponse.json(
      { error: article.error ?? "生成失败", article },
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
