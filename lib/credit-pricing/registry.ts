/**
 * 积分定价注册表 — 与 lib/credit_pricing.py 数值严格一致。
 * 业务路由只传 billingKey + params；cost 由此解析。
 */

import { isSonettoModelId } from "@/lib/llm/model-registry"

export type ModelTier = "economy" | "premium"

export type GeoProviderId =
  | "deepseek"
  | "doubao"
  | "kimi"
  | "gpt"
  | "claude"
  | "gemini"

/** 固定价 scene（与 SCENE_COST_TABLE 对齐） */
export const FIXED_SCENE_COSTS = {
  ai_chat: 3,
  ai_rewrite: 3,
  ai_ip_positioning: 20,
  ai_ark_image: 20,
  geo_skill_gen: 25,
  geo_matrix_gen: 25,
  geo_research: 5,
  geo_authority_link: 5,
  dh_v2_plan_script: 20,
  video_image_to_video: 40,
  video_mashup: 50,
  video_clone_voice: 10,
  video_creation: 250,
  promo_storyboard: 50,
  copy_extract: 5,
  dh_v2_video_retry: 450,
} as const

export const COPYWRITING_LLM_ECONOMY = 2
export const COPYWRITING_LLM_PREMIUM = 15
export const GEO_ARTICLE_ECONOMY = 10
export const GEO_ARTICLE_PREMIUM = 30

/** Seedance / 宣传视频 / dh-v2 — 每 15 秒一段 */
export const SEEDANCE_SEGMENT_COST = 450

export const VIDEO_SEGMENT_COST_BY_PROVIDER: Record<string, number> = {
  seedance: SEEDANCE_SEGMENT_COST,
  default: SEEDANCE_SEGMENT_COST,
}

export type BillingKey =
  | "copywriting.llm_call"
  | "geo.article"
  | "video.dh_v2_segment"
  | "video.dh_v2_retry"
  | "video.promo_segment"

export type BillingParams = {
  modelId?: string
  model_id?: string
  provider?: string
  segmentCount?: number
  segment_count?: number
  duration?: number
}

export type BillingResult = {
  scene: string
  cost: number
  note: string
}

const PREMIUM_GEO = new Set<GeoProviderId>(["gpt", "claude"])

export function classifyGeoProvider(provider: string): ModelTier {
  const p = (provider || "deepseek").trim().toLowerCase()
  return PREMIUM_GEO.has(p as GeoProviderId) ? "premium" : "economy"
}

export function classifyModel(modelId: string): ModelTier {
  const mid = (modelId || "").trim()
  if (!mid) return "economy"
  if (isSonettoModelId(mid)) return "premium"
  const lower = mid.toLowerCase()
  if (lower.startsWith("doubao") || lower.startsWith("deepseek")) return "economy"
  return "economy"
}

export function segmentCostForProvider(provider: string): number {
  const key = (provider || "default").trim().toLowerCase()
  return VIDEO_SEGMENT_COST_BY_PROVIDER[key] ?? VIDEO_SEGMENT_COST_BY_PROVIDER.default
}

export function sceneCost(scene: string): number {
  return FIXED_SCENE_COSTS[scene as keyof typeof FIXED_SCENE_COSTS] ?? 0
}

export function resolveBillingCost(
  billingKey: BillingKey,
  params: BillingParams = {},
): BillingResult {
  switch (billingKey) {
    case "copywriting.llm_call": {
      const modelId = String(params.modelId ?? params.model_id ?? "")
      const tier = classifyModel(modelId)
      const cost = tier === "premium" ? COPYWRITING_LLM_PREMIUM : COPYWRITING_LLM_ECONOMY
      return { scene: "copywriting_llm", cost, note: `文案创作 LLM (${tier})` }
    }
    case "geo.article": {
      const provider = String(params.provider ?? "deepseek")
      const tier = classifyGeoProvider(provider)
      const cost = tier === "premium" ? GEO_ARTICLE_PREMIUM : GEO_ARTICLE_ECONOMY
      return { scene: "geo_article", cost, note: `GEO 文章 (${provider}/${tier})` }
    }
    case "video.dh_v2_segment": {
      const provider = String(params.provider ?? "seedance")
      const segmentCount = Math.max(1, Number(params.segmentCount ?? params.segment_count ?? 1))
      const unit = segmentCostForProvider(provider)
      return {
        scene: "dh_v2_video_segment",
        cost: unit * segmentCount,
        note: `dh-v2 视频 ${segmentCount} 段 (${provider})`,
      }
    }
    case "video.dh_v2_retry": {
      const provider = String(params.provider ?? "seedance")
      const unit = segmentCostForProvider(provider)
      return { scene: "dh_v2_video_retry", cost: unit, note: `dh-v2 重试单段 (${provider})` }
    }
    case "video.promo_segment": {
      const duration = Number(params.duration ?? 15)
      const segments = Math.max(1, Math.floor((duration + 14) / 15))
      const unit = VIDEO_SEGMENT_COST_BY_PROVIDER.default
      return {
        scene: "promo_video_segment",
        cost: segments * unit,
        note: `宣传视频 ${segments}×15s`,
      }
    }
    default:
      throw new Error(`不支持的 billing_key: ${billingKey}`)
  }
}
