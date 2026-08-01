/**
 * 云端功能目录同步（FEATURE_CATALOG_JSON_B64）。
 * 供定价展示与功能路由试点读取；扣费仍以云端 consume 为准。
 */

import { readServerEnv } from "@/lib/server-env"
import { loadSyncedProviders, type SyncedProvider } from "@/lib/llm/synced-providers"

export type SyncedFeature = {
  feature_id: string
  label?: string
  category?: string
  enabled: boolean
  billing_mode: string
  scene: string
  billing_key: string
  unit_cost: number | null
  economy_cost: number | null
  premium_cost: number | null
  segment_unit_cost: number | null
  price_version: number
  provider_ids: number[]
}

let _cacheRaw = ""
let _cacheParsed: SyncedFeature[] | null = null

function asNum(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function loadSyncedFeatures(): SyncedFeature[] {
  const raw = readServerEnv("FEATURE_CATALOG_JSON_B64")
  if (!raw) {
    _cacheRaw = ""
    _cacheParsed = null
    return []
  }
  if (raw === _cacheRaw && _cacheParsed) return _cacheParsed
  try {
    const json = Buffer.from(raw, "base64").toString("utf8")
    const data = JSON.parse(json) as { features?: unknown }
    const list = Array.isArray(data.features) ? data.features : []
    const out: SyncedFeature[] = []
    for (const item of list) {
      if (!item || typeof item !== "object") continue
      const f = item as Record<string, unknown>
      const feature_id = String(f.feature_id || "").trim()
      if (!feature_id) continue
      const provider_ids = Array.isArray(f.provider_ids)
        ? f.provider_ids.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0)
        : []
      out.push({
        feature_id,
        label: String(f.label || ""),
        category: String(f.category || ""),
        enabled: f.enabled !== false,
        billing_mode: String(f.billing_mode || "fixed"),
        scene: String(f.scene || ""),
        billing_key: String(f.billing_key || ""),
        unit_cost: asNum(f.unit_cost),
        economy_cost: asNum(f.economy_cost),
        premium_cost: asNum(f.premium_cost),
        segment_unit_cost: asNum(f.segment_unit_cost),
        price_version: Number(f.price_version) || 1,
        provider_ids,
      })
    }
    _cacheRaw = raw
    _cacheParsed = out
    return out
  } catch {
    return []
  }
}

export function getSyncedFeature(featureId: string): SyncedFeature | null {
  const id = (featureId || "").trim()
  if (!id) return null
  return loadSyncedFeatures().find((f) => f.feature_id === id) || null
}

export function getSyncedFeatureByScene(scene: string): SyncedFeature | null {
  const s = (scene || "").trim()
  if (!s) return null
  return loadSyncedFeatures().find((f) => f.enabled && f.scene === s) || null
}

export function getSyncedFeatureByBillingKey(billingKey: string): SyncedFeature | null {
  const k = (billingKey || "").trim()
  if (!k) return null
  return loadSyncedFeatures().find((f) => f.enabled && f.billing_key === k) || null
}

export function syncedSceneUnitCost(scene: string): number | null {
  const f = getSyncedFeatureByScene(scene)
  if (!f || f.unit_cost == null) return null
  return f.unit_cost
}

export function syncedTierCosts(scene: string): { economy: number; premium: number } | null {
  const f = getSyncedFeatureByScene(scene)
  if (!f || f.economy_cost == null || f.premium_cost == null) return null
  return { economy: f.economy_cost, premium: f.premium_cost }
}

export function syncedSegmentUnit(billingKey: string, scene = ""): number | null {
  const f = getSyncedFeatureByBillingKey(billingKey) || (scene ? getSyncedFeatureByScene(scene) : null)
  if (!f || f.segment_unit_cost == null) return null
  return f.segment_unit_cost
}

export type PlanLlmSlot = "sonetto_gpt" | "sonetto_claude" | "deepseek" | "doubao"

export function mapSyncedProviderToPlanSlot(p: SyncedProvider): PlanLlmSlot | null {
  const adapter = (p.adapter || "").trim()
  const model = (p.model || "").toLowerCase()
  if (adapter === "ark_chat") return "doubao"
  if (adapter === "openai_chat") {
    if (model.includes("claude")) return "sonetto_claude"
    if (model.includes("deepseek")) return "deepseek"
    if (model.includes("gpt") || model.includes("o1") || model.includes("o3")) return "sonetto_gpt"
    return "sonetto_gpt"
  }
  return null
}

/** 功能 video.dh.plan_script 的绑定 → 分镜 LLM 顺序；无绑定返回 null */
export function resolvePlanScriptProviderOrderFromFeatures(
  defaultOrder: PlanLlmSlot[],
): PlanLlmSlot[] | null {
  const feature = getSyncedFeature("video.dh.plan_script")
  if (!feature?.provider_ids?.length) return null
  const providers = loadSyncedProviders()
  const byId = new Map(providers.map((p) => [p.id, p]))
  const order: PlanLlmSlot[] = []
  for (const id of feature.provider_ids) {
    const p = byId.get(id)
    if (!p) continue
    const slot = mapSyncedProviderToPlanSlot(p)
    if (slot && !order.includes(slot)) order.push(slot)
  }
  if (!order.length) return null
  for (const d of defaultOrder) {
    if (!order.includes(d)) order.push(d)
  }
  return order
}
