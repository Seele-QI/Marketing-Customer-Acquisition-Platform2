/**
 * 读取云端同步的结构化模型渠道（MODEL_PROVIDERS_JSON_B64）。
 * 优先于旧 NEWAPI_PRIMARY/SECONDARY/TERTIARY 三档限制。
 */

import { readServerEnv } from "@/lib/server-env"

export type SyncedProvider = {
  id: number
  kind: "llm" | "video" | string
  name: string
  adapter: string
  base_url: string
  api_key: string
  model: string
  extra?: Record<string, unknown>
  priority: number
}

let _cacheRaw = ""
let _cacheParsed: SyncedProvider[] | null = null

export function loadSyncedProviders(): SyncedProvider[] {
  const raw = readServerEnv("MODEL_PROVIDERS_JSON_B64")
  if (!raw) {
    _cacheRaw = ""
    _cacheParsed = null
    return []
  }
  if (raw === _cacheRaw && _cacheParsed) return _cacheParsed
  try {
    const json = Buffer.from(raw, "base64").toString("utf8")
    const data = JSON.parse(json) as { providers?: unknown }
    const list = Array.isArray(data.providers) ? data.providers : []
    const out: SyncedProvider[] = []
    for (const item of list) {
      if (!item || typeof item !== "object") continue
      const p = item as Record<string, unknown>
      const base_url = String(p.base_url || "").trim()
      const api_key = String(p.api_key || "").trim()
      const model = String(p.model || "").trim()
      const adapter = String(p.adapter || "").trim()
      if (!base_url || !api_key || !adapter) continue
      out.push({
        id: Number(p.id) || 0,
        kind: String(p.kind || ""),
        name: String(p.name || adapter),
        adapter,
        base_url,
        api_key,
        model,
        extra: typeof p.extra === "object" && p.extra ? (p.extra as Record<string, unknown>) : {},
        priority: Number(p.priority) || 100,
      })
    }
    out.sort((a, b) => a.priority - b.priority || a.id - b.id)
    _cacheRaw = raw
    _cacheParsed = out
    return out
  } catch {
    return []
  }
}

export function listSyncedByAdapter(adapter: string): SyncedProvider[] {
  return loadSyncedProviders().filter((p) => p.adapter === adapter)
}

export function listSyncedLlmOpenai(): SyncedProvider[] {
  return listSyncedByAdapter("openai_chat")
}

export function listSyncedLlmArk(): SyncedProvider[] {
  return listSyncedByAdapter("ark_chat")
}

export function listSyncedEnterpriseAgentFastProviders(input: {
  hasImages: boolean
}): SyncedProvider[] {
  return loadSyncedProviders().filter((provider) => {
    if (provider.kind.trim().toLowerCase() !== "llm") return false
    if (provider.adapter.trim().toLowerCase() !== "openai_chat") return false
    const purpose = String(provider.extra?.purpose ?? "").trim().toLowerCase()
    const tier = String(provider.extra?.performance_tier ?? "").trim().toLowerCase()
    if (purpose !== "enterprise_agent" || tier !== "fast") return false
    if (!/deepseek/i.test(`${provider.name} ${provider.model}`)) return false
    if (input.hasImages && provider.extra?.supports_images !== true) return false
    return Boolean(provider.model.trim())
  })
}

export function listSyncedVideoProviders(): SyncedProvider[] {
  return loadSyncedProviders().filter(
    (p) => p.adapter === "seedance_video" || p.adapter === "xinghe_video",
  )
}
