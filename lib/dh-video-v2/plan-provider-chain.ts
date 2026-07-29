export type PlanProviderCallResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; detail: string }

type PlanProviderChainInput<P extends string, T> = {
  providers: readonly P[]
  providerTimeoutMs: number
  totalTimeoutMs: number
  call: (provider: P, timeoutMs: number) => Promise<PlanProviderCallResult<T>>
  now?: () => number
}

export type PlanProviderChainResult<P extends string, T> =
  | { ok: true; provider: P; value: T; errors: string[] }
  | { ok: false; status: number; detail: string; errors: string[] }

/**
 * 有总预算的顺序回退。每次调用拿到“单渠道上限”和“剩余总预算”中的较小值，
 * 防止一个失效渠道把后续备选全部堵住。
 */
export async function runDhV2PlanProviderChain<P extends string, T>(
  input: PlanProviderChainInput<P, T>,
): Promise<PlanProviderChainResult<P, T>> {
  const now = input.now ?? Date.now
  const startedAt = now()
  const errors: string[] = []
  let lastStatus = 502

  for (const provider of input.providers) {
    const elapsed = Math.max(0, now() - startedAt)
    const remainingMs = input.totalTimeoutMs - elapsed
    if (remainingMs <= 0) {
      errors.push(`总耗时已达到 ${input.totalTimeoutMs}ms`)
      break
    }

    const timeoutMs = Math.max(1, Math.min(input.providerTimeoutMs, remainingMs))
    const result = await input.call(provider, timeoutMs)
    if (result.ok) {
      return { ok: true, provider, value: result.value, errors }
    }
    lastStatus = result.status
    errors.push(`${provider}: ${result.detail}`)
  }

  return {
    ok: false,
    status: lastStatus,
    detail: errors.join("；") || "所有大模型均未能生成分镜",
    errors,
  }
}

/** 分镜 JSON 的输出上限随段数增长，避免单段任务仍请求 8192 tokens。 */
export function calculateDhV2PlanMaxTokens(segmentCount: number): number {
  const count = Number.isFinite(segmentCount) ? Math.max(1, Math.floor(segmentCount)) : 1
  return Math.min(6_144, Math.max(2_048, count * 1_200))
}

