/**
 * Sonetto（Claude / ChatGPT）与固定价模型的注册表。
 * 密钥不在此文件；仅元数据与成本价（¥）。
 */

export type LlmBillingMode = "token" | "per_call" | "fixed"

export type SonettoProvider = "sonetto_gpt" | "sonetto_claude"

export type TokenPriceYuanPer1M = {
  input: number
  output: number
  cacheRead?: number
  cacheCreate?: number
}

export type SonettoModelDef = {
  id: string
  label: string
  provider: SonettoProvider
  billing: "token" | "per_call"
  /** 按次：单次成本（¥） */
  pricePerCallYuan?: number
  /** 按 Token：每 1M tokens 成本（¥） */
  tokenPricesYuan?: TokenPriceYuanPer1M
}

export type FixedModelDef = {
  id: string
  label: string
  provider: "deepseek" | "ark"
  billing: "fixed"
  costCredits: number
}

/** 豆包 2.1 预置推理模型 ID（火山方舟） */
export const DOUBAO_SEED_21_MODEL_ID = "doubao-seed-2-1-pro-260628"

/** 1 积分 = ¥0.01；利润点 20% → 成本(¥) × 120 = 积分 */
export const CREDIT_YUAN = 0.01
export const PROFIT_MARGIN = 0.2
export const MARKUP = 1 + PROFIT_MARGIN
export const YUAN_TO_CREDIT = MARKUP / CREDIT_YUAN // 120
export const MIN_CREDITS = 1
export const MAX_LLM_COST = 50_000
export const DEFAULT_MAX_TOKENS = 4096

export const SONETTO_MODELS: readonly SonettoModelDef[] = [
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "sonetto_gpt",
    billing: "token",
    tokenPricesYuan: { input: 1.5, output: 9.0, cacheRead: 0.15 },
  },
  {
    id: "gpt-5.4",
    label: "GPT-5.4",
    provider: "sonetto_gpt",
    billing: "token",
    tokenPricesYuan: { input: 0.75, output: 4.5, cacheRead: 0.075 },
  },
  // 当前 Sonetto Claude 渠道仅开通 kiro；aws 按次型号返回 model_not_found，不列入可选
  {
    id: "[kiro]claude-opus-4-7",
    label: "Claude Opus 4.7",
    provider: "sonetto_claude",
    billing: "token",
    tokenPricesYuan: {
      input: 3.5,
      output: 17.5,
      cacheRead: 0.35,
      cacheCreate: 2.0,
    },
  },
] as const

export const FIXED_CHAT_MODELS: readonly FixedModelDef[] = [
  {
    id: "deepseek-chat",
    label: "DeepSeek",
    provider: "deepseek",
    billing: "fixed",
    costCredits: 3,
  },
  {
    id: DOUBAO_SEED_21_MODEL_ID,
    label: "豆包 2.1",
    provider: "ark",
    billing: "fixed",
    costCredits: 3,
  },
] as const

const SONETTO_BY_ID = new Map(SONETTO_MODELS.map((m) => [m.id, m]))
const FIXED_BY_ID = new Map(FIXED_CHAT_MODELS.map((m) => [m.id, m]))

export function getSonettoModel(modelId: string): SonettoModelDef | undefined {
  return SONETTO_BY_ID.get(modelId)
}

export function isSonettoModelId(modelId: string): boolean {
  return SONETTO_BY_ID.has(modelId)
}

export function getFixedChatModel(modelId: string): FixedModelDef | undefined {
  return FIXED_BY_ID.get(modelId)
}

export function isArkChatModelId(modelId: string): boolean {
  return FIXED_BY_ID.get(modelId)?.provider === "ark"
}

/** 展示用：成本价(¥/1M) × 120 → 积分/1M（已含利润） */
export function displayRatesPer1M(prices: TokenPriceYuanPer1M): {
  inputPer1M: number
  outputPer1M: number
  cacheReadPer1M?: number
  cacheCreatePer1M?: number
} {
  const rates: {
    inputPer1M: number
    outputPer1M: number
    cacheReadPer1M?: number
    cacheCreatePer1M?: number
  } = {
    inputPer1M: Math.round(prices.input * YUAN_TO_CREDIT),
    outputPer1M: Math.round(prices.output * YUAN_TO_CREDIT),
  }
  if (prices.cacheRead != null) {
    rates.cacheReadPer1M = Math.round(prices.cacheRead * YUAN_TO_CREDIT)
  }
  if (prices.cacheCreate != null) {
    rates.cacheCreatePer1M = Math.round(prices.cacheCreate * YUAN_TO_CREDIT)
  }
  return rates
}

export function perCallCredits(pricePerCallYuan: number): number {
  return Math.max(MIN_CREDITS, Math.ceil(pricePerCallYuan * YUAN_TO_CREDIT))
}
