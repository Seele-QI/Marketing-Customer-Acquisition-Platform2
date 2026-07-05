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
  | { ok: true; text: string; usage: LlmUsage | null }
  | { ok: false; status: number; detail: string }

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

export function getSonettoBaseUrl(): string {
  const raw =
    readServerEnv("NEWAPI_BASE_URL") ||
    readServerEnv("SONETTO_BASE_URL") ||
    DEFAULT_NEWAPI_BASE
  return normalizeNewApiBaseUrl(raw)
}

export function getSonettoApiKey(provider: SonettoProvider): string {
  const unified = readServerEnv("NEWAPI_KEY")
  if (unified) return unified
  if (provider === "sonetto_gpt") return readServerEnv("SONETTO_GPT_API_KEY")
  return readServerEnv("SONETTO_CLAUDE_API_KEY")
}

export function isSonettoProviderConfigured(provider: SonettoProvider): boolean {
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
  const apiKey = getSonettoApiKey(model.provider)
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      detail: "未配置 NEWAPI_KEY（或 SONETTO_GPT_API_KEY / SONETTO_CLAUDE_API_KEY）",
    }
  }

  const url = `${getSonettoBaseUrl()}/chat/completions`
  const timeoutMs = input.timeoutMs ?? sonettoTimeoutMs()

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
      signal: AbortSignal.timeout(timeoutMs),
    })

    const raw = await res.text()
    if (!res.ok) {
      return {
        ok: false,
        status: res.status >= 400 && res.status < 600 ? res.status : 502,
        detail: `NewAPI 报错: ${raw.slice(0, 8000)}`,
      }
    }

    let data: {
      choices?: { message?: { content?: string } }[]
      usage?: unknown
    }
    try {
      data = JSON.parse(raw) as typeof data
    } catch {
      return { ok: false, status: 502, detail: "NewAPI 返回非 JSON" }
    }

    const text = data.choices?.[0]?.message?.content
    if (typeof text !== "string") {
      return { ok: false, status: 502, detail: "NewAPI 响应缺少正文" }
    }
    return { ok: true, text, usage: parseOpenAiUsage(data.usage) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, detail: `调用 NewAPI 失败: ${msg}` }
  }
}

export type SonettoStreamSetup = {
  url: string
  authorization: string
  requestBody: Record<string, unknown>
  timeoutMs: number
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
  const apiKey = getSonettoApiKey(model.provider)
  if (!apiKey) {
    return {
      ok: false,
      status: 503,
      detail: "未配置 NEWAPI_KEY（或 SONETTO_GPT_API_KEY / SONETTO_CLAUDE_API_KEY）",
    }
  }

  return {
    ok: true,
    setup: {
      url: `${getSonettoBaseUrl()}/chat/completions`,
      authorization: `Bearer ${apiKey}`,
      requestBody: {
        model: input.modelId,
        messages: input.messages,
        stream: true,
        stream_options: { include_usage: true },
        ...(input.maxTokens != null ? { max_tokens: input.maxTokens } : {}),
      },
      timeoutMs: sonettoTimeoutMs(),
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
