import crypto from "node:crypto"
import { NextResponse } from "next/server"

import { runIpPositioningAnalysis } from "@/lib/ip-positioning-analyze"
import {
  normalizeIntake,
  validateIntake,
  type IpPositioningRequestBody,
} from "@/lib/ip-positioning-schema"
import { recordCost } from "@/lib/cost-tracker"
import { extractDocuments } from "@/lib/server/document-extract"
import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"
import { listCopywritingProviderCandidates } from "@/lib/llm/copywriting-router"

export const maxDuration = 120
export const runtime = "nodejs"

export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  const startTime = Date.now()

  let body: IpPositioningRequestBody
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const intake = normalizeIntake(body)
  const validationError = validateIntake(intake)
  if (validationError) {
    return NextResponse.json({ detail: validationError }, { status: 400 })
  }

  const cloudProviders = listCopywritingProviderCandidates({ hasImages: false }).filter(
    (candidate) => candidate.source === "cloud",
  )
  if (cloudProviders.length === 0) {
    const message = "云端模型配置尚未同步，请稍后重试"
    return NextResponse.json(
      { detail: { code: "CLOUD_MODEL_NOT_READY", message } },
      { status: 503 },
    )
  }

  const documents = await extractDocuments(body.files)

  const refId = `ip-positioning:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeCredit({ cookieHeader, scene: "ai_ip_positioning", refId })
  } catch (e) {
    return chargeErrorResponse(e)
  }

  const analysis = await runIpPositioningAnalysis({
    providers: cloudProviders,
    intake,
    documents,
  })

  if (!analysis.ok) {
    recordCost({
      feature: "ip-positioning",
      model: "cloud",
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      error: analysis.detail,
    })
    return NextResponse.json(
      {
        detail: {
          code: analysis.code,
          message: analysis.detail,
          ...(analysis.failures ? { attempts: analysis.failures } : {}),
        },
      },
      { status: analysis.status },
    )
  }

  recordCost({
    feature: "ip-positioning",
    model: analysis.meta.model,
    promptTokens: analysis.meta.promptTokens,
    completionTokens: analysis.meta.completionTokens,
    durationMs: analysis.meta.durationMs,
    success: true,
  })

  return NextResponse.json({
    report: analysis.report,
    documents: documents.map((d) => ({
      name: d.name,
      truncated: d.truncated,
      hasText: d.text.length > 0,
      error: d.error,
    })),
    _meta: analysis.meta,
  })
})
