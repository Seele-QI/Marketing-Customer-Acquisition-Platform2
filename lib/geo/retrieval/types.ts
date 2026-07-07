export type PlatformId = "zhihu" | "xiaohongshu" | "tieba" | "trends"

export type RetrievalItem = {
  platform: PlatformId
  title: string
  url?: string
  snippet: string
  notes?: string
  score?: number
}

export type PlatformStatus = {
  platform: PlatformId
  status: "ok" | "skipped" | "error" | "unconfigured"
  message?: string
  count: number
}

export type ResearchResponse = {
  keyword: string
  partial: boolean
  items: RetrievalItem[]
  platforms: PlatformStatus[]
}

export type AiProbeGap = {
  prompt: string
  missingTopics: string[]
  suggestedParagraph: string
}

export type AiProbeResponse = {
  topic: string
  brand?: string
  simulated: true
  engine: string
  mentionLikelihood: "low" | "medium" | "high"
  citedSources: string[]
  gaps: AiProbeGap[]
  disclaimer: string
}
