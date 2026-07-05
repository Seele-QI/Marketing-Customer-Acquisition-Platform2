import {
  IP_POSITIONING_SYSTEM,
  buildPositioningUserMessage,
} from "@/lib/prompts/ip-positioning-prompts"
import type {
  ExtractedDocument,
  IpPositioningAnalysisMeta,
  IpPositioningIntake,
  IpPositioningReport,
} from "@/lib/ip-positioning-schema"
import {
  extractJsonFromText,
  validateIpPositioningReport,
} from "@/lib/ip-positioning-schema"
import { getSonettoModel } from "@/lib/llm/model-registry"
import { tokenCostYuan } from "@/lib/llm/pricing"
import { sonettoChatCompletion } from "@/lib/llm/sonetto-client"

export async function runIpPositioningAnalysis(input: {
  modelId: string
  intake: IpPositioningIntake
  documents: ExtractedDocument[]
}): Promise<
  | { ok: true; report: IpPositioningReport; meta: IpPositioningAnalysisMeta }
  | { ok: false; status: number; detail: string; rawText?: string }
> {
  const startTime = Date.now()
  const userMessage = buildPositioningUserMessage({
    intake: input.intake,
    documents: input.documents,
  })

  const messages = [
    { role: "system" as const, content: IP_POSITIONING_SYSTEM },
    { role: "user" as const, content: userMessage },
  ]

  const estimatedPromptTokens = Math.ceil((IP_POSITIONING_SYSTEM.length + userMessage.length) / 2)

  const result = await sonettoChatCompletion({
    modelId: input.modelId,
    messages,
    maxTokens: 8192,
    temperature: 0.7,
  })

  const durationMs = Date.now() - startTime
  const modelDef = getSonettoModel(input.modelId)
  const documentsUsed = input.documents.filter((d) => d.text.length > 0).length

  if (!result.ok) {
    return { ok: false, status: result.status, detail: result.detail }
  }

  const jsonStr = extractJsonFromText(result.text)
  let parsed: unknown
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return {
      ok: false,
      status: 502,
      detail: "AI 返回格式异常，请重试",
      rawText: result.text.slice(0, 500),
    }
  }

  if (!validateIpPositioningReport(parsed)) {
    return {
      ok: false,
      status: 502,
      detail: "AI 返回结构不完整，请重试",
      rawText: result.text.slice(0, 500),
    }
  }

  const promptTokens = result.usage?.promptTokens ?? estimatedPromptTokens
  const completionTokens =
    result.usage?.completionTokens ?? Math.ceil(result.text.length / 2)

  const costYuan = modelDef?.tokenPricesYuan
    ? tokenCostYuan({ promptTokens, completionTokens }, modelDef.tokenPricesYuan)
    : 0
  const estimatedCostUSD = (costYuan / 7.2).toFixed(6)

  return {
    ok: true,
    report: parsed,
    meta: {
      model: input.modelId,
      durationMs,
      promptTokens,
      completionTokens,
      estimatedCostUSD,
      documentsUsed,
    },
  }
}
