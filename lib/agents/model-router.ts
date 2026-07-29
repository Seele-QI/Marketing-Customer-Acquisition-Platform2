import {
  type CopywritingChatMessage,
  type CopywritingProviderCandidate,
} from "@/lib/llm/copywriting-router"
import { listSyncedEnterpriseAgentFastProviders } from "@/lib/llm/synced-providers"
import type { ModelRouteSnapshot } from "@/lib/agents/types"

export type AgentProviderCandidate = CopywritingProviderCandidate

export type AgentProviderFailure = {
  provider: string
  model: string
  status?: number
  reason: "http_error" | "network_error" | "missing_body" | "cancelled"
}

export type AgentCompletionResult =
  | {
      ok: true
      text: string
      route: ModelRouteSnapshot
      failures: AgentProviderFailure[]
    }
  | {
      ok: false
      code: "MODEL_NOT_CONFIGURED" | "CLOUD_MODEL_UNAVAILABLE" | "CANCELLED"
      failures: AgentProviderFailure[]
    }

const AGENT_PROVIDER_TIMEOUT_MS = 90_000

function chatCompletionsUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "")
  if (base.endsWith("/chat/completions")) return base
  if (!/\/v\d+$/i.test(base)) base = `${base}/v1`
  return `${base}/chat/completions`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object"
}

function extractText(body: unknown): string {
  if (!isRecord(body) || !Array.isArray(body.choices)) return ""
  const first = body.choices[0]
  if (!isRecord(first) || !isRecord(first.message)) return ""
  const content = first.message.content
  if (typeof content === "string") return content.trim()
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => (isRecord(part) && typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim()
}

async function fetchWithTimeout(input: {
  provider: AgentProviderCandidate
  messages: CopywritingChatMessage[]
  signal: AbortSignal
  fetchImpl: typeof fetch
}): Promise<Response> {
  const controller = new AbortController()
  const onAbort = () => controller.abort(input.signal.reason)
  input.signal.addEventListener("abort", onAbort, { once: true })
  const timeout = setTimeout(() => controller.abort(new Error("PROVIDER_TIMEOUT")), input.provider.timeoutMs)
  try {
    return await input.fetchImpl(input.provider.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.provider.apiKey}`,
      },
      body: JSON.stringify({
        model: input.provider.model,
        messages: input.messages,
        stream: false,
      }),
      signal: controller.signal,
      cache: "no-store",
    })
  } finally {
    clearTimeout(timeout)
    input.signal.removeEventListener("abort", onAbort)
  }
}

export function listAgentProviderCandidates(input: { hasImages: boolean }): AgentProviderCandidate[] {
  return listSyncedEnterpriseAgentFastProviders(input).map((provider) => ({
    source: "cloud",
    name: provider.name || `enterprise-agent-${provider.id}`,
    adapter: "openai_chat",
    url: chatCompletionsUrl(provider.base_url),
    apiKey: provider.api_key.trim(),
    model: provider.model.trim(),
    timeoutMs: AGENT_PROVIDER_TIMEOUT_MS,
  }))
}

export async function completeAgentTurn(input: {
  messages: CopywritingChatMessage[]
  hasImages?: boolean
  providers?: AgentProviderCandidate[]
  maxAttempts?: number
  signal: AbortSignal
  fetchImpl?: typeof fetch
}): Promise<AgentCompletionResult> {
  const providers =
    input.providers ?? listAgentProviderCandidates({ hasImages: Boolean(input.hasImages) })
  if (providers.length === 0) {
    return { ok: false, code: "MODEL_NOT_CONFIGURED", failures: [] }
  }

  const failures: AgentProviderFailure[] = []
  const maxAttempts = Math.max(1, Math.min(input.maxAttempts ?? providers.length, providers.length))
  const fetchImpl = input.fetchImpl ?? fetch

  for (const provider of providers.slice(0, maxAttempts)) {
    if (input.signal.aborted) {
      return { ok: false, code: "CANCELLED", failures }
    }
    try {
      const response = await fetchWithTimeout({
        provider,
        messages: input.messages,
        signal: input.signal,
        fetchImpl,
      })
      if (!response.ok) {
        failures.push({
          provider: provider.name,
          model: provider.model,
          status: response.status,
          reason: "http_error",
        })
        continue
      }
      const text = extractText(await response.json().catch(() => null))
      if (!text) {
        failures.push({
          provider: provider.name,
          model: provider.model,
          reason: "missing_body",
        })
        continue
      }
      return {
        ok: true,
        text,
        route: {
          source: provider.source,
          providerName: provider.name,
          model: provider.model,
          selectedAt: Date.now(),
          failuresBeforeSelection: failures.length,
        },
        failures,
      }
    } catch {
      if (input.signal.aborted) {
        return { ok: false, code: "CANCELLED", failures }
      }
      failures.push({
        provider: provider.name,
        model: provider.model,
        reason: "network_error",
      })
    }
  }

  return { ok: false, code: "CLOUD_MODEL_UNAVAILABLE", failures }
}
