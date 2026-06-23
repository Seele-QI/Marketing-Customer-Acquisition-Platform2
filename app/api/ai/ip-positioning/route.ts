import { NextResponse } from "next/server"
import { deepseekChatCompletion } from "@/lib/deepseek-chat"
import {
  IP_POSITIONING_SYSTEM,
  buildPositioningUserMessage,
} from "@/lib/prompts/ip-positioning-prompts"
import { recordCost } from "@/lib/cost-tracker"
import { readServerEnv } from "@/lib/server-env"

export const maxDuration = 120

type TrackJSON = {
  name: string
  matchScore: number
  tagline: string
  why: string
  contentPillars: string[]
  audience: string
  platforms: string[]
  monetization: string
  difficulty: "low" | "medium" | "high"
  growthPotential: "low" | "medium" | "high"
}

type AnalysisResult = {
  summary: string
  tracks: TrackJSON[]
  quickStart: string
}

type Body = {
  stage?: string | null
  stageHint?: string
  industry?: string
  background?: string
  skills?: string
  targetPlatforms?: string
  monetizationGoal?: string
  extraInfo?: string
  /** 上传文件列表（base64），暂不传给 DeepSeek（超出纯文本模型能力） */
  files?: { name: string; type: string; size: number }[]
}

function clamp(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) : s
}

/** 从 AI 回复中提取 JSON（兼容 markdown code block 包裹） */
function extractJSON(text: string): string {
  // 尝试匹配 ```json ... ``` 或 ``` ... ```
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1]!.trim()

  // 尝试匹配 { ... } 最外层
  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return text.slice(firstBrace, lastBrace + 1)
  }

  return text
}

function validateTrack(t: unknown): t is TrackJSON {
  if (!t || typeof t !== "object") return false
  const o = t as Record<string, unknown>
  return (
    typeof o.name === "string" &&
    typeof o.matchScore === "number" &&
    typeof o.tagline === "string" &&
    typeof o.why === "string" &&
    Array.isArray(o.contentPillars) &&
    typeof o.audience === "string" &&
    Array.isArray(o.platforms) &&
    typeof o.monetization === "string" &&
    typeof o.difficulty === "string" &&
    typeof o.growthPotential === "string"
  )
}

export async function POST(request: Request) {
  const startTime = Date.now()
  const model = readServerEnv("DEEPSEEK_CHAT_MODEL") || "deepseek-chat"

  let body: Body
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ detail: "请求体须为 JSON" }, { status: 400 })
  }

  // Validate required fields
  const industry = clamp((body.industry ?? "").trim(), 200)
  const background = clamp((body.background ?? "").trim(), 2000)
  const skills = clamp((body.skills ?? "").trim(), 1000)

  if (!industry || !background || !skills) {
    return NextResponse.json(
      { detail: "缺少必填信息：行业、核心背景、已有技能为必填项" },
      { status: 400 },
    )
  }

  const userMessage = buildPositioningUserMessage({
    stage: body.stage ?? null,
    stageHint: clamp(body.stageHint ?? "", 300),
    industry,
    background,
    skills,
    targetPlatforms: clamp(body.targetPlatforms ?? "", 200),
    monetizationGoal: clamp(body.monetizationGoal ?? "", 200),
    extraInfo: clamp(body.extraInfo ?? "", 1000),
  })

  const messages = [
    { role: "system" as const, content: IP_POSITIONING_SYSTEM },
    { role: "user" as const, content: userMessage },
  ]

  // Count prompt tokens (rough estimate: ~2 chars per token for Chinese)
  const systemChars = IP_POSITIONING_SYSTEM.length
  const userChars = userMessage.length
  const estimatedPromptTokens = Math.ceil((systemChars + userChars) / 2)

  const result = await deepseekChatCompletion(messages, 120_000)
  const durationMs = Date.now() - startTime

  if (!result.ok) {
    recordCost({
      feature: "ip-positioning",
      model,
      promptTokens: estimatedPromptTokens,
      completionTokens: 0,
      durationMs,
      success: false,
      error: result.detail,
    })
    return NextResponse.json({ detail: result.detail }, { status: result.status })
  }

  // Parse AI response
  const jsonStr = extractJSON(result.text)
  let analysis: AnalysisResult
  try {
    analysis = JSON.parse(jsonStr) as AnalysisResult
  } catch {
    recordCost({
      feature: "ip-positioning",
      model,
      promptTokens: estimatedPromptTokens,
      completionTokens: Math.ceil(result.text.length / 2),
      durationMs,
      success: false,
      error: "AI 返回格式异常，未包含有效 JSON",
    })
    return NextResponse.json(
      { detail: "AI 返回格式异常，请重试", rawText: result.text.slice(0, 500) },
      { status: 502 },
    )
  }

  // Validate tracks
  if (!Array.isArray(analysis.tracks)) {
    analysis.tracks = []
  }
  analysis.tracks = analysis.tracks.filter(validateTrack)

  if (analysis.tracks.length === 0) {
    recordCost({
      feature: "ip-positioning",
      model,
      promptTokens: estimatedPromptTokens,
      completionTokens: Math.ceil(result.text.length / 2),
      durationMs,
      success: false,
      error: "AI 未返回有效的赛道推荐",
    })
    return NextResponse.json(
      { detail: "AI 未返回有效的赛道推荐，请重试", rawText: result.text.slice(0, 500) },
      { status: 502 },
    )
  }

  // Estimate completion tokens
  const estimatedCompletionTokens = Math.ceil(result.text.length / 2)

  recordCost({
    feature: "ip-positioning",
    model,
    promptTokens: estimatedPromptTokens,
    completionTokens: estimatedCompletionTokens,
    durationMs,
    success: true,
  })

  return NextResponse.json({
    summary: analysis.summary ?? "",
    tracks: analysis.tracks,
    quickStart: analysis.quickStart ?? "",
    _meta: {
      model,
      durationMs,
      estimatedPromptTokens,
      estimatedCompletionTokens,
      estimatedCostUSD: (
        (estimatedPromptTokens / 1_000_000) * 0.14 +
        (estimatedCompletionTokens / 1_000_000) * 0.28
      ).toFixed(6),
    },
  })
}
