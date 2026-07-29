import crypto from "node:crypto"

import type { BusinessTaskBilling } from "@/lib/credit/business-task"

import { chargeBillingEvent, estimateBillingCost } from "@/lib/api/charge-billing"
import { getCreditBalance } from "@/lib/api/with-auth"
import {
  arkChatCompletionNonStream,
  isArkChatConfigured,
} from "@/lib/llm/ark-client"
import {
  DEFAULT_NEWAPI_CLAUDE_MODEL,
  DEFAULT_NEWAPI_GPT_MODEL,
} from "@/lib/llm/model-registry"
import {
  isSonettoProviderConfigured,
  sonettoChatCompletion,
} from "@/lib/llm/sonetto-client"
import { getDeepseekApiKey, readServerEnv } from "@/lib/server-env"

/** 兼容旧 import：`@/lib/geo/llm/router` */
export { getArkChatModelId, isArkChatConfigured } from "@/lib/llm/ark-client"

export type LlmProviderId = "deepseek" | "doubao" | "kimi" | "gpt" | "claude" | "gemini"

export type LlmProviderMeta = {
  id: LlmProviderId
  label: string
  envKeys: string[]
  configured: boolean
}

const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions"
const KIMI_CHAT_URL = "https://api.moonshot.cn/v1/chat/completions"
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

const DEFAULT_SONETTO_GPT_MODEL = DEFAULT_NEWAPI_GPT_MODEL
const DEFAULT_SONETTO_CLAUDE_MODEL = DEFAULT_NEWAPI_CLAUDE_MODEL

export type CompleteTextBilling = {
  userId: number
  refIdPrefix?: string
  cookieHeader?: string
  provider: string
  businessTask?: BusinessTaskBilling
}

export type CompleteTextParams = {
  provider: LlmProviderId
  system: string
  user: string
  maxTokens?: number
  billing?: CompleteTextBilling
}

export function isSonettoLlmProvider(id: LlmProviderId): boolean {
  return id === "gpt" || id === "claude"
}

export function sonettoModelIdForProvider(provider: "gpt" | "claude"): string {
  if (provider === "gpt") {
    return (
      readServerEnv("NEWAPI_GPT_MODEL") ||
      readServerEnv("SONETTO_GPT_MODEL") ||
      DEFAULT_SONETTO_GPT_MODEL
    )
  }
  return (
    readServerEnv("NEWAPI_CLAUDE_MODEL") ||
    readServerEnv("SONETTO_CLAUDE_MODEL") ||
    DEFAULT_SONETTO_CLAUDE_MODEL
  )
}

function isProviderConfigured(id: LlmProviderId): boolean {
  switch (id) {
    case "deepseek":
      return Boolean(getDeepseekApiKey())
    case "doubao":
      return isArkChatConfigured()
    case "kimi":
      return Boolean(readServerEnv("KIMI_API_KEY"))
    case "gpt":
      return isSonettoProviderConfigured("sonetto_gpt")
    case "claude":
      return isSonettoProviderConfigured("sonetto_claude")
    case "gemini":
      return Boolean(readServerEnv("GEMINI_API_KEY"))
    default:
      return false
  }
}

export function listLlmProviders(): LlmProviderMeta[] {
  const defs: { id: LlmProviderId; label: string; envKeys: string[] }[] = [
    { id: "deepseek", label: "DeepSeek", envKeys: ["DEEPSEEK_API_KEY"] },
    { id: "doubao", label: "豆包 Seed 2.1 Pro", envKeys: ["ARK_API_KEY", "ARK_CHAT_MODEL"] },
    { id: "kimi", label: "Kimi", envKeys: ["KIMI_API_KEY"] },
    { id: "gpt", label: "GPT-5.5", envKeys: ["NEWAPI_KEY", "SONETTO_GPT_API_KEY"] },
    { id: "claude", label: "Claude Opus 4.8", envKeys: ["NEWAPI_KEY", "SONETTO_CLAUDE_API_KEY"] },
    { id: "gemini", label: "Gemini", envKeys: ["GEMINI_API_KEY"] },
  ]
  return defs.map((d) => ({ ...d, configured: isProviderConfigured(d.id) }))
}

