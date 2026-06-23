import { NextResponse } from "next/server"

import { deepseekChatCompletion } from "@/lib/deepseek-chat"

type Body = {
  messages?: { role: string; content: string }[]
  stageHint?: string
}

/**
 * 身份定位页 DeepSeek 对话（密钥仅服务端 DEEPSEEK_API_KEY）
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
    "你是「身份定位与超级个体」成长顾问，擅长人设梳理、内容矩阵与变现路径。",
    "回复简洁、可执行：必要时用短段落与条目；避免空话套话。",
    stageHint ? `用户当前自评阶段：${stageHint}（请在该侧重点下给建议）。` : "",
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
