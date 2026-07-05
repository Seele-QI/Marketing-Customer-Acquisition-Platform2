import crypto from "node:crypto"
import { NextResponse } from "next/server"

import {
  DEFAULT_REWRITE_SYSTEM,
  deepseekChatCompletion,
} from "@/lib/deepseek-chat"
import { chargeBillingEvent } from "@/lib/api/charge-billing"
import { chargeErrorResponse, withAuth } from "@/lib/api/with-auth"

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

  const refId = `rewrite:${userId}:${crypto.randomBytes(8).toString("hex")}`
  try {
    await chargeBillingEvent({
      cookieHeader,
      billingKey: "copywriting.llm_call",
      params: { modelId: "deepseek-chat" },
      refId,
    })
  } catch (e) {
    return chargeErrorResponse(e)
  }

  return NextResponse.json({ rewritten_text: result.text })
})
