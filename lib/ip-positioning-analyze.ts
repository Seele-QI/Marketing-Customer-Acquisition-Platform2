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
import { completeCloudCopywritingText } from "@/lib/geo/cloud-copywriting-completion"
import type {
  CopywritingProviderCandidate,
  CopywritingProviderFailure,
} from "@/lib/llm/copywriting-router"

type AnalysisErrorCode = "CLOUD_MODEL_NOT_READY" | "CLOUD_MODEL_UNAVAILABLE"

function parsePositioningReport(text: string): IpPositioningReport | null {
  try {
    const parsed: unknown = JSON.parse(extractJsonFromText(text))
    return validateIpPositioningReport(parsed) ? parsed : null
  } catch {
    return null
  }
}

export async function runIpPositioningAnalysis(input: {
  providers: CopywritingProviderCandidate[]
  intake: IpPositioningIntake
  documents: ExtractedDocument[]
  fetchImpl?: typeof fetch
}): Promise<
  | { ok: true; report: IpPositioningReport; meta: IpPositioningAnalysisMeta }
  | {
      ok: false
      status: 502 | 503
      code: AnalysisErrorCode
      detail: string
      failures?: CopywritingProviderFailure[]
    }
> {
  if (input.providers.length === 0) {
    return {
      ok: false,
      status: 503,
      code: "CLOUD_MODEL_NOT_READY",
      detail: "云端模型配置尚未同步，请稍后重试",
    }
  }

  const startTime = Date.now()
  const userMessage = buildPositioningUserMessage({
    intake: input.intake,
    documents: input.documents,
  })
  const completion = await completeCloudCopywritingText({
    providers: input.providers,
    messages: [
      { role: "system", content: IP_POSITIONING_SYSTEM },
      { role: "user", content: userMessage },
    ],
    maxTokens: 8192,
    validateText: (text) => parsePositioningReport(text) !== null,
    fetchImpl: input.fetchImpl,
  })

  if (!completion.ok) {
    return {
      ok: false,
      status: 502,
      code: "CLOUD_MODEL_UNAVAILABLE",
      detail: "云端模型暂时不可用，系统已尝试备用渠道，请稍后重试",
      failures: completion.failures,
    }
  }

  const report = parsePositioningReport(completion.text)
  if (!report) {
    return {
      ok: false,
      status: 502,
      code: "CLOUD_MODEL_UNAVAILABLE",
      detail: "云端模型未返回有效定位报告，请稍后重试",
      failures: completion.failures,
    }
  }

  const promptTokens = Math.ceil((IP_POSITIONING_SYSTEM.length + userMessage.length) / 2)
  const completionTokens = Math.ceil(completion.text.length / 2)
  return {
    ok: true,
    report,
    meta: {
      model: completion.provider.model,
      durationMs: Date.now() - startTime,
      promptTokens,
      completionTokens,
      estimatedCostUSD: "0.000000",
      documentsUsed: input.documents.filter((document) => document.text.length > 0).length,
    },
  }
}
