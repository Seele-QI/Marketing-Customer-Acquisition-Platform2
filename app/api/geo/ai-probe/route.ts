import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import { isSonettoLlmProvider, type LlmProviderId } from "@/lib/geo/llm/router"
import { runAiVisibilityProbe } from "@/lib/geo/retrieval/adapters/ai-probe"

export const runtime = "nodejs"
export const maxDuration = 120

const VALID_PROVIDERS = new Set<LlmProviderId>([
  "deepseek",
  "doubao",
  "kimi",
  "gpt",
  "claude",
  "gemini",
])

export const POST = withAuth(async (req, { userId, cookieHeader }) => {
  try {
    const body = (await req.json()) as {
      topic?: string
      brand?: string
      prompts?: string[]
      modelSkillId?: string | null
      enterpriseSnapshot?: string | null
      provider?: string
    }

    const topic = String(body.topic ?? "").trim()
    if (!topic) {
      return NextResponse.json({ error: "请提供探测主题 topic" }, { status: 400 })
    }

    const provider = String(body.provider ?? "deepseek") as LlmProviderId
    if (!VALID_PROVIDERS.has(provider)) {
      return NextResponse.json({ error: "不支持的模型 provider" }, { status: 400 })
    }

    const data = await runAiVisibilityProbe({
      topic,
      brand: body.brand,
      prompts: body.prompts,
      modelSkillId: body.modelSkillId,
      enterpriseSnapshot: body.enterpriseSnapshot,
      provider,
      billing: isSonettoLlmProvider(provider)
        ? { userId, cookieHeader, refIdPrefix: "geo-probe" }
        : undefined,
    })
    return NextResponse.json(data)
  } catch (err) {
    const message = err instanceof Error ? err.message : "AI 探测失败"
    const statusCode =
      err && typeof err === "object" && "statusCode" in err
        ? (err as { statusCode: number }).statusCode
        : 500
    return NextResponse.json({ error: message }, { status: statusCode })
  }
})
