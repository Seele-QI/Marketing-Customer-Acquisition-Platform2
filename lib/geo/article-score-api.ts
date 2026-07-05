import type { GeoScores } from "@/lib/geo/geo-scores"
import type { LlmProviderId } from "@/lib/geo/llm/router"

export type ScoreArticleRequest = {
  provider: LlmProviderId
  markdown: string
  modelSkillId?: string | null
  viralSkillIds?: string[]
  enterpriseSnapshot?: string | null
  platformId?: string | null
}

export type ScoreArticleResponse = {
  scores: GeoScores
  summary?: string
}

export async function scoreArticle(
  body: ScoreArticleRequest,
): Promise<ScoreArticleResponse> {
  const resp = await fetch("/api/geo/articles/score", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  })

  const data = (await resp.json()) as ScoreArticleResponse & { error?: string }
  if (!resp.ok) {
    throw new Error(data.error ?? `评分失败 (${resp.status})`)
  }
  return data
}
