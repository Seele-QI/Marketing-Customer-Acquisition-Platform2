import crypto from "node:crypto"
import { NextResponse } from "next/server"

import { runIpPositioningAnalysis } from "@/lib/ip-positioning-analyze"
import {
  normalizeIntake,
  resolveIpPositioningModel,
  validateIntake,
  type IpPositioningRequestBody,
} from "@/lib/ip-positioning-schema"
import { recordCost } from "@/lib/cost-tracker"
import { extractDocuments } from "@/lib/server/document-extract"
import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"

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

  const { modelId, error: modelError } = resolveIpPositioningModel(body.modelId)
  if (modelError) {
    return NextResponse.json({ detail: modelError }, { status: 503 })
  }

  const documents = await extractDocuments(body.files)

  const refId = `ip-positioning:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeCredit({ cookieHeader, scene: "ai_ip_positioning", refId })
  } catch (e) {
    return chargeErrorResponse(e)
  }

  const analysis = await runIpPositioningAnalysis({
    modelId,
    intake,
    documents,
  })

  if (!analysis.ok) {
    recordCost({
      feature: "ip-positioning",
      model: modelId,
      promptTokens: 0,
      completionTokens: 0,
      durationMs: Date.now() - startTime,
      success: false,
      error: analysis.detail,
    })
    return NextResponse.json(
      { detail: analysis.detail, rawText: analysis.rawText },
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
