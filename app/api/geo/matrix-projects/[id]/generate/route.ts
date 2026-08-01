import crypto from "node:crypto"

import { NextResponse } from "next/server"

import { withAuth, chargeCredit, chargeErrorResponse } from "@/lib/api/with-auth"
import { getServerFastapiBase } from "@/lib/fastapi-base"
import { completeCloudCopywritingText } from "@/lib/geo/cloud-copywriting-completion"
import { generateMatrixConcurrent } from "@/lib/geo/matrix-generate"
import { sanitizeMatrixPlatformIds } from "@/lib/geo/matrix-platforms"
import type { GenerateMatrixRequest, MatrixProject } from "@/lib/geo/matrix-types"
import {
  listCopywritingProviderCandidates,
  type CopywritingProviderFailure,
} from "@/lib/llm/copywriting-router"

export const runtime = "nodejs"
export const maxDuration = 180

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
): Promise<Response> {
  try {
    const body = (await req.json()) as GenerateMatrixRequest

    const project = await fetchProject(projectId, cookieHeader)
    if (!project) {
      return NextResponse.json({ error: "项目不存在" }, { status: 404 })
    }

    const platforms = sanitizeMatrixPlatformIds(body.platforms)

    if (platforms.length < 1) {
      return NextResponse.json({ error: "请至少选择一个平台" }, { status: 400 })
    }

    // 旧客户端提交的 provider 不参与路由决策，矩阵只使用云端下发模型。
    const cloudProviders = listCopywritingProviderCandidates({ hasImages: false }).filter(
      (candidate) => candidate.source === "cloud",
    )
    if (cloudProviders.length === 0) {
      const message = "云端模型配置尚未同步，请稍后重试"
      return NextResponse.json(
        { error: message, detail: { code: "CLOUD_MODEL_NOT_READY", message } },
        { status: 503 },
      )
    }

    const businessTaskId = crypto.randomUUID()
    const refId = `geo-matrix:${projectId}:${businessTaskId}`
    try {
      await chargeCredit({
        cookieHeader,
        scene: "geo_matrix_gen",
        refId,
        businessTask: {
          businessTaskId,
          businessType: "geo_matrix",
          billingStage: "llm_generation",
        },
      })
    } catch (e) {
      return chargeErrorResponse(e)
    }

    let matrix
    try {
      matrix = await generateMatrixConcurrent({
        projectName: project.name,
        platforms,
        modelSkillId: body.modelSkillId ?? project.modelSkillId,
        viralSkillIds: body.viralSkillIds ?? project.viralSkillIds,
        enterpriseSnapshot: body.enterpriseSnapshot ?? project.enterpriseSnapshot,
        complete: async (input) => {
          const completion = await completeCloudCopywritingText({
            providers: cloudProviders,
            messages: [
              { role: "system", content: input.system },
              { role: "user", content: input.user },
            ],
            maxTokens: input.maxTokens,
            validateText: input.validateText,
          })
          if (!completion.ok) {
            throw Object.assign(
              new Error("云端生成服务繁忙，系统已尝试备用渠道，请稍后重试"),
              {
                statusCode: 502,
                code: "CLOUD_MODEL_UNAVAILABLE",
                failures: completion.failures,
              },
            )
          }
          return completion.text
        },
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : "生成失败"
      const statusCode =
        err && typeof err === "object" && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : 502
      const code =
        err && typeof err === "object" && "code" in err && typeof (err as { code: unknown }).code === "string"
          ? (err as { code: string }).code
          : "CLOUD_MODEL_UNAVAILABLE"
      const attempts =
        err && typeof err === "object" && "failures" in err && Array.isArray((err as { failures: unknown }).failures)
          ? (err as { failures: CopywritingProviderFailure[] }).failures
          : undefined
      return NextResponse.json(
        { error: message, detail: { code, message, ...(attempts ? { attempts } : {}) } },
        { status: statusCode },
      )
    }

    const completedMatrix = {
      ...matrix,
      generatedAt: new Date().toISOString(),
    }
    const updated = await saveProjectMatrix(projectId, cookieHeader, {
      matrix: completedMatrix,
      platforms,
      provider: "cloud-managed",
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
  return withAuth(async (innerReq, { cookieHeader }) =>
    handleGenerate(innerReq, cookieHeader, id),
  )(req)
}
