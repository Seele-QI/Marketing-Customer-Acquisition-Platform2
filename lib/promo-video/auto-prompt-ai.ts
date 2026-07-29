/**
 * 宣传视频 — Seedance 2.0 提示词自动生成
 * 顺序：ChatGPT → Claude → DeepSeek → 豆包
 */

import { deepseekChatCompletion } from "@/lib/deepseek-chat"
import { arkChatCompletionNonStream, isArkChatConfigured } from "@/lib/llm/ark-client"
import {
  DEFAULT_NEWAPI_CLAUDE_MODEL,
  DEFAULT_NEWAPI_GPT_MODEL,
  DOUBAO_SEED_21_MODEL_ID,
} from "@/lib/llm/model-registry"
import {
  isSonettoProviderConfigured,
  sonettoChatCompletion,
} from "@/lib/llm/sonetto-client"
import { getDeepseekApiKey, readServerEnv } from "@/lib/server-env"
import {
  PROMO_SEEDANCE_PROMPT_SYSTEM,
  buildPromoAutoPromptUserMessage,
  type PromoAutoPromptRequest,
} from "@/lib/promo-video/prompt-system"

export type PromoAutoPromptInput = {
  promo_script: string
  duration: number
  selected_count: number
  visual_style?: string
  has_audio_ref?: boolean
}

export type PromoAutoPromptResult =
  | { ok: true; prompt: string }
  | { ok: false; status: number; detail: string }

type PromoProvider = "sonetto_gpt" | "sonetto_claude" | "deepseek" | "doubao"

const PROMO_PROVIDER_ORDER: PromoProvider[] = [
  "sonetto_gpt",
  "sonetto_claude",
  "deepseek",
  "doubao",
]

export function buildPromoAutoPromptRequest(input: PromoAutoPromptInput): PromoAutoPromptRequest {
  return {
    promo_script: input.promo_script.trim(),
    duration: input.duration as PromoAutoPromptRequest["duration"],
    selected_count: Math.max(1, input.selected_count),
    visual_style: input.visual_style,
    has_audio_ref: input.has_audio_ref,
  }
}

function isPromoProviderConfigured(provider: PromoProvider): boolean {
  if (provider === "deepseek") return Boolean(getDeepseekApiKey())
  if (provider === "doubao") return isArkChatConfigured()
  return isSonettoProviderConfigured(provider)
}

export function isPromoAutoPromptAvailable(): boolean {
  return PROMO_PROVIDER_ORDER.some(isPromoProviderConfigured)
}

function gptModelId(): string {
  return DEFAULT_NEWAPI_GPT_MODEL
}

function claudeModelId(): string {
  return (
    readServerEnv("NEWAPI_CLAUDE_MODEL") ||
    readServerEnv("SONETTO_CLAUDE_MODEL") ||
    DEFAULT_NEWAPI_CLAUDE_MODEL
  )
}

async function callPromoProvider(
  provider: PromoProvider,
  system: string,
  user: string,
): Promise<PromoAutoPromptResult> {
  if (provider === "deepseek") {
    const result = await deepseekChatCompletion(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      120_000,
    )
    if (!result.ok) return result
    const prompt = result.text.trim()
    if (!prompt) return { ok: false, status: 502, detail: "AI 返回空提示词" }
    return { ok: true, prompt }
  }

  if (provider === "doubao") {
    const result = await arkChatCompletionNonStream({
      system,
      userParts: user,
      timeoutMs: 120_000,
      modelId: DOUBAO_SEED_21_MODEL_ID,
      maxTokens: 4096,
      temperature: 0.85,
    })
    if (!result.ok) return result
    const prompt = result.text.trim()
    if (!prompt) return { ok: false, status: 502, detail: "AI 返回空提示词" }
    return { ok: true, prompt }
  }

  const modelId = provider === "sonetto_gpt" ? gptModelId() : claudeModelId()
  const result = await sonettoChatCompletion({
    modelId,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    maxTokens: 4096,
    temperature: 0.85,
  })
  if (!result.ok) return result
  const prompt = result.text.trim()
  if (!prompt) return { ok: false, status: 502, detail: "AI 返回空提示词" }
  return { ok: true, prompt }
}

/** @deprecated 名称保留兼容 */
export async function generatePromoAutoPromptWithGpt(
  input: PromoAutoPromptInput,
): Promise<PromoAutoPromptResult> {
  return generatePromoAutoPrompt(input)
}

export async function generatePromoAutoPrompt(
  input: PromoAutoPromptInput,
): Promise<PromoAutoPromptResult> {
  if (!isPromoAutoPromptAvailable()) {
    return {
      ok: false,
      status: 503,
      detail:
        "未配置宣传提示词模型：请配置 NEWAPI 三要素、DEEPSEEK_API_KEY 或豆包 ARK_*",
    }
  }

  const script = input.promo_script.trim()
  if (!script) {
    return { ok: false, status: 400, detail: "请填写宣传文案" }
  }

  const duration = Number(input.duration)
  if (!Number.isFinite(duration) || duration < 15 || duration % 15 !== 0) {
    return { ok: false, status: 400, detail: "成片时长须为 15 秒的整数倍" }
  }

  const selectedCount = Number(input.selected_count)
  if (!Number.isFinite(selectedCount) || selectedCount < 1) {
    return { ok: false, status: 400, detail: "请至少选择 1 张分镜" }
  }

  const req = buildPromoAutoPromptRequest({ ...input, duration, selected_count: selectedCount })
  const userMessage = buildPromoAutoPromptUserMessage(req)
  const providers = PROMO_PROVIDER_ORDER.filter(isPromoProviderConfigured)
  const errors: string[] = []

  for (const provider of providers) {
    const result = await callPromoProvider(provider, PROMO_SEEDANCE_PROMPT_SYSTEM, userMessage)
    if (result.ok) return result
    errors.push(`${provider}: ${result.detail}`)
  }

  return {
    ok: false,
    status: 502,
    detail: errors.join(" → ") || "所有大模型均未能生成提示词",
  }
}
