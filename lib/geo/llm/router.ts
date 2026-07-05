import crypto from "node:crypto"

import { chargeMeteredCredit, getCreditBalance } from "@/lib/api/with-auth"
import {
  estimateMaxCredits,
  settleCredits,
  type LlmUsage,
} from "@/lib/llm/pricing"
import {
  isSonettoProviderConfigured,
  sonettoChatCompletion,
} from "@/lib/llm/sonetto-client"
import { getDeepseekApiKey, readServerEnv } from "@/lib/server-env"

export type LlmProviderId = "deepseek" | "doubao" | "kimi" | "gpt" | "claude" | "gemini"

export type LlmProviderMeta = {
  id: LlmProviderId
  label: string
  envKeys: string[]
  configured: boolean
}

const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions"
const DEFAULT_ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"
const KIMI_CHAT_URL = "https://api.moonshot.cn/v1/chat/completions"
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"

const DEFAULT_SONETTO_GPT_MODEL = "gpt-5.5"
const DEFAULT_SONETTO_CLAUDE_MODEL = "[kiro]claude-opus-4-7"

export type CompleteTextBilling = {
  userId: number
  refIdPrefix?: string
  /** 有则预检余额；无则仅在扣费时校验 */
  cookieHeader?: string
}

export type CompleteTextParams = {
  provider: LlmProviderId
  system: string
  user: string
  maxTokens?: number
  /** 仅 gpt/claude（Sonetto）成功后计量扣费 */
  billing?: CompleteTextBilling
}

function normalizeArkBaseUrl(raw: string): string {
  let t = raw.trim().replace(/\/+$/, "")
  if (t.endsWith("/chat/completions")) {
    t = t.slice(0, -"/chat/completions".length).replace(/\/+$/, "")
  }
  return t
}

export function isSonettoLlmProvider(id: LlmProviderId): boolean {
  return id === "gpt" || id === "claude"
}

export function sonettoModelIdForProvider(provider: "gpt" | "claude"): string {
  if (provider === "gpt") {
    return readServerEnv("SONETTO_GPT_MODEL") || DEFAULT_SONETTO_GPT_MODEL
  }
  return readServerEnv("SONETTO_CLAUDE_MODEL") || DEFAULT_SONETTO_CLAUDE_MODEL
}

function isProviderConfigured(id: LlmProviderId): boolean {
  switch (id) {
    case "deepseek":
      return Boolean(getDeepseekApiKey())
    case "doubao":
      return Boolean(
        (readServerEnv("ARK_API_KEY") || readServerEnv("ARK_API_SECRET")) &&
          (readServerEnv("ARK_CHAT_MODEL") ||
            readServerEnv("ARK_ENDPOINT_ID") ||
            readServerEnv("ARK_MODEL")),
      )
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
    { id: "doubao", label: "豆包 2.1", envKeys: ["ARK_API_KEY", "ARK_CHAT_MODEL"] },
    { id: "kimi", label: "Kimi", envKeys: ["KIMI_API_KEY"] },
    { id: "gpt", label: "GPT-5.5", envKeys: ["SONETTO_GPT_API_KEY"] },
    { id: "claude", label: "Claude Opus", envKeys: ["SONETTO_CLAUDE_API_KEY"] },
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

/** 豆包：优先 ARK_CHAT_MODEL（预置如 doubao-seed-2-1-pro），否则 ARK_ENDPOINT_ID */
export function getArkChatModelId(): string {
  return (
    readServerEnv("ARK_CHAT_MODEL") ||
    readServerEnv("ARK_ENDPOINT_ID") ||
    readServerEnv("ARK_MODEL") ||
    ""
  )
}

export function isArkChatConfigured(): boolean {
  const apiKey = readServerEnv("ARK_API_KEY") || readServerEnv("ARK_API_SECRET")
  return Boolean(apiKey && getArkChatModelId())
}

async function completeDoubao(system: string, user: string, maxTokens: number): Promise<string> {
  const apiKey = readServerEnv("ARK_API_KEY") || readServerEnv("ARK_API_SECRET")
  const modelId = getArkChatModelId()
  if (!apiKey || !modelId) {
    throw new Error("未配置 ARK_API_KEY 或 ARK_CHAT_MODEL / ARK_ENDPOINT_ID")
  }

  const baseUrl = normalizeArkBaseUrl(readServerEnv("ARK_BASE_URL") || DEFAULT_ARK_BASE_URL)
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modelId,
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

type SonettoCompleteResult = { text: string; usage: LlmUsage | null; modelId: string }

async function completeSonetto(
  provider: "gpt" | "claude",
  system: string,
  user: string,
  maxTokens: number,
): Promise<SonettoCompleteResult> {
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
  return { text: result.text, usage: result.usage, modelId }
}

async function settleSonettoBilling(opts: {
  billing: CompleteTextBilling
  modelId: string
  system: string
  user: string
  maxTokens: number
  usage: LlmUsage | null
}): Promise<void> {
  const inputText = `${opts.system}\n${opts.user}`
  const estimate = estimateMaxCredits(opts.modelId, inputText, opts.maxTokens)
  const costCredits = opts.usage
    ? settleCredits(opts.modelId, opts.usage)
    : estimate

  const prefix = opts.billing.refIdPrefix || "geo-llm"
  const refId = `${prefix}:${opts.billing.userId}:${crypto.randomBytes(8).toString("hex")}`

  try {
    await chargeMeteredCredit({
      userId: opts.billing.userId,
      cost: costCredits,
      refId,
      note: `GEO AI ${opts.modelId}`,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg === "INSUFFICIENT_CREDIT") {
      const err = new Error("积分不足")
      ;(err as Error & { statusCode?: number }).statusCode = 402
      throw err
    }
    if (msg === "METERED_KEY_MISSING") {
      const err = new Error("未配置 CREDIT_METERED_KEY，无法计量扣费")
      ;(err as Error & { statusCode?: number }).statusCode = 503
      throw err
    }
    const err = new Error("扣费失败")
    ;(err as Error & { statusCode?: number }).statusCode = 500
    throw err
  }
}

/** 非流式文本补全；未配置 Key 时抛出带 503 语义的错误 */
export async function completeText(params: CompleteTextParams): Promise<string> {
  const { provider, system, user, maxTokens = 4096, billing } = params

  if (!isProviderConfigured(provider)) {
    const meta = listLlmProviders().find((p) => p.id === provider)
    const keys = meta?.envKeys.join("、") ?? provider
    const err = new Error(`未配置 ${keys}，请在 .env 中设置后重启服务`)
    ;(err as Error & { statusCode?: number }).statusCode = 503
    throw err
  }

  if (provider === "gpt" || provider === "claude") {
    const modelId = sonettoModelIdForProvider(provider)

    if (billing?.cookieHeader) {
      const estimate = estimateMaxCredits(modelId, `${system}\n${user}`, maxTokens)
      try {
        const balance = await getCreditBalance(billing.cookieHeader)
        if (balance < estimate) {
          const err = new Error(`积分不足（需要约 ${estimate}，当前 ${balance}）`)
          ;(err as Error & { statusCode?: number }).statusCode = 402
          throw err
        }
      } catch (e) {
        if (e instanceof Error && (e as Error & { statusCode?: number }).statusCode === 402) {
          throw e
        }
        // 余额查询失败不阻断（扣费时仍会校验）
      }
    }

    const { text, usage } = await completeSonetto(provider, system, user, maxTokens)

    if (billing) {
      await settleSonettoBilling({
        billing,
        modelId,
        system,
        user,
        maxTokens,
        usage,
      })
    }

    return text
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
