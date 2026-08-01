import { listCopywritingProviderCandidates } from "@/lib/llm/copywriting-router"

export type MemoryExtractionProvider = {
  name: string
  url: string
  apiKey: string
  model: string
  timeoutMs: number
}

export type MemoryObservationInput = {
  id: string
  scope: "copywriting" | "positioning" | "geo"
  text: string
}

export type ExtractedMemoryOperation = {
  operation: "create" | "reinforce" | "supersede" | "ignore"
  scope: "global" | "copywriting" | "positioning" | "geo"
  category: "identity" | "business" | "goal" | "preference" | "constraint" | "fact"
  memoryKey: string
  value: string | string[]
  confidence: number
  stable: boolean
  evidence: string
}

export type MemoryExtractionResult =
  | {
      ok: true
      operations: ExtractedMemoryOperation[]
      provider: MemoryExtractionProvider
      failures: Array<{ name: string; status?: number; reason: string }>
    }
  | {
      ok: false
      operations: []
      failures: Array<{ name: string; status?: number; reason: string }>
    }

const SYSTEM_PROMPT = `你是长期记忆提取器。只分析“用户原话”，不得把助手回复、推断或临时任务写成事实。
输出严格 JSON：{"operations":[...]}
每个 operation 只能包含 operation、scope、category、memoryKey、value、confidence、stable、evidence。
operation: create | reinforce | supersede | ignore
scope: global | copywriting | positioning | geo
category: identity | business | goal | preference | constraint | fact
仅保存稳定的身份、业务、长期目标、内容偏好、明确禁忌和稳定事实。一次性写作要求必须 ignore。
不得保存手机号、身份证、银行卡、密码、密钥、令牌或其他敏感信息。
evidence 必须是用户原话的短摘录。没有可信信息时返回 {"operations":[]}.`

const OPERATIONS = new Set(["create", "reinforce", "supersede", "ignore"])
const SCOPES = new Set(["global", "copywriting", "positioning", "geo"])
const CATEGORIES = new Set(["identity", "business", "goal", "preference", "constraint", "fact"])
const OPERATION_KEYS = new Set([
  "operation",
  "scope",
  "category",
  "memoryKey",
  "value",
  "confidence",
  "stable",
  "evidence",
])

function invalid(): never {
  throw new Error("INVALID_MEMORY_EXTRACTION")
}

export function validateMemoryOperations(value: unknown): ExtractedMemoryOperation[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid()
  const root = value as Record<string, unknown>
  if (Object.keys(root).some((key) => key !== "operations") || !Array.isArray(root.operations)) {
    invalid()
  }
  if (root.operations.length > 50) invalid()

  return root.operations.map((raw) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid()
    const row = raw as Record<string, unknown>
    if (Object.keys(row).some((key) => !OPERATION_KEYS.has(key))) invalid()
    if (!OPERATIONS.has(String(row.operation))) invalid()
    if (!SCOPES.has(String(row.scope))) invalid()
    if (!CATEGORIES.has(String(row.category))) invalid()
    if (typeof row.memoryKey !== "string" || !row.memoryKey.trim() || row.memoryKey.length > 80) invalid()
    const validValue =
      typeof row.value === "string" ||
      (Array.isArray(row.value) && row.value.length <= 20 && row.value.every((item) => typeof item === "string"))
    if (!validValue) invalid()
    if (typeof row.confidence !== "number" || row.confidence < 0 || row.confidence > 1) invalid()
    if (typeof row.stable !== "boolean") invalid()
    if (typeof row.evidence !== "string" || row.evidence.length > 1000) invalid()
    return {
      operation: row.operation,
      scope: row.scope,
      category: row.category,
      memoryKey: row.memoryKey.trim(),
      value: row.value,
      confidence: row.confidence,
      stable: row.stable,
      evidence: row.evidence.trim(),
    } as ExtractedMemoryOperation
  })
}

function parseModelContent(payload: unknown): ExtractedMemoryOperation[] {
  const content = (payload as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]
    ?.message?.content
  if (typeof content !== "string") invalid()
  const clean = content.replace(/```(?:json)?\s*/gi, "").replace(/```\s*/g, "").trim()
  return validateMemoryOperations(JSON.parse(clean) as unknown)
}

export function listMemoryExtractionProviders(): MemoryExtractionProvider[] {
  return listCopywritingProviderCandidates({ hasImages: false }).map((provider) => ({
    name: provider.name,
    url: provider.url,
    apiKey: provider.apiKey,
    model: provider.model,
    timeoutMs: provider.timeoutMs,
  }))
}

export async function extractMemoryOperations(input: {
  providers?: MemoryExtractionProvider[]
  observations: MemoryObservationInput[]
  signal?: AbortSignal
  fetchImpl?: typeof fetch
}): Promise<MemoryExtractionResult> {
  const providers = input.providers ?? listMemoryExtractionProviders()
  const fetchImpl = input.fetchImpl ?? fetch
  const failures: Array<{ name: string; status?: number; reason: string }> = []
  const observations = input.observations.slice(0, 50).map((row) => ({
    id: row.id,
    scope: row.scope,
    text: row.text.slice(0, 12_000),
  }))

  for (const provider of providers) {
    if (input.signal?.aborted) break
    const timeoutSignal = AbortSignal.timeout(provider.timeoutMs)
    const signal = input.signal ? AbortSignal.any([input.signal, timeoutSignal]) : timeoutSignal
    let response: Response
    try {
      response = await fetchImpl(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: provider.model,
          stream: false,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify({ observations }) },
          ],
        }),
        signal,
      })
    } catch {
      failures.push({ name: provider.name, reason: input.signal?.aborted ? "aborted" : "network_error" })
      if (input.signal?.aborted) break
      continue
    }
    if (!response.ok) {
      failures.push({ name: provider.name, status: response.status, reason: "http_error" })
      continue
    }
    try {
      const operations = parseModelContent(await response.json())
      return { ok: true, operations, provider, failures }
    } catch {
      failures.push({ name: provider.name, status: response.status, reason: "invalid_response" })
    }
  }
  return { ok: false, operations: [], failures }
}
