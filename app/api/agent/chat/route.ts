import crypto from "node:crypto"
import { NextResponse } from "next/server"

import {
  XHS_AGENT_SYSTEM,
  deepseekChatCompletion,
} from "@/lib/deepseek-chat"
import { chargeCredit, withAuth } from "@/lib/api/with-auth"

/**
 * 通用对话：固定「小红书爆款制造机」system；不再允许客户端覆盖 system_instruction。
 */
export const POST = withAuth(async (request, { userId, cookieHeader }) => {
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
  if (prompt.length > 4000) {
    return NextResponse.json({ detail: "prompt 超过 4000 字" }, { status: 400 })
  }

  const refId = `agent:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeCredit({ cookieHeader, scene: "ai_chat", refId })
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    if (msg === "INSUFFICIENT_CREDIT") {
      return NextResponse.json(
        { detail: { code: "INSUFFICIENT_CREDIT", message: "积分不足" } },
        { status: 402 },
      )
    }
    return NextResponse.json(
      { detail: { code: "CHARGE_FAILED", message: "扣费失败" } },
      { status: 500 },
    )
  }

  const result = await deepseekChatCompletion(
    [
      { role: "system", content: XHS_AGENT_SYSTEM },
      { role: "user", content: prompt.trim() },
    ],
    125_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({ status: "success", reply: result.text })
})
