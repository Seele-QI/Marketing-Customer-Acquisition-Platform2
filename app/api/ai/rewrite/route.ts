import { NextResponse } from "next/server"

import {
  DEFAULT_REWRITE_SYSTEM,
  deepseekChatCompletion,
} from "@/lib/deepseek-chat"

/**
 * AI 爆改：Next 服务端直连 DeepSeek（无需 FastAPI）。
 * 工作台聊天会附带 system_instruction；热搜弹窗仅传 original_text。
 */
export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ detail: "请求体无效" }, { status: 400 })
  }

  const rec = body as Record<string, unknown>
  const originalText = rec.original_text
  if (typeof originalText !== "string" || !originalText.trim()) {
    return NextResponse.json({ detail: "缺少 original_text" }, { status: 400 })
  }

  const customSystem = rec.system_instruction
  const systemContent =
    typeof customSystem === "string" && customSystem.trim()
      ? customSystem.trim()
      : DEFAULT_REWRITE_SYSTEM

  const result = await deepseekChatCompletion(
    [
      { role: "system", content: systemContent },
      { role: "user", content: originalText.trim() },
    ],
    120_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({ status: "success", rewritten_text: result.text })
}
