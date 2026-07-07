/**
 * 宣传视频 — Seedance 2.0 提示词自动生成（ChatGPT / Sonetto GPT）
 * 使用宣传视频专用叙事分镜运镜 skill：lib/promo-video/prompt-system.ts
 */

import { DEFAULT_NEWAPI_GPT_MODEL } from "@/lib/llm/model-registry"
import { isSonettoProviderConfigured, sonettoChatCompletion } from "@/lib/llm/sonetto-client"
import { readServerEnv } from "@/lib/server-env"
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

function gptModelId(): string {
  return (
    readServerEnv("NEWAPI_GPT_MODEL") ||
    readServerEnv("SONETTO_GPT_MODEL") ||
    DEFAULT_NEWAPI_GPT_MODEL
  )
}

export function buildPromoAutoPromptRequest(input: PromoAutoPromptInput): PromoAutoPromptRequest {
  return {
    promo_script: input.promo_script.trim(),
    duration: input.duration as PromoAutoPromptRequest["duration"],
    selected_count: Math.max(1, input.selected_count),
    visual_style: input.visual_style,
    has_audio_ref: input.has_audio_ref,
  }
}

export function isPromoAutoPromptAvailable(): boolean {
  return isSonettoProviderConfigured("sonetto_gpt")
}

export async function generatePromoAutoPromptWithGpt(
  input: PromoAutoPromptInput,
): Promise<PromoAutoPromptResult> {
  if (!isPromoAutoPromptAvailable()) {
    return {
      ok: false,
      status: 503,
      detail: "未配置 NEWAPI_KEY 或 SONETTO_GPT_API_KEY，无法调用 ChatGPT 生成提示词",
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

  const result = await sonettoChatCompletion({
    modelId: gptModelId(),
    messages: [
      { role: "system", content: PROMO_SEEDANCE_PROMPT_SYSTEM },
      { role: "user", content: userMessage },
    ],
    maxTokens: 4096,
    temperature: 0.85,
  })

  if (!result.ok) return result

  const prompt = result.text.trim()
  if (!prompt) {
    return { ok: false, status: 502, detail: "AI 返回空提示词" }
  }

  return { ok: true, prompt }
}
