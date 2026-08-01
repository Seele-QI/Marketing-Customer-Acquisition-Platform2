import type { GeoScores } from "@/lib/geo/geo-scores"

export type ArticleScorePayload = {
  scores: GeoScores
  summary?: string
}

const SCORE_KEYS = [
  "semanticClarity",
  "conversationalTone",
  "evidenceDensity",
  "structuredFaq",
] as const

function extractJson(text: string): string {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (codeBlock) return codeBlock[1]!.trim()
  const firstBrace = text.indexOf("{")
  const lastBrace = text.lastIndexOf("}")
  return firstBrace >= 0 && lastBrace > firstBrace
    ? text.slice(firstBrace, lastBrace + 1)
    : text
}

export function parseArticleScorePayload(text: string): ArticleScorePayload | null {
  try {
    const raw = JSON.parse(extractJson(text)) as unknown
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
    const value = raw as Record<string, unknown>
    const parsed = {} as Record<(typeof SCORE_KEYS)[number], number>
    for (const key of SCORE_KEYS) {
      if (!(key in value)) return null
      const score = typeof value[key] === "number" ? value[key] : Number(value[key])
      if (!Number.isFinite(score)) return null
      parsed[key] = Math.max(0, Math.min(100, Math.round(score)))
    }
    const summary = typeof value.summary === "string"
      ? value.summary.trim().slice(0, 200) || undefined
      : undefined
    return { scores: parsed as GeoScores, summary }
  } catch {
    return null
  }
}
