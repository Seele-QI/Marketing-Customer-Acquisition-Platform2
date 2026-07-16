import { getSonettoModel, type SonettoProvider } from "@/lib/llm/model-registry"
import { parseOpenAiUsage, type LlmUsage } from "@/lib/llm/pricing"
import { readServerEnv } from "@/lib/server-env"

const DEFAULT_NEWAPI_BASE = "https://www.aicost.xyz"

export type SonettoContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export type SonettoMessage = {
  role: "system" | "user" | "assistant"
  content: string | SonettoContentPart[]
}

export type SonettoChatResult =
  | { ok: true; text: string; usage: LlmUsage | null; relay?: string }
  | { ok: false; status: number; detail: string }

export type NewApiRelayEndpoint = {
  name: "primary" | "secondary" | "tertiary"
  baseUrl: string
  apiKey: string
  gptModel?: string
  claudeModel?: string
}

function normalizeNewApiBaseUrl(raw: string): string {
  let t = (raw || DEFAULT_NEWAPI_BASE).trim().replace(/\/+$/, "")
  if (t.endsWith("/chat/completions")) {
    t = t.slice(0, -"/chat/completions".length).replace(/\/+$/, "")
  }
  if (!/\/v\d+$/i.test(t)) {
    t = `${t}/v1`
  }
  return t
}

function relayTier(
  name: NewApiRelayEndpoint["name"],
  baseEnv: string,
  keyEnv: string,
  gptEnv: string,
  claudeEnv: string,
): NewApiRelayEndpoint | null {
  const baseUrl = readServerEnv(baseEnv)
  const apiKey = readServerEnv(keyEnv)
  if (!baseUrl || !apiKey) return null
  const gptModel = readServerEnv(gptEnv)
  const claudeModel = readServerEnv(claudeEnv)
  return {
    name,
    baseUrl: normalizeNewApiBaseUrl(baseUrl),
    apiKey,
    ...(gptModel ? { gptModel } : {}),
    ...(claudeModel ? { claudeModel } : {}),
  }
}

/** 首选 → 次选 → 三选 NewAPI 中转（去重 base+key） */
export function listNewApiRelayEndpoints(): NewApiRelayEndpoint[] {
  const candidates: NewApiRelayEndpoint[] = []
  const primary = relayTier(
    "primary",
    "NEWAPI_BASE_URL",
    "NEWAPI_KEY",
    "NEWAPI_GPT_MODEL",
    "NEWAPI_CLAUDE_MODEL",
  )
  if (primary) candidates.push(primary)

  const secondary = relayTier(
    "secondary",
    "NEWAPI_SECONDARY_BASE_URL",
    "NEWAPI_SECONDARY_KEY",
    "NEWAPI_SECONDARY_GPT_MODEL",
    "NEWAPI_SECONDARY_CLAUDE_MODEL",
  )
  if (secondary) candidates.push(secondary)

  const tertiary = relayTier(
    "tertiary",
    "NEWAPI_TERTIARY_BASE_URL",
    "NEWAPI_TERTIARY_KEY",
    "NEWAPI_TERTIARY_GPT_MODEL",
    "NEWAPI_TERTIARY_CLAUDE_MODEL",
  )
  if (tertiary) candidates.push(tertiary)

  const seen = new Set<string>()
  const out: NewApiRelayEndpoint[] = []
  for (const ep of candidates) {
    const sig = `${ep.baseUrl}|${ep.apiKey}`
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push(ep)
  }
  return out
}

function resolveRelayModelId(
  relay: NewApiRelayEndpoint,
  provider: SonettoProvider,
  requestedModelId: string,
): string {
  if (provider === "sonetto_gpt") {
    return relay.gptModel || requestedModelId
  }
  return relay.claudeModel || requestedModelId
}

function shouldFailoverToNextRelay(status: number): boolean {
  return status === 429 || status >= 500
}

export function getSonettoBaseUrl(): string {
  const relays = listNewApiRelayEndpoints()
  if (relays.length) return relays[0].baseUrl
  const raw =
    readServerEnv("NEWAPI_BASE_URL") ||
    readServerEnv("SONETTO_BASE_URL") ||
    DEFAULT_NEWAPI_BASE
  return normalizeNewApiBaseUrl(raw)
}

export function getSonettoApiKey(provider: SonettoProvider): string {
  const relays = listNewApiRelayEndpoints()
  if (relays.length) return relays[0].apiKey
  const unified = readServerEnv("NEWAPI_KEY")
  if (unified) return unified
  if (provider === "sonetto_gpt") return readServerEnv("SONETTO_GPT_API_KEY")
  return readServerEnv("SONETTO_CLAUDE_API_KEY")
}

export function isSonettoProviderConfigured(provider: SonettoProvider): boolean {
  if (listNewApiRelayEndpoints().length > 0) return true
  return Boolean(getSonettoApiKey(provider))
}

/** aicost / NewAPI 默认 280s；可通过 NEWAPI_TIMEOUT_MS 覆盖 */
export function sonettoTimeoutMs(): number {
  const raw = readServerEnv("NEWAPI_TIMEOUT_MS") || readServerEnv("SONETTO_TIMEOUT_MS")
  if (raw) {
    const n = Number(raw)
    if (Number.isFinite(n) && n > 0) return n
  }
  return 280_000
}

