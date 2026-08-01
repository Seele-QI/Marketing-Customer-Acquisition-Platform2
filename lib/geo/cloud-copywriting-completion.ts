import { DEFAULT_MAX_TOKENS } from "@/lib/llm/model-registry"
import type {
  CopywritingChatMessage,
  CopywritingProviderCandidate,
  CopywritingProviderFailure,
} from "@/lib/llm/copywriting-router"

export type CloudCopywritingCompletion =
  | {
      ok: true
      text: string
      provider: CopywritingProviderCandidate
      failures: CopywritingProviderFailure[]
    }
  | { ok: false; failures: CopywritingProviderFailure[] }

function extractMessageText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return ""
  const choices = (payload as { choices?: unknown }).choices
  if (!Array.isArray(choices) || choices.length === 0) return ""
  const message = (choices[0] as { message?: unknown } | undefined)?.message
  if (!message || typeof message !== "object") return ""
  const content = (message as { content?: unknown }).content
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const value = (part as { text?: unknown }).text
      return typeof value === "string" ? value : ""
    })
    .join("")
    .trim()
}

/**
 * 按云端下发顺序执行非流式文案模型调用。
 * 单渠道错误只记录不抛出，调用方可在所有备选渠道耗尽后统一返回预案错误。
 */
export async function completeCloudCopywritingText(input: {
  providers: CopywritingProviderCandidate[]
  messages: CopywritingChatMessage[]
  maxTokens?: number
  validateText?: (text: string) => boolean
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}): Promise<CloudCopywritingCompletion> {
  const failures: CopywritingProviderFailure[] = []
  const fetchImpl = input.fetchImpl ?? fetch

  for (const provider of input.providers) {
    if (input.signal?.aborted) {
      failures.push({
        name: provider.name,
        model: provider.model,
        reason: "client_aborted",
      })
      break
    }

    const timeoutSignal = AbortSignal.timeout(provider.timeoutMs)
    const signal = input.signal
      ? AbortSignal.any([input.signal, timeoutSignal])
      : timeoutSignal
    let response: Response
    try {
      response = await fetchImpl(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          stream: false,
          messages: input.messages,
          max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        }),
        signal,
      })
    } catch {
      failures.push({
        name: provider.name,
        model: provider.model,
        reason: input.signal?.aborted ? "client_aborted" : "network_error",
      })
      if (input.signal?.aborted) break
      continue
    }

    if (!response.ok) {
      failures.push({
        name: provider.name,
        model: provider.model,
        status: response.status,
        reason: "http_error",
      })
      await response.body?.cancel().catch(() => {})
      continue
    }

    let text = ""
    try {
      text = extractMessageText(await response.json())
    } catch {
      // 无法解析的成功响应与空响应使用同一可恢复故障分类。
    }
    if (!text || (input.validateText && !input.validateText(text))) {
      failures.push({
        name: provider.name,
        model: provider.model,
        status: response.status,
        reason: "missing_body",
      })
      continue
    }

    return { ok: true, text, provider, failures }
  }

  return { ok: false, failures }
}
