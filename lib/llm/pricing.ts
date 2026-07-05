import {
  DEFAULT_MAX_TOKENS,
  MIN_CREDITS,
  YUAN_TO_CREDIT,
  getSonettoModel,
  perCallCredits,
  type SonettoModelDef,
  type TokenPriceYuanPer1M,
} from "@/lib/llm/model-registry"

export type LlmUsage = {
  promptTokens: number
  completionTokens: number
  cacheReadTokens?: number
  cacheCreationTokens?: number
}

/** 成本(¥) → 积分：ceil(yuan * 120)，最少 1 */
export function yuanToCredits(costYuan: number): number {
  if (!Number.isFinite(costYuan) || costYuan <= 0) return MIN_CREDITS
  return Math.max(MIN_CREDITS, Math.ceil(costYuan * YUAN_TO_CREDIT))
}

export function tokenCostYuan(
  usage: LlmUsage,
  prices: TokenPriceYuanPer1M,
): number {
  const prompt = Math.max(0, usage.promptTokens)
  const completion = Math.max(0, usage.completionTokens)
  const cacheRead = Math.max(0, usage.cacheReadTokens ?? 0)
  const cacheCreate = Math.max(0, usage.cacheCreationTokens ?? 0)
  return (
    (prompt / 1e6) * prices.input +
    (completion / 1e6) * prices.output +
    (cacheRead / 1e6) * (prices.cacheRead ?? 0) +
    (cacheCreate / 1e6) * (prices.cacheCreate ?? 0)
  )
}

export function settleCreditsForModel(
  model: SonettoModelDef,
  usage: LlmUsage | null,
): number {
  if (model.billing === "per_call") {
    return perCallCredits(model.pricePerCallYuan ?? 0)
  }
  const prices = model.tokenPricesYuan
  if (!prices) return MIN_CREDITS
  if (!usage) return MIN_CREDITS
  return yuanToCredits(tokenCostYuan(usage, prices))
}

export function settleCredits(modelId: string, usage: LlmUsage | null): number {
  const model = getSonettoModel(modelId)
  if (!model) {
    throw new Error(`未知 Sonetto 模型: ${modelId}`)
  }
  return settleCreditsForModel(model, usage)
}

/**
 * 粗估输入 tokens：CJK 约 1 token/字，其它约 4 字符/token。
 */
export function estimateInputTokens(text: string): number {
  if (!text) return 1
  let tokens = 0
  for (const ch of text) {
    if (/[\u4e00-\u9fff\u3400-\u4dbf]/.test(ch)) tokens += 1
    else tokens += 0.25
  }
  return Math.max(1, Math.ceil(tokens))
}

/**
 * 预检上限：按次 = 固定价；按 Token = 输入粗估 + max_tokens 输出上限。
 * 无 usage 结算时也用此值扣费（防白嫖）。
 */
export function estimateMaxCredits(
  modelId: string,
  inputText: string,
  maxTokens: number = DEFAULT_MAX_TOKENS,
): number {
  const model = getSonettoModel(modelId)
  if (!model) {
    throw new Error(`未知 Sonetto 模型: ${modelId}`)
  }
  if (model.billing === "per_call") {
    return perCallCredits(model.pricePerCallYuan ?? 0)
  }
  const prices = model.tokenPricesYuan
  if (!prices) return MIN_CREDITS
  const promptTokens = estimateInputTokens(inputText)
  const completionTokens = Math.max(1, maxTokens)
  return yuanToCredits(
    tokenCostYuan(
      { promptTokens, completionTokens, cacheReadTokens: 0, cacheCreationTokens: 0 },
      prices,
    ),
  )
}

/** 从 OpenAI 兼容 usage 对象解析 */
export function parseOpenAiUsage(raw: unknown): LlmUsage | null {
  if (!raw || typeof raw !== "object") return null
  const u = raw as Record<string, unknown>
  const prompt =
    typeof u.prompt_tokens === "number"
      ? u.prompt_tokens
      : typeof u.input_tokens === "number"
        ? u.input_tokens
        : null
  const completion =
    typeof u.completion_tokens === "number"
      ? u.completion_tokens
      : typeof u.output_tokens === "number"
        ? u.output_tokens
        : null
  if (prompt == null && completion == null) return null

  const details =
    u.prompt_tokens_details && typeof u.prompt_tokens_details === "object"
      ? (u.prompt_tokens_details as Record<string, unknown>)
      : null

  const cacheRead =
    typeof u.cache_read_input_tokens === "number"
      ? u.cache_read_input_tokens
      : typeof details?.cached_tokens === "number"
        ? details.cached_tokens
        : 0
  const cacheCreate =
    typeof u.cache_creation_input_tokens === "number"
      ? u.cache_creation_input_tokens
      : 0

  return {
    promptTokens: Math.max(0, prompt ?? 0),
    completionTokens: Math.max(0, completion ?? 0),
    cacheReadTokens: Math.max(0, cacheRead),
    cacheCreationTokens: Math.max(0, cacheCreate),
  }
}
