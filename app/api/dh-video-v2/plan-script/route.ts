import crypto from "node:crypto"

import { NextResponse } from "next/server"

import {
  chargeCredit,
  chargeErrorResponse,
  getCreditBalance,
  withAuth,
} from "@/lib/api/with-auth"
import { sceneCost } from "@/lib/credit-constants"
import {
  generateDhV2PlanWithLlm,
  isLlmPlanAvailable,
} from "@/lib/dh-video-v2/plan-script-ai"
import type { DhV2PlanScriptRequest } from "@/lib/dh-video-v2/types"
import { withActivePlanRequest } from "@/lib/dh-video-v2/plan-runtime-state"

export const runtime = "nodejs"

export const POST = withAuth(async (req, { userId, cookieHeader }) => {
  let body: DhV2PlanScriptRequest
  try {
    body = (await req.json()) as DhV2PlanScriptRequest
  } catch {
    return NextResponse.json({ detail: "无效请求体" }, { status: 400 })
  }

  const script = (body.script || "").trim()
  if (!script) {
    return NextResponse.json({ detail: "请填写口播文案" }, { status: 400 })
  }

  if (!isLlmPlanAvailable()) {
    return NextResponse.json(
      {
        detail: {
          code: "PLAN_LLM_NOT_CONFIGURED",
          message: "云端未给分镜功能下发可用模型，请在模型配置中心绑定并启用模型。",
        },
      },
      { status: 503 },
    )
  }

  const planCost = sceneCost("dh_v2_plan_script")
  try {
    const balance = await getCreditBalance(cookieHeader)
    if (balance < planCost) {
      return NextResponse.json(
        { detail: { code: "INSUFFICIENT_CREDIT", message: "积分不足" } },
        { status: 402 },
      )
    }
  } catch {
    // 余额查询失败不阻断（扣费时仍会校验）
  }

  const ai = await withActivePlanRequest(() =>
    generateDhV2PlanWithLlm({
      script,
      creative_idea: body.creative_idea || "",
      images_base64: body.images_base64,
      has_audio_ref: body.has_audio_ref,
    }),
  )

  if (!ai.ok) {
    if (ai.status === 503) {
      return NextResponse.json(
        {
          detail: {
            code: "PLAN_LLM_NOT_CONFIGURED",
            message: ai.detail,
          },
        },
        { status: 503 },
      )
    }
    if (ai.status >= 500) {
      return NextResponse.json(
        {
          detail: {
            code: "PLAN_LLM_ALL_FAILED",
            message: ai.detail,
          },
        },
        { status: ai.status },
      )
    }
    return NextResponse.json({ detail: ai.detail }, { status: ai.status })
  }

  const refId = `dh-v2-plan:${userId}:${crypto.randomUUID()}`
  try {
    await chargeCredit({
      cookieHeader,
      scene: "dh_v2_plan_script",
      refId,
      businessTask: {
        businessTaskId: body.business_task_id,
        businessType: "video_digital_human",
        billingStage: "script",
      },
    })
  } catch (e) {
    return chargeErrorResponse(e)
  }

  return NextResponse.json({
    plan: { ...ai.plan, plan_source: ai.plan_source },
  })
})
