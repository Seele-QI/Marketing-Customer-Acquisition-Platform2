import { readServerEnv } from "@/lib/server-env"

/**
 * 第三方模型渠道三要素校验：URL + Key + Model。
 * 半配置（有 Key 无 Model 等）视为无效，避免静默回退到代码默认模型。
 */

export type TriadParts = {
  label: string
  baseUrl: string
  apiKey: string
  model: string
  /** 用于报错文案的环境变量名 */
  baseUrlEnv?: string
  apiKeyEnv?: string
  modelEnv?: string
}

export type TriadOk = {
  ok: true
  baseUrl: string
  apiKey: string
  model: string
}

export type TriadErr = {
  ok: false
  detail: string
  missing: string[]
}

function trim(s: string): string {
  return (s || "").trim()
}

/** 强制三要素齐全；缺任一返回可读错误（含 env 名） */
export function requireTriad(input: TriadParts): TriadOk | TriadErr {
  const baseUrl = trim(input.baseUrl)
  const apiKey = trim(input.apiKey)
  const model = trim(input.model)
  const missing: string[] = []
  if (!baseUrl) missing.push(input.baseUrlEnv || "BASE_URL")
  if (!apiKey) missing.push(input.apiKeyEnv || "API_KEY")
  if (!model) missing.push(input.modelEnv || "MODEL")
  if (missing.length) {
    return {
      ok: false,
      missing,
      detail:
        `${input.label} 缺少 ${missing.join("、")}` +
        "（第三方模型渠道须同时配置 URL + Key + Model）",
    }
  }
  return { ok: true, baseUrl, apiKey, model }
}

/**
 * 可选档位：全部为空 → null（未配置）；
 * 任一非空但三要素不全 → null（半配置跳过）；
 * 齐全 → TriadOk。
 */
export function readOptionalTriad(input: TriadParts): TriadOk | null {
  const baseUrl = trim(input.baseUrl)
  const apiKey = trim(input.apiKey)
  const model = trim(input.model)
  if (!baseUrl && !apiKey && !model) return null
  const checked = requireTriad({ ...input, baseUrl, apiKey, model })
  if (!checked.ok) return null
  return checked
}

/** NewAPI 一档：URL + Key +（GPT 或 Claude 至少一个 Model） */
export type NewApiTierParts = {
  label: string
  baseUrl: string
  apiKey: string
  gptModel: string
  claudeModel: string
  baseUrlEnv: string
  apiKeyEnv: string
  gptModelEnv: string
  claudeModelEnv: string
}

export type NewApiTierOk = {
  ok: true
  baseUrl: string
  apiKey: string
  gptModel: string
  claudeModel: string
}

export function requireNewApiTier(input: NewApiTierParts): NewApiTierOk | TriadErr {
  const baseUrl = trim(input.baseUrl)
  const apiKey = trim(input.apiKey)
  const gptModel = trim(input.gptModel)
  const claudeModel = trim(input.claudeModel)
  const missing: string[] = []
  if (!baseUrl) missing.push(input.baseUrlEnv)
  if (!apiKey) missing.push(input.apiKeyEnv)
  if (!gptModel && !claudeModel) {
    missing.push(`${input.gptModelEnv} 或 ${input.claudeModelEnv}`)
  }
  if (missing.length) {
    return {
      ok: false,
      missing,
      detail:
        `${input.label} 缺少 ${missing.join("、")}` +
        "（第三方模型渠道须同时配置 URL + Key + Model）",
    }
  }
  return { ok: true, baseUrl, apiKey, gptModel, claudeModel }
}

/**
 * NewAPI 可选档：全空 → null；半配置 → null；齐全 → ok。
 */
export function readOptionalNewApiTier(input: NewApiTierParts): NewApiTierOk | null {
  const baseUrl = trim(input.baseUrl)
  const apiKey = trim(input.apiKey)
  const gptModel = trim(input.gptModel)
  const claudeModel = trim(input.claudeModel)
  if (!baseUrl && !apiKey && !gptModel && !claudeModel) return null
  const checked = requireNewApiTier({
    ...input,
    baseUrl,
    apiKey,
    gptModel,
    claudeModel,
  })
  if (!checked.ok) return null
  return checked
}

/** 诊断 primary NewAPI 半配置，供 503 文案 */
export function diagnoseNewApiPrimaryMisconfig(need: "gpt" | "claude" | "any"): string | null {
  const baseUrl = readServerEnv("NEWAPI_BASE_URL")
  const apiKey = readServerEnv("NEWAPI_KEY")
  const gptModel = readServerEnv("NEWAPI_GPT_MODEL")
  const claudeModel = readServerEnv("NEWAPI_CLAUDE_MODEL")
  if (!baseUrl && !apiKey && !gptModel && !claudeModel) {
    return (
      "未配置 NewAPI 三要素：NEWAPI_BASE_URL + NEWAPI_KEY + " +
      "NEWAPI_GPT_MODEL / NEWAPI_CLAUDE_MODEL"
    )
  }
  const missing: string[] = []
  if (!baseUrl) missing.push("NEWAPI_BASE_URL")
  if (!apiKey) missing.push("NEWAPI_KEY")
  if (need === "gpt" && !gptModel) missing.push("NEWAPI_GPT_MODEL")
  else if (need === "claude" && !claudeModel) missing.push("NEWAPI_CLAUDE_MODEL")
  else if (need === "any" && !gptModel && !claudeModel) {
    missing.push("NEWAPI_GPT_MODEL 或 NEWAPI_CLAUDE_MODEL")
  }
  if (!missing.length) return null
  return (
    `NewAPI primary 缺少 ${missing.join("、")}` +
    "（第三方模型渠道须同时配置 URL + Key + Model）"
  )
}
