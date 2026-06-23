import { NextResponse } from "next/server"
import { deepseekChatCompletion } from "@/lib/deepseek-chat"
import { IP_VIRAL_ANALYSIS_SYSTEM, getStageSupplement } from "@/lib/prompts/ip-positioning-prompts"

export const maxDuration = 120

type Body = {
  contentUrls?: string[]
  contentTexts?: string[]
  niche?: string
  stageTitle?: string
  stageHint?: string
}

export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const urls = Array.isArray(body.contentUrls)
    ? body.contentUrls.filter((u) => typeof u === "string" && u.trim())
    : []
  const texts = Array.isArray(body.contentTexts)
    ? body.contentTexts.filter((t) => typeof t === "string" && t.trim())
    : []
  const niche = typeof body.niche === "string" ? body.niche.trim() : ""
  const stageTitle = typeof body.stageTitle === "string" ? body.stageTitle.trim() : ""
  const stageHint = typeof body.stageHint === "string" ? body.stageHint.trim() : ""

  if (urls.length === 0 && texts.length === 0) {
    return NextResponse.json(
      { detail: "请提供至少一条爆款内容链接或文字", analysis: null },
      { status: 400 },
    )
  }

  const stageSupp = getStageSupplement(stageTitle, stageHint)

  const contentParts: string[] = []
  if (urls.length > 0) {
    contentParts.push("## 爆款内容链接")
    urls.forEach((u, i) => contentParts.push(`${i + 1}. ${u}`))
  }
  if (texts.length > 0) {
    contentParts.push("## 爆款内容文字")
    texts.forEach((t, i) => contentParts.push(`### 内容 ${i + 1}\n${t.slice(0, 8000)}`))
  }

  const userMessage = [
    `请分析以下${niche ? `「${niche}」赛道的` : ""}爆款内容：`,
    ...contentParts,
    stageSupp ? `\n${stageSupp}` : "",
    "\n请按结构化格式输出爆款拆解报告。",
  ]
    .filter(Boolean)
    .join("\n")

  const result = await deepseekChatCompletion(
    [
      { role: "system", content: IP_VIRAL_ANALYSIS_SYSTEM + stageSupp },
      { role: "user", content: userMessage },
    ],
    120_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({
    analysis: result.text.trim(),
    sourceCount: urls.length + texts.length,
  })
}
