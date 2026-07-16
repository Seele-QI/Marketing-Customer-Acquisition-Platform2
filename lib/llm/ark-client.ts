/**
 * 火山方舟 / 豆包 Chat Completions 统一客户端（Rest API + /chat/completions）。
 * 密钥不在此文件；见 ARK_API_KEY / ARK_CHAT_MODEL 等环境变量。
 *
 * 桌面端：Key 可由云端 POST /api/config/sync 下发（白名单须含
 * ARK_API_KEY、ARK_CHAT_MODEL、ARK_BASE_URL）。
 */

import { normalizeArkBaseUrl } from "@/lib/ark-images-api"
import { DOUBAO_SEED_21_MODEL_ID } from "@/lib/llm/model-registry"
import { readServerEnv } from "@/lib/server-env"

export const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

export type ArkChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export type ArkChatMessage = {
  role: "system" | "user" | "assistant"
  content: string | ArkChatContentPart[]
}

/** 仅当用户把接入点误写在 ARK_API_KEY 时做推断（ep- 开头）。 */
export function inferEndpointIdFromRawArkKey(raw: string): string {
  const t = raw.trim()
  return /^ep-/i.test(t) ? t : ""
}

export function resolveArkBearer(): string {
  const rawArkKey = readServerEnv("ARK_API_KEY")
  const arkSecret =
    readServerEnv("ARK_API_SECRET") || readServerEnv("VOLCENGINE_API_KEY")
  return (arkSecret || rawArkKey).trim()
}

/**
 * 模型解析顺序：ARK_CHAT_MODEL → ARK_ENDPOINT_ID → ARK_MODEL →
 * 从误写在 Key 上的 ep- 推断 → 默认豆包 Seed 2.1 Pro 预置 ID。
 */
export function getArkChatModelId(override?: string): string {
  const explicit = (override || "").trim()
  if (explicit) return explicit
  return (
    readServerEnv("ARK_CHAT_MODEL") ||
    readServerEnv("ARK_ENDPOINT_ID") ||
    readServerEnv("ARK_MODEL") ||
    inferEndpointIdFromRawArkKey(readServerEnv("ARK_API_KEY")) ||
    DOUBAO_SEED_21_MODEL_ID
  )
}

export function isArkChatConfigured(): boolean {
  return Boolean(resolveArkBearer())
}

export function buildArkChatCompletionsUrl(baseUrl?: string): string {
  const base =
    normalizeArkBaseUrl(baseUrl || readServerEnv("ARK_BASE_URL") || DEFAULT_ARK_BASE_URL) ||
    DEFAULT_ARK_BASE_URL
  return `${base}/chat/completions`
}

function extractUpstreamError(parsed: unknown, rawText: string): string {
  if (!parsed || typeof parsed !== "object") return rawText.slice(0, 800)
  const o = parsed as Record<string, unknown>
  if (typeof o.message === "string" && o.message.trim()) return o.message.trim()
  const err = o.error
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>
    if (typeof e.message === "string" && e.message.trim()) return e.message.trim()
  }
  return rawText.slice(0, 800)
}

export function extractArkAssistantText(parsed: unknown): string {
  if (!parsed || typeof parsed !== "object") return ""
  const o = parsed as Record<string, unknown>
  const choices = o.choices
  if (!Array.isArray(choices) || choices.length === 0) return ""
  const first = choices[0]
  if (!first || typeof first !== "object") return ""
  const msg = (first as Record<string, unknown>).message
  if (!msg || typeof msg !== "object") return ""
  const content = (msg as Record<string, unknown>).content
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    const chunks: string[] = []
    for (const p of content) {
      if (!p || typeof p !== "object") continue
      const rec = p as Record<string, unknown>
      if (rec.type === "text" && typeof rec.text === "string") chunks.push(rec.text)
    }
    return chunks.join("").trim()
  }
  return ""
}

export type ArkStreamChatRequest = {
  url: string
  authorization: string
  body: Record<string, unknown>
  modelId: string
}

/** 供 chat-stream 组装流式 Chat Completions 请求（不发网络）。 */
export function buildArkStreamChatRequest(input: {
  messages: ArkChatMessage[]
  modelId?: string
}): ArkStreamChatRequest | { error: string; status: number } {
  const bearer = resolveArkBearer()
  if (!bearer) {
    return {
      error: "未配置豆包：请设置 ARK_API_KEY 与 ARK_CHAT_MODEL",
      status: 503,
    }
  }
  const modelId = getArkChatModelId(input.modelId)
  return {
    url: buildArkChatCompletionsUrl(),
    authorization: `Bearer ${bearer}`,
    modelId,
    body: {
      model: modelId,
      stream: true,
      messages: input.messages,
    },
  }
}

/**
 * 火山方舟 OpenAI 兼容 Chat Completions（非流式）。
 * 支持纯文本与 image_url 多模态。
 */
export async function arkChatCompletionNonStream(input: {
  system: string
  userParts: ArkChatContentPart[] | string
  timeoutMs?: number
  modelId?: string
  maxTokens?: number
  temperature?: number
}): Promise<
  { ok: true; text: string } | { ok: false; status: number; detail: string }
> {
  const bearer = resolveArkBearer()
  const modelId = getArkChatModelId(input.modelId)

  if (!bearer) {
    return {
      ok: false,
      status: 503,
      detail:
        "未配置 AI 视觉服务鉴权（识图 / 对话）：请设置视觉服务 API Key（ARK_API_KEY）。生图专用密钥请仅用于生图接口。本地 .env.local / 线上 Environment variables；保存后重启或重新部署。",
    }
  }

  const url = buildArkChatCompletionsUrl()
  const timeoutMs = input.timeoutMs ?? 120_000
  const userContent =
    typeof input.userParts === "string"
      ? input.userParts
      : input.userParts

  const body: Record<string, unknown> = {
    model: modelId,
    stream: false,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: userContent },
    ],
  }
  if (input.maxTokens != null) body.max_tokens = input.maxTokens
  if (input.temperature != null) body.temperature = input.temperature

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bearer}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })

    const rawText = await res.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(rawText) as unknown
    } catch {
      return {
        ok: false,
        status: 502,
        detail: `AI 平台返回非 JSON（HTTP ${res.status}）：${rawText.slice(0, 400)}`,
      }
    }

    if (!res.ok) {
      const msg = extractUpstreamError(parsed, rawText)
      const status = res.status >= 400 && res.status < 600 ? res.status : 502
      return {
        ok: false,
        status,
        detail: `AI 识图/对话失败（${res.status}）：${msg}`,
      }
    }

    const text = extractArkAssistantText(parsed)
    if (!text) {
      return {
        ok: false,
        status: 502,
        detail:
          "AI 平台返回成功但未解析到助手正文，请确认模型为支持多模态的豆包 Seed 2.1（或对应视觉接入点）。",
      }
    }
    return { ok: true, text }
  } catch (e) {
    const aborted =
      (typeof DOMException !== "undefined" &&
        e instanceof DOMException &&
        e.name === "AbortError") ||
      (e instanceof Error && e.name === "AbortError")
    if (aborted) {
      return {
        ok: false,
        status: 504,
        detail: `请求超过 ${timeoutMs / 1000}s 未返回，请缩小参考图后重试。`,
      }
    }
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, status: 502, detail: `调用 AI 视觉服务失败: ${msg}` }
  } finally {
    clearTimeout(timer)
  }
}
