import crypto from "node:crypto"
import { NextResponse } from "next/server"

import {
  DEFAULT_REWRITE_SYSTEM,
  deepseekChatCompletion,
} from "@/lib/deepseek-chat"
import { chargeCredit, withAuth } from "@/lib/api/with-auth"

/**
 * AI 爆改：Next 服务端直连 DeepSeek。固定 system prompt，不再接受客户端覆盖。
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
  const originalText = rec.original_text
  if (typeof originalText !== "string" || !originalText.trim()) {
    return NextResponse.json({ detail: "缺少 original_text" }, { status: 400 })
  }
  if (originalText.length > 8000) {
    return NextResponse.json({ detail: "original_text 超过 8000 字" }, { status: 400 })
  }

  const refId = `rewrite:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeCredit({ cookieHeader, scene: "ai_rewrite", refId })
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
      { role: "system", content: DEFAULT_REWRITE_SYSTEM },
      { role: "user", content: originalText.trim() },
    ],
    120_000,
  )

  if (!result.ok) {
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  return NextResponse.json({ status: "success", rewritten_text: result.text })
})
