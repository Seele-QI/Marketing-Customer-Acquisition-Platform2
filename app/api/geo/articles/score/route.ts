import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { getServerFastapiBase } from "@/lib/fastapi-base"
import { completeCloudArticleText } from "@/lib/geo/article-cloud-completion"
import {
  buildArticleScoreSystemPrompt,
  buildArticleScoreUserPrompt,
} from "@/lib/geo/article-score-prompt"
import { parseArticleScorePayload } from "@/lib/geo/article-score-parser"
import { viralSkillIdsForPlatforms } from "@/lib/geo/matrix-platforms"
import type { MatrixProject } from "@/lib/geo/matrix-types"
import { listCopywritingProviderCandidates } from "@/lib/llm/copywriting-router"

export const runtime = "nodejs"
export const maxDuration = 60

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

async function handleScore(req: Request, cookieHeader: string): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 })
  }

  const markdown = String(body.markdown ?? "").trim()
  if (!markdown) {
    return NextResponse.json({ error: "缺少待评分正文" }, { status: 400 })
  }
  const projectId = String(body.projectId ?? "").trim()
  const project = projectId ? await fetchProject(projectId, cookieHeader) : null
  if (!project) {
    return NextResponse.json({ error: "矩阵项目不存在" }, { status: 404 })
  }

  const requestedPlatformId = String(body.platformId ?? "").trim()
  const platformId = project.matrix.platforms.some(
    (platform) => platform.platformId === requestedPlatformId,
  )
    ? requestedPlatformId
    : null
  const providers = listCopywritingProviderCandidates({
    hasImages: false,
    featureId: "geo.article.generate",
  }).filter(
    (candidate) => candidate.source === "cloud",
  )
  if (providers.length === 0) {
    return NextResponse.json(
      { code: CLOUD_MODEL_NOT_READY, error: "云端模型配置尚未同步，请稍后重试" },
      { status: 503 },
    )
  }

  try {
    const text = await completeCloudArticleText({
      providers,
      system: buildArticleScoreSystemPrompt(),
      user: buildArticleScoreUserPrompt(markdown, {
        modelSkillId: project.modelSkillId,
        viralSkillIds: platformId ? viralSkillIdsForPlatforms([platformId]) : [],
        enterpriseSnapshot: project.enterpriseSnapshot,
        platformId,
      }),
      maxTokens: 1024,
      validateText: (candidate) => parseArticleScorePayload(candidate) !== null,
    })
    const parsed = parseArticleScorePayload(text)
    if (!parsed) {
      return NextResponse.json(
        { code: CLOUD_MODEL_UNAVAILABLE, error: "云端模型未返回有效评分" },
        { status: 502 },
      )
    }
    return NextResponse.json(parsed)
  } catch (error) {
    const actual = error as Error & { code?: string; statusCode?: number }
    return NextResponse.json(
      {
        code: actual.code ?? CLOUD_MODEL_UNAVAILABLE,
        error: actual.message || "评分失败",
      },
      { status: actual.statusCode ?? 502 },
    )
  }
}

export async function POST(req: Request) {
  return withAuth(async (innerReq, { cookieHeader }) =>
    handleScore(innerReq, cookieHeader),
  )(req)
}
