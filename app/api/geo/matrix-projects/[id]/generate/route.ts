import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { getServerFastapiBase } from "@/lib/fastapi-base"
import { generateMatrixConcurrent } from "@/lib/geo/matrix-generate"
import type { LlmProviderId } from "@/lib/geo/llm/router"
import type { GenerateMatrixRequest, MatrixProject } from "@/lib/geo/matrix-types"

export const runtime = "nodejs"
export const maxDuration = 180

const VALID_PROVIDERS = new Set<LlmProviderId>([
  "deepseek",
  "doubao",
  "kimi",
  "gpt",
  "claude",
  "gemini",
])

type RouteContext = { params: Promise<{ id: string }> }

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

async function saveProjectMatrix(
  projectId: string,
  cookieHeader: string,
  body: Record<string, unknown>,
): Promise<MatrixProject> {
  const base = getServerFastapiBase()
  if (!base) throw new Error("后端服务未配置")
  const resp = await fetch(`${base}/api/geo/matrix-projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Cookie: cookieHeader },
    body: JSON.stringify(body),
  })
  if (!resp.ok) {
    const err = await resp.text().catch(() => "")
    throw new Error(err || `保存失败 ${resp.status}`)
  }
  const data = (await resp.json()) as { project: MatrixProject }
  return data.project
}

async function handleGenerate(
  req: Request,
  cookieHeader: string,
  projectId: string,
  userId: number,
): Promise<Response> {
  try {
    const body = (await req.json()) as GenerateMatrixRequest

    const project = await fetchProject(projectId, cookieHeader)
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 })
    }

    const provider = String(body.provider ?? project.provider ?? "deepseek") as LlmProviderId
    const platforms = Array.isArray(body.platforms) ? body.platforms.filter(Boolean) : []

    if (!VALID_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: "不支持的模型 provider" }, { status: 400 })
    }
    if (platforms.length < 1) {
      return NextResponse.json({ error: "请至少选择一个平台" }, { status: 400 })
    }

    let matrix
    try {
      matrix = await generateMatrixConcurrent({
        provider,
        projectName: project.name,
        platforms,
        modelSkillId: body.modelSkillId ?? project.modelSkillId,
        viralSkillIds: body.viralSkillIds ?? project.viralSkillIds,
        enterpriseSnapshot: body.enterpriseSnapshot ?? project.enterpriseSnapshot,
        userId,
        cookieHeader,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败"
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : 502
      return NextResponse.json({ error: message }, { status: statusCode })
    }

    const updated = await saveProjectMatrix(projectId, cookieHeader, {
      matrix,
      platforms,
      provider,
      modelSkillId: body.modelSkillId ?? project.modelSkillId,
      viralSkillIds: body.viralSkillIds ?? project.viralSkillIds,
      enterpriseSkillId: body.enterpriseSkillId ?? project.enterpriseSkillId,
      enterpriseSnapshot: body.enterpriseSnapshot ?? project.enterpriseSnapshot,
    })

    return NextResponse.json({ project: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : "生成失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request, context: RouteContext) {
  const { id } = await context.params
  return withAuth(async (innerReq, { userId, cookieHeader }) =>
    handleGenerate(innerReq, cookieHeader, id, userId),
  )(req)
}
