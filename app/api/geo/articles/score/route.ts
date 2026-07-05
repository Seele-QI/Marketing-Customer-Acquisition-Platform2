import { NextResponse } from "next/server"

import { withAuth } from "@/lib/api/with-auth"
import {
  buildArticleScoreSystemPrompt,
  buildArticleScoreUserPrompt,
} from "@/lib/geo/article-score-prompt"
import { completeText, type LlmProviderId } from "@/lib/geo/llm/router"
import type { GeoScores } from "@/lib/geo/geo-scores"

export const runtime = "nodejs"
export const maxDuration = 60

const VALID_PROVIDERS = new Set<LlmProviderId>([
  "deepseek",
  "doubao",
  "kimi",
  "gpt",
  "claude",
  "gemini",
])

function extractJSON(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1]!.trim()
  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1)
  }
  return text
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, Math.round(n)))
}

function parseScores(raw: unknown): GeoScores | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  return {
    semanticClarity: clampScore(o.semanticClarity),
    conversationalTone: clampScore(o.conversationalTone),
    evidenceDensity: clampScore(o.evidenceDensity),
    structuredFaq: clampScore(o.structuredFaq),
  }
}

async function handleScore(
  req: Request,
  cookieHeader: string,
  userId: number,
): Promise<Response> {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "请求体须为 JSON" }, { status: 400 })
  }

  const provider = String(body.provider ?? "deepseek") as LlmProviderId
  if (!VALID_PROVIDERS.has(provider)) {
    return NextResponse.json({ error: "不支持的 AI 引擎" }, { status: 400 })
  }

  const markdown = String(body.markdown ?? "").trim()
  if (!markdown) {
    return NextResponse.json({ error: "缺少待评分正文" }, { status: 400 })
  }

  const modelSkillId =
    body.modelSkillId === null || body.modelSkillId === undefined
      ? null
      : String(body.modelSkillId)
  const viralSkillIds = Array.isArray(body.viralSkillIds)
    ? body.viralSkillIds.map(String)
    : []
  const enterpriseSnapshot =
    body.enterpriseSnapshot != null ? String(body.enterpriseSnapshot) : null
  const platformId =
    body.platformId != null && body.platformId !== ""
      ? String(body.platformId)
      : null

  try {
    const text = await completeText({
      provider,
      system: buildArticleScoreSystemPrompt(),
      user: buildArticleScoreUserPrompt(markdown, {
        modelSkillId,
        viralSkillIds,
        enterpriseSnapshot,
        platformId,
      }),
      maxTokens: 1024,
    })

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(extractJSON(text)) as Record<string, unknown>
    } catch {
      return NextResponse.json(
        { error: "AI 返回格式异常，未包含有效 JSON" },
        { status: 502 },
      )
    }

    const scores = parseScores(parsed)
    if (!scores) {
      return NextResponse.json({ error: "AI 未返回有效评分" }, { status: 502 })
    }

    const summary =
      typeof parsed.summary === "string" ? parsed.summary.trim().slice(0, 200) : undefined

    return NextResponse.json({ scores, summary })
  } catch (err) {
    const message = err instanceof Error ? err.message : "评分失败"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  return withAuth(async (innerReq, { userId, cookieHeader }) =>
    handleScore(innerReq, cookieHeader, userId),
  )(req)
}
