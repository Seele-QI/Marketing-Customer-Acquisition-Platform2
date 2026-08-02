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
  maxRounds?: number
  retryDelayMs?: number
}): Promise<CloudCopywritingCompletion> {
  const failures: CopywritingProviderFailure[] = []
  const fetchImpl = input.fetchImpl ?? fetch
  const maxRounds = Math.max(1, Math.min(3, input.maxRounds ?? 1))
  const retryDelayMs = Math.max(0, input.retryDelayMs ?? 800)
  const permanentlyFailed = new Set<string>()

  const providerKey = (provider: CopywritingProviderCandidate) =>
    `${provider.url}\n${provider.model}`
  const transientStatus = (status: number) =>
    status === 408 || status === 409 || status === 425 || status === 429 || status >= 500

  for (let round = 0; round < maxRounds; round += 1) {
    let sawTransientFailure = false

    for (const provider of input.providers) {
      if (permanentlyFailed.has(providerKey(provider))) continue
      if (input.signal?.aborted) {
        failures.push({
          name: provider.name,
          model: provider.model,
          reason: "client_aborted",
        })
        return { ok: false, failures }
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
        if (input.signal?.aborted) return { ok: false, failures }
        sawTransientFailure = true
        if (timeoutSignal.aborted) permanentlyFailed.add(providerKey(provider))
        continue
      }

      if (!response.ok) {
        failures.push({
          name: provider.name,
          model: provider.model,
          status: response.status,
          reason: "http_error",
        })
        if (transientStatus(response.status)) sawTransientFailure = true
        else permanentlyFailed.add(providerKey(provider))
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
        sawTransientFailure = true
        continue
      }

      return { ok: true, text, provider, failures }
    }

    if (
      round + 1 < maxRounds &&
      sawTransientFailure &&
      permanentlyFailed.size < input.providers.length
    ) {
      if (retryDelayMs > 0) {
        await new Promise<void>((resolve) =>
          setTimeout(resolve, retryDelayMs * (round + 1)),
        )
      }
      continue
    }
    break
  }

  return { ok: false, failures }
}
