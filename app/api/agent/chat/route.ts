import { NextResponse } from "next/server"

import {
  XHS_AGENT_SYSTEM,
  deepseekChatCompletion,
} from "@/lib/deepseek-chat"

/**
 * 通用对话：默认「小红书爆款制造机」system；可传 system_instruction 覆盖（如热搜弹窗爆改）。
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
  const prompt = rec.prompt
  if (typeof prompt !== "string" || !prompt.trim()) {
    return NextResponse.json({ detail: "缺少 prompt" }, { status: 400 })
  }

  const customSystem = rec.system_instruction
  const systemContent =
    typeof customSystem === "string" && customSystem.trim()
      ? customSystem.trim()
      : XHS_AGENT_SYSTEM

  const result = await deepseekChatCompletion(
    [
      { role: "system", content: systemContent },
      { role: "user", content: prompt.trim() },
    ],
    125_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({ status: "success", reply: result.text })
}
