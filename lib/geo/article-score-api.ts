import type { GeoScores } from "@/lib/geo/geo-scores"

export type ScoreArticleRequest = {
  markdown: string
  projectId: string
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
