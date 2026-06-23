/**
 * 算力计费框架（Cost Tracker）
 * ─────────────────────────────────────────────
 * 当前为轻量版：记录每次 AI 调用的 token 用量和成本。
 * 后续可扩展为完整的用户/租户计费系统（数据库 + Dashboard）。
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type CostRecord = {
  id: string
  timestamp: string
  feature: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** 成本（美元），按 DeepSeek 官方定价计算 */
  costUSD: number
  /** 请求耗时（ms） */
  durationMs: number
  /** 是否成功 */
  success: boolean
  /** 错误信息（如有） */
  error?: string
}

export type CostSummary = {
  totalCalls: number
  totalTokens: number
  totalCostUSD: number
  byFeature: Record<string, { calls: number; tokens: number; cost: number }>
  byModel: Record<string, { calls: number; tokens: number; cost: number }>
}

/* ------------------------------------------------------------------ */
/*  Pricing (USD per 1M tokens)                                        */
/* ------------------------------------------------------------------ */

const DEEPSEEK_PRICING: Record<string, { input: number; output: number }> = {
  "deepseek-chat": { input: 0.14, output: 0.28 },
  "deepseek-v4-pro": { input: 0.14, output: 0.28 },
  "deepseek-v4-flash": { input: 0.14, output: 0.28 },
  default: { input: 0.14, output: 0.28 },
}

/* ------------------------------------------------------------------ */
/*  In-memory store (replace with DB later)                            */
/* ------------------------------------------------------------------ */

const records: CostRecord[] = []
const MAX_RECORDS = 10_000

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

let costTrackerEnabled = true

export function setCostTrackerEnabled(enabled: boolean) {
  costTrackerEnabled = enabled
}

function getPricing(model: string) {
  return DEEPSEEK_PRICING[model] ?? DEEPSEEK_PRICING.default
}

export function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const pricing = getPricing(model)
  return (promptTokens / 1_000_000) * pricing.input + (completionTokens / 1_000_000) * pricing.output
}

export function recordCost(params: {
  feature: string
  model: string
  promptTokens: number
  completionTokens: number
  durationMs: number
  success: boolean
  error?: string
}): CostRecord {
  const totalTokens = params.promptTokens + params.completionTokens
  const record: CostRecord = {
    id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    feature: params.feature,
    model: params.model,
    promptTokens: params.promptTokens,
    completionTokens: params.completionTokens,
    totalTokens,
    costUSD: estimateCost(params.model, params.promptTokens, params.completionTokens),
    durationMs: params.durationMs,
    success: params.success,
    error: params.error,
  }

  if (costTrackerEnabled) {
    records.push(record)
    if (records.length > MAX_RECORDS) {
      records.splice(0, records.length - MAX_RECORDS)
    }
  }

  // Console log for dev visibility
  if (process.env.NODE_ENV === "development") {
    console.log(
      `[CostTracker] ${params.feature} | ${params.model} | ` +
        `${totalTokens} tokens | $${record.costUSD.toFixed(6)} | ` +
        `${params.durationMs}ms | ${params.success ? "OK" : "FAIL"}`,
    )
  }

  return record
}

export function getCostSummary(): CostSummary {
  const summary: CostSummary = {
    totalCalls: 0,
    totalTokens: 0,
    totalCostUSD: 0,
    byFeature: {},
    byModel: {},
  }

  for (const r of records) {
    summary.totalCalls++
    summary.totalTokens += r.totalTokens
    summary.totalCostUSD += r.costUSD

    if (!summary.byFeature[r.feature]) {
      summary.byFeature[r.feature] = { calls: 0, tokens: 0, cost: 0 }
    }
    summary.byFeature[r.feature].calls++
    summary.byFeature[r.feature].tokens += r.totalTokens
    summary.byFeature[r.feature].cost += r.costUSD

    if (!summary.byModel[r.model]) {
      summary.byModel[r.model] = { calls: 0, tokens: 0, cost: 0 }
    }
    summary.byModel[r.model].calls++
    summary.byModel[r.model].tokens += r.totalTokens
    summary.byModel[r.model].cost += r.costUSD
  }

  return summary
}

export function getRecentCosts(limit = 50): CostRecord[] {
  return records.slice(-limit).reverse()
}

/** 获取今日用量汇总 */
export function getTodayCostSummary(): CostSummary {
  const today = new Date().toISOString().slice(0, 10)
  const todayRecords = records.filter((r) => r.timestamp.startsWith(today))

  const summary: CostSummary = {
    totalCalls: 0,
    totalTokens: 0,
    totalCostUSD: 0,
    byFeature: {},
    byModel: {},
  }

  for (const r of todayRecords) {
    summary.totalCalls++
    summary.totalTokens += r.totalTokens
    summary.totalCostUSD += r.costUSD
  }

  return summary
}
