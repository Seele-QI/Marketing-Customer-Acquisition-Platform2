import crypto from "node:crypto"
import { NextResponse } from "next/server"
import { deepseekChatCompletion } from "@/lib/deepseek-chat"
import { IP_COMPETITOR_SCAN_SYSTEM, getStageSupplement } from "@/lib/prompts/ip-positioning-prompts"
import { chargeCredit, chargeErrorResponse, withAuth } from "@/lib/api/with-auth"

export const maxDuration = 120

type Body = {
  competitorHandles?: string[]
  platform?: string
  myPositioning?: string
  stageTitle?: string
  stageHint?: string
}

export const POST = withAuth(async (request, { userId, cookieHeader }) => {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const handles = Array.isArray(body.competitorHandles)
    ? body.competitorHandles.filter((h) => typeof h === "string" && h.trim())
    : []
  const platform = typeof body.platform === "string" ? body.platform.trim() : "抖音"
  const myPositioning = typeof body.myPositioning === "string" ? body.myPositioning.trim() : ""
  const stageTitle = typeof body.stageTitle === "string" ? body.stageTitle.trim() : ""
  const stageHint = typeof body.stageHint === "string" ? body.stageHint.trim() : ""

  if (handles.length === 0) {
    return NextResponse.json(
      { detail: "请提供至少一个竞品账号名称", analysis: null },
      { status: 400 },
    )
  }

  const stageSupp = getStageSupplement(stageTitle, stageHint)

  const userMessage = [
    `请分析以下竞品账号（平台：${platform}）：`,
    handles.map((h, i) => `${i + 1}. ${h}`).join("\n"),
    myPositioning ? `\n我的定位：${myPositioning}` : "",
    stageSupp ? `\n${stageSupp}` : "",
    "\n请按结构化格式输出竞品分析报告。",
  ]
    .filter(Boolean)
    .join("\n")

  const refId = `ip-competitor:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeCredit({ cookieHeader, scene: "ai_ip_positioning", refId })
  } catch (e) {
    return chargeErrorResponse(e)
  }

  const result = await deepseekChatCompletion(
    [
      { role: "system", content: IP_COMPETITOR_SCAN_SYSTEM + stageSupp },
      { role: "user", content: userMessage },
    ],
    120_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({
    analysis: result.text.trim(),
    competitors: handles,
    platform,
  })
})