async function parseChatCompletionText(res: Response): Promise<string> {
  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(errBody || `上游返回 ${res.status}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const text = data.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error("模型未返回有效文本")
  return text
}

async function completeDeepSeek(system: string, user: string, maxTokens: number): Promise<string> {
  const apiKey = getDeepseekApiKey()
  if (!apiKey) throw new Error("未配置 DEEPSEEK_API_KEY")

  const model = readServerEnv("DEEPSEEK_CHAT_MODEL") || "deepseek-chat"
  const res = await fetch(DEEPSEEK_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  })
  return parseChatCompletionText(res)
}

async function completeDoubao(system: string, user: string, maxTokens: number): Promise<string> {
  if (!isArkChatConfigured()) {
    throw new Error("未配置 ARK_API_KEY 或 ARK_CHAT_MODEL / ARK_ENDPOINT_ID")
  }
  const result = await arkChatCompletionNonStream({
    system,
    userParts: user,
    maxTokens,
    temperature: 0.4,
  })
  if (!result.ok) {
    const err = new Error(result.detail)
    ;(err as Error & { statusCode?: number }).statusCode = result.status
    throw err
  }
  return result.text
}

async function completeKimi(system: string, user: string, maxTokens: number): Promise<string> {
  const apiKey = readServerEnv("KIMI_API_KEY")
  if (!apiKey) throw new Error("未配置 KIMI_API_KEY")

  const model = readServerEnv("KIMI_MODEL") || "moonshot-v1-32k"
  const res = await fetch(KIMI_CHAT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      max_tokens: maxTokens,
      temperature: 0.4,
    }),
  })
  return parseChatCompletionText(res)
}

async function completeGemini(system: string, user: string, maxTokens: number): Promise<string> {
  const apiKey = readServerEnv("GEMINI_API_KEY")
  if (!apiKey) throw new Error("未配置 GEMINI_API_KEY")

  const model = readServerEnv("GEMINI_CHAT_MODEL") || "gemini-2.0-flash"
  const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
        temperature: 0.4,
      },
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(errBody || `上游返回 ${res.status}`)
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim()
  if (!text) throw new Error("模型未返回有效文本")
  return text
}

async function completeSonetto(
  provider: "gpt" | "claude",
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  const modelId = sonettoModelIdForProvider(provider)
  const result = await sonettoChatCompletion({
    modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens,
  })
  if (!result.ok) {
    const err = new Error(result.detail)
    ;(err as Error & { statusCode?: number }).statusCode = result.status
    throw err
  }
  return result.text
}

/** 纯函数：构建补全尝试序列（便于单测） */
export function completionAttemptSequence(
  primary: LlmProviderId,
  includeDeepseekFallback: boolean,
): LlmProviderId[] {
  const attempts: LlmProviderId[] = [primary, primary]
  if (primary !== "deepseek" && includeDeepseekFallback) {
    attempts.push("deepseek")
  }
  return attempts
}

/** 构建补全尝试序列：首选模型重试一次，失败后（若已配置）DeepSeek 兜底 */
export function buildCompletionAttemptProviders(primary: LlmProviderId): LlmProviderId[] {
  return completionAttemptSequence(primary, isProviderConfigured("deepseek"))
}

function isNonRetryableCompletionError(err: Error): boolean {
  const code = (err as Error & { statusCode?: number }).statusCode
  return code === 402 || code === 503
}

async function invokeProvider(
  provider: LlmProviderId,
  system: string,
  user: string,
  maxTokens: number,
): Promise<string> {
  if (!isProviderConfigured(provider)) {
    const meta = listLlmProviders().find((p) => p.id === provider)
    const keys = meta?.envKeys.join("、") ?? provider
    const err = new Error(`未配置 ${keys}，请在 .env 中设置后重启服务`)
    ;(err as Error & { statusCode?: number }).statusCode = 503
    throw err
  }

  if (provider === "gpt" || provider === "claude") {
    return completeSonetto(provider, system, user, maxTokens)
  }

  switch (provider) {
    case "deepseek":
      return completeDeepSeek(system, user, maxTokens)
    case "doubao":
      return completeDoubao(system, user, maxTokens)
    case "kimi":
      return completeKimi(system, user, maxTokens)
    case "gemini":
      return completeGemini(system, user, maxTokens)
    default:
      throw new Error(`未知 provider: ${provider}`)
  }
}

export async function settleGeoArticleBilling(billing: CompleteTextBilling): Promise<void> {
  if (!billing.cookieHeader) {
    const err = new Error("缺少 cookieHeader，无法扣费")
    ;(err as Error & { statusCode?: number }).statusCode = 500
    throw err
  }

  const need = estimateBillingCost("geo.article", { provider: billing.provider })
  try {
    const balance = await getCreditBalance(billing.cookieHeader)
    if (balance < need) {
      const err = new Error(`积分不足（需要 ${need}，当前 ${balance}）`)
      ;(err as Error & { statusCode?: number }).statusCode = 402
      throw err
    }
  } catch (e) {
    if (e instanceof Error && (e as Error & { statusCode?: number }).statusCode === 402) {
      throw e
    }
  }

  const prefix = billing.refIdPrefix || "geo-article"
  const refId = `${prefix}:${billing.userId}:${crypto.randomBytes(8).toString("hex")}`

  try {
    await chargeBillingEvent({
      cookieHeader: billing.cookieHeader,
      billingKey: "geo.article",
      params: { provider: billing.provider },
      refId,
      businessTask: billing.businessTask,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "INSUFFICIENT_CREDIT") {
      const err = new Error("积分不足")
      ;(err as Error & { statusCode?: number }).statusCode = 402
      throw err
    }
    const err = new Error("扣费失败")
    ;(err as Error & { statusCode?: number }).statusCode = 500
    throw err
  }
}

/** 非流式文本补全；首选模型失败时重试一次，仍失败则 DeepSeek 兜底（若已配置） */
export async function completeText(params: CompleteTextParams): Promise<string> {
  const { provider, system, user, maxTokens = 4096, billing } = params

  if (!isProviderConfigured(provider)) {
    const meta = listLlmProviders().find((p) => p.id === provider)
    const keys = meta?.envKeys.join("、") ?? provider
    const err = new Error(`未配置 ${keys}，请在 .env 中设置后重启服务`)
    ;(err as Error & { statusCode?: number }).statusCode = 503
    throw err
  }

  const attempts = buildCompletionAttemptProviders(provider)
  let lastError: Error | undefined

  for (const attemptProvider of attempts) {
    try {
      const text = await invokeProvider(attemptProvider, system, user, maxTokens)
      if (billing) {
        await settleGeoArticleBilling({ ...billing, provider: attemptProvider })
      }
      return text
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e))
      lastError = err
      if (isNonRetryableCompletionError(err)) {
        throw err
      }
    }
  }

  throw lastError ?? new Error("模型调用失败")
}
