import { NextResponse } from "next/server"
import { deepseekChatCompletion } from "@/lib/deepseek-chat"
import { IP_DIAGNOSIS_SYSTEM, getStageSupplement } from "@/lib/prompts/ip-positioning-prompts"

export const maxDuration = 120

type Body = {
  platform?: string
  accountDescription?: string
  goals?: string
  stageTitle?: string
  stageHint?: string
  /** 附加上下文：竞品分析 + 爆款分析结果，供综合诊断参考 */
  extraContext?: string
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const platform = typeof body.platform === "string" ? body.platform.trim() : "抖音"
  const accountDescription =
    typeof body.accountDescription === "string" ? body.accountDescription.trim() : ""
  const goals = typeof body.goals === "string" ? body.goals.trim() : ""
  const stageTitle = typeof body.stageTitle === "string" ? body.stageTitle.trim() : ""
  const stageHint = typeof body.stageHint === "string" ? body.stageHint.trim() : ""
  const extraContext = typeof body.extraContext === "string" ? body.extraContext.trim().slice(0, 16000) : ""

  if (!accountDescription) {
    return NextResponse.json(
      { detail: "请描述您的账号情况（定位、内容方向、当前阶段等）", analysis: null },
      { status: 400 },
    )
  }

  const stageSupp = getStageSupplement(stageTitle, stageHint)

  const userMessage = [
    `## 账号信息`,
    `平台：${platform}`,
    `账号描述：${accountDescription}`,
    goals ? `目标：${goals}` : "",
    extraContext ? `\n## 补充上下文（已完成的竞品/爆款分析摘要）\n${extraContext}` : "",
    stageSupp ? `\n${stageSupp}` : "",
    "\n请按结构化格式输出完整的账号诊断报告。",
  ]
    .filter(Boolean)
    .join("\n")

  const result = await deepseekChatCompletion(
    [
      { role: "system", content: IP_DIAGNOSIS_SYSTEM + stageSupp },
      { role: "user", content: userMessage },
    ],
    120_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({
    analysis: result.text.trim(),
    platform,
  })
}