async function postSonettoChat(
  relay: NewApiRelayEndpoint,
  input: {
    modelId: string
    messages: SonettoMessage[]
    maxTokens?: number
    temperature?: number
    timeoutMs: number
  },
): Promise<SonettoChatResult & { relay: string }> {
  const url = `${relay.baseUrl}/chat/completions`
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${relay.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        model: input.modelId,
        messages: input.messages,
        stream: false,
        ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature != null ? { temperature: input.temperature } : {}),
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
    })

    const raw = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        status: res.status >= 400 && res.status < 600 ? res.status : 502,
        detail: `NewAPI(${relay.name}) 报错: ${raw.slice(0, 8000)}`,
        relay: relay.name,
      }
    }

    let data: {
      choices?: { message?: { content?: string } }[]
      usage?: unknown
    }
    try {
      data = JSON.parse(raw) as typeof data
    } catch {
      return { ok: false, status: 502, detail: "NewAPI 返回非 JSON", relay: relay.name }
    }

    const text = data.choices?.[0]?.message?.content
    if (typeof text !== "string") {
      return { ok: false, status: 502, detail: "NewAPI 响应缺少正文", relay: relay.name }
    }
    return { ok: true, text, usage: parseOpenAiUsage(data.usage), relay: relay.name }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      status: 502,
      detail: `调用 NewAPI(${relay.name}) 失败: ${msg}`,
      relay: relay.name,
    }
  }
}

export async function sonettoChatCompletion(input: {
  modelId: string
  messages: SonettoMessage[]
  maxTokens?: number
  timeoutMs?: number
  temperature?: number
}): Promise<SonettoChatResult> {
  const model = getSonettoModel(input.modelId)
  if (!model) {
    return { ok: false, status: 400, detail: `不支持的模型: ${input.modelId}` }
  }

  const relays = listNewApiRelayEndpoints()
  if (!relays.length) {
    const apiKey = getSonettoApiKey(model.provider)
    if (!apiKey) {
      return {
        ok: false,
        status: 503,
        detail: "未配置 NEWAPI_KEY（或 SONETTO_GPT_API_KEY / SONETTO_CLAUDE_API_KEY）",
      }
    }
    relays.push({
      name: "primary",
      baseUrl: getSonettoBaseUrl(),
      apiKey,
    })
  }

  const timeoutMs = input.timeoutMs ?? sonettoTimeoutMs()
  const errors: string[] = []

  for (let i = 0; i < relays.length; i++) {
    const relay = relays[i]
    const modelId = resolveRelayModelId(relay, model.provider, input.modelId)
    const result = await postSonettoChat(relay, { ...input, modelId, timeoutMs })
    if (result.ok) {
      return { ok: true, text: result.text, usage: result.usage, relay: result.relay }
    }
    errors.push(result.detail)
    const isLast = i === relays.length - 1
    if (isLast || !shouldFailoverToNextRelay(result.status)) {
      return { ok: false, status: result.status, detail: result.detail }
    }
  }

  return { ok: false, status: 502, detail: errors.join(" | ") || "NewAPI 全部中转不可用" }
}

export type SonettoStreamSetup = {
  url: string
  authorization: string
  requestBody: Record<string, unknown>
  timeoutMs: number
  relay?: string
}

/** 构造流式请求参数（由 chat-stream 发起 fetch 并拦截 usage） */
export function buildSonettoStreamRequest(input: {
  modelId: string
  messages: SonettoMessage[]
  maxTokens?: number
}): { ok: true; setup: SonettoStreamSetup } | { ok: false; status: number; detail: string } {
  const model = getSonettoModel(input.modelId)
  if (!model) {
    return { ok: false, status: 400, detail: `不支持的模型: ${input.modelId}` }
  }

  const relays = listNewApiRelayEndpoints()
  const relay = relays[0]
  const apiKey = relay?.apiKey || getSonettoApiKey(model.provider)
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      detail: "未配置 NEWAPI_KEY（或 SONETTO_GPT_API_KEY / SONETTO_CLAUDE_API_KEY）",
    }
  }

  const baseUrl = relay?.baseUrl || getSonettoBaseUrl()
  const modelId = relay
    ? resolveRelayModelId(relay, model.provider, input.modelId)
    : input.modelId

  return {
    ok: true,
    setup: {
      url: `${baseUrl}/chat/completions`,
      authorization: `Bearer ${apiKey}`,
      requestBody: {
        model: modelId,
        messages: input.messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
      },
      timeoutMs: sonettoTimeoutMs(),
      relay: relay?.name,
    },
  }
}

/**
 * 解析 SSE 文本块中的 usage（OpenAI 兼容：最后一帧常带 usage）。
 * 返回最近一次解析到的 usage。
 */
export function extractUsageFromSseChunk(
  chunkText: string,
  prev: LlmUsage | null,
): LlmUsage | null {
  let found = prev
  for (const line of chunkText.split("\n")) {
    const trimmed = line.trim()
    if (!trimmed.startsWith("data:")) continue
    const payload = trimmed.slice(5).trim()
    if (!payload || payload === "[DONE]") continue
    try {
      const obj = JSON.parse(payload) as { usage?: unknown }
      const u = parseOpenAiUsage(obj.usage)
      if (u) found = u
    } catch {
      /* ignore partial JSON */
    }
  }
  return found
}
