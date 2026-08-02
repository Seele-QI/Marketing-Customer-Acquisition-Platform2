import { completeCloudCopywritingText } from "@/lib/geo/cloud-copywriting-completion"
import type { CopywritingProviderCandidate } from "@/lib/llm/copywriting-router"

export type ArticleCloudCompletionError = Error & {
  code: "CLOUD_MODEL_NOT_READY" | "CLOUD_MODEL_UNAVAILABLE"
  statusCode: 503 | 502
  failures?: { name: string; model: string; status?: number; reason: string }[]
}

function cloudError(
  code: ArticleCloudCompletionError["code"],
  message: string,
  failures?: ArticleCloudCompletionError["failures"],
): ArticleCloudCompletionError {
  const error = new Error(message) as ArticleCloudCompletionError
  error.code = code
  error.statusCode = code === "CLOUD_MODEL_NOT_READY" ? 503 : 502
  error.failures = failures
  return error
}

/** 云端下发模型顺序调用；只有拿到有效正文的渠道才进入计费。 */
export async function completeCloudArticleText(input: {
  providers: CopywritingProviderCandidate[]
  system: string
  user: string
  maxTokens?: number
  validateText?: (text: string) => boolean
  signal?: AbortSignal
  fetchImpl?: typeof fetch
  maxRounds?: number
  retryDelayMs?: number
  settleBilling?: (provider: CopywritingProviderCandidate) => Promise<void>
}): Promise<string> {
  if (input.providers.length === 0) {
    throw cloudError(
      "CLOUD_MODEL_NOT_READY",
      "云端模型配置尚未同步，请稍后重试",
    )
  }

  const result = await completeCloudCopywritingText({
    providers: input.providers,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user },
    ],
    maxTokens: input.maxTokens,
    validateText: input.validateText,
    signal: input.signal,
    fetchImpl: input.fetchImpl,
    maxRounds: input.maxRounds ?? 3,
    retryDelayMs: input.retryDelayMs,
  })

  if (!result.ok) {
    throw cloudError(
      "CLOUD_MODEL_UNAVAILABLE",
      "云端生成服务繁忙，系统已尝试备用渠道，请稍后重试",
      result.failures,
    )
  }

  await input.settleBilling?.(result.provider)
  return result.text
}
