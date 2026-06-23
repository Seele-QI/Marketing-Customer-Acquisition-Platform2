import { NextResponse } from "next/server"

import { deepseekChatCompletion } from "@/lib/deepseek-chat"

type Body = {
  messages?: { role: string; content: string }[]
  stageHint?: string
}

/**
 * 身份定位 ·「产品档案」对话：与「人设 / AI对话」一致，走 DeepSeek Chat Completions（DEEPSEEK_API_KEY）。
 * 若需恢复火山方舟豆包，可再单独接 POSITIONING_PRODUCT_* 环境变量。
 */
export async function POST(request: Request) {
  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  const raw = Array.isArray(body.messages) ? body.messages : []
  const messages = raw
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: String(m.content ?? "").trim().slice(0, 24_000),
    }))
    .filter((m) => m.content.length > 0)

  if (messages.length === 0) {
    return NextResponse.json({ detail: "缺少有效对话内容" }, { status: 400 })
  }

  const stageHint = typeof body.stageHint === "string" ? body.stageHint.trim().slice(0, 200) : ""

  const systemLines = [
    "你是「产品与商业交付」档案顾问，帮助用户梳理核心交付物、产品线、定价与交付流程。",
    "回复简洁、可执行：可用条目列出交付清单、里程碑或套餐结构；避免空话。",
    stageHint ? `用户当前自评阶段：${stageHint}（请结合该阶段给出产品与变现侧建议）。` : "",
  ].filter(Boolean)

  const result = await deepseekChatCompletion(
    [{ role: "system", content: systemLines.join("\n") }, ...messages],
    120_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({ reply: result.text.trim() })
}
