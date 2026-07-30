/**
 * 宣传视频 — Seedance 2.0 提示词自动生成。
 * URL、Key、Model 与优先级完全由云端模型配置下发。
 */

import {
  completeCloudFeatureChat,
  listCloudFeatureProviderCandidates,
} from "@/lib/llm/cloud-feature-completion"
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

const PROMO_FEATURE_ID = "video.promo.storyboard"
const PROMO_TIMEOUT_MS = 120_000

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
  return listCloudFeatureProviderCandidates(PROMO_FEATURE_ID).length > 0
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

  const providers = listCloudFeatureProviderCandidates(PROMO_FEATURE_ID)
  if (providers.length === 0) {
    return {
      ok: false,
      status: 503,
      detail: "云端未给宣传视频分镜功能下发可用模型，请在模型配置中心绑定并启用模型。",
    }
  }

  const req = buildPromoAutoPromptRequest({ ...input, duration, selected_count: selectedCount })
  const userMessage = buildPromoAutoPromptUserMessage(req)
  const result = await completeCloudFeatureChat({
    providers,
    messages: [
      { role: "system", content: PROMO_SEEDANCE_PROMPT_SYSTEM },
      { role: "user", content: userMessage },
    ],
    maxTokens: 4096,
    timeoutMs: PROMO_TIMEOUT_MS,
    temperature: 0.85,
  })
  if (!result.ok) return result
  return { ok: true, prompt: result.text }
}
