import { normalizeArkBaseUrl } from "@/lib/ark-images-api"
import { listArkChatEndpoints } from "@/lib/llm/ark-client"
import { DEFAULT_MAX_TOKENS } from "@/lib/llm/model-registry"
import { listNewApiRelayEndpoints, sonettoTimeoutMs } from "@/lib/llm/sonetto-client"
import { loadSyncedProviders } from "@/lib/llm/synced-providers"
import { getSyncedFeature } from "@/lib/llm/feature-catalog-sync"
import { getDeepseekApiKey, readServerEnv } from "@/lib/server-env"

export type CopywritingContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export type CopywritingChatMessage = {
  role: "system" | "user" | "assistant"
  content: string | CopywritingContentPart[]
}

export type CopywritingProviderCandidate = {
  source: "cloud" | "env"
  name: string
  adapter: "openai_chat" | "ark_chat" | "deepseek_chat"
  url: string
  apiKey: string
  model: string
  timeoutMs: number
}

export type CopywritingProviderFailure = {
  name: string
  model: string
  status?: number
  reason: "http_error" | "network_error" | "missing_body" | "client_aborted"
}

export type CopywritingStreamConnection =
  | {
      ok: true
      response: Response
      provider: CopywritingProviderCandidate
      failures: CopywritingProviderFailure[]
    }
  | { ok: false; failures: CopywritingProviderFailure[] }

const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions"
const DEFAULT_TEXT_MODEL = "deepseek-chat"
const DEFAULT_VISION_MODEL = "deepseek-v4-flash"
const DEFAULT_PROVIDER_TIMEOUT_MS = 90_000

function openAiChatCompletionsUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "")
  if (base.endsWith("/chat/completions")) return base
  if (!/\/v\d+$/i.test(base)) base = `${base}/v1`
  return `${base}/chat/completions`
}

function arkChatCompletionsUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "")
  if (trimmed.endsWith("/chat/completions")) return trimmed
  const base = normalizeArkBaseUrl(trimmed).replace(/\/+$/, "")
  return `${base}/chat/completions`
}

function listCloudProviders(featureId?: string): CopywritingProviderCandidate[] {
  const allProviders = loadSyncedProviders()
  const feature = featureId ? getSyncedFeature(featureId) : null
  if (feature && !feature.enabled) return []
  const providers = feature?.provider_ids?.length
    ? feature.provider_ids
        .map((id) => allProviders.find((provider) => provider.id === id))
        .filter((provider): provider is (typeof allProviders)[number] =>
          Boolean(provider),
        )
    : allProviders
  return providers
    .filter((provider) => {
      const kind = provider.kind.trim().toLowerCase()
      const adapter = provider.adapter.trim().toLowerCase()
      return (
        kind === "llm" &&
        (adapter === "openai_chat" || adapter === "ark_chat") &&
        Boolean(provider.model.trim())
      )
    })
    .map((provider) => {
      const adapter = provider.adapter.trim().toLowerCase() as "openai_chat" | "ark_chat"
      return {
        source: "cloud" as const,
        name: provider.name || `${adapter}_${provider.id}`,
        adapter,
        url:
          adapter === "ark_chat"
            ? arkChatCompletionsUrl(provider.base_url)
            : openAiChatCompletionsUrl(provider.base_url),
        apiKey: provider.api_key.trim(),
        model: provider.model.trim(),
        timeoutMs: adapter === "openai_chat" ? sonettoTimeoutMs() : DEFAULT_PROVIDER_TIMEOUT_MS,
      }
    })
}

function listDevelopmentFallbacks(hasImages: boolean): CopywritingProviderCandidate[] {
  const providers: CopywritingProviderCandidate[] = []
  const deepseekKey = getDeepseekApiKey()
  if (deepseekKey) {
    providers.push({
      source: "env",
      name: "deepseek",
      adapter: "deepseek_chat",
      url: DEEPSEEK_CHAT_URL,
      apiKey: deepseekKey,
      model:
        (hasImages ? readServerEnv("DEEPSEEK_VISION_MODEL") : readServerEnv("DEEPSEEK_CHAT_MODEL")) ||
        (hasImages ? DEFAULT_VISION_MODEL : DEFAULT_TEXT_MODEL),
      timeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
    })
  }

  for (const endpoint of listArkChatEndpoints()) {
    providers.push({
      source: "env",
      name: `ark:${endpoint.name}`,
      adapter: "ark_chat",
      url: arkChatCompletionsUrl(endpoint.baseUrl),
      apiKey: endpoint.apiKey,
      model: endpoint.model,
      timeoutMs: DEFAULT_PROVIDER_TIMEOUT_MS,
    })
  }

  for (const relay of listNewApiRelayEndpoints()) {
    if (relay.gptModel) {
      providers.push({
        source: "env",
        name: `newapi:${relay.name}:gpt`,
        adapter: "openai_chat",
        url: openAiChatCompletionsUrl(relay.baseUrl),
        apiKey: relay.apiKey,
        model: relay.gptModel,
        timeoutMs: sonettoTimeoutMs(),
      })
    }
    if (relay.claudeModel) {
      providers.push({
        source: "env",
        name: `newapi:${relay.name}:claude`,
        adapter: "openai_chat",
        url: openAiChatCompletionsUrl(relay.baseUrl),
        apiKey: relay.apiKey,
        model: relay.claudeModel,
        timeoutMs: sonettoTimeoutMs(),
      })
    }
  }

  return providers
}

export function listCopywritingProviderCandidates(input: {
  hasImages: boolean
  featureId?: string
}): CopywritingProviderCandidate[] {
  const cloudProviders = listCloudProviders(input.featureId)
  if (cloudProviders.length > 0) return cloudProviders
  if (readServerEnv("DESKTOP_RUNTIME") === "1") return []
  return listDevelopmentFallbacks(input.hasImages)
}

export async function connectCopywritingStream(input: {
  providers: CopywritingProviderCandidate[]
  messages: CopywritingChatMessage[]
  signal: AbortSignal
  maxTokens?: number
  fetchImpl?: typeof fetch
}): Promise<CopywritingStreamConnection> {
  const failures: CopywritingProviderFailure[] = []
  const fetchImpl = input.fetchImpl ?? fetch

  for (const provider of input.providers) {
    if (input.signal.aborted) {
      failures.push({
        name: provider.name,
        model: provider.model,
        reason: "client_aborted",
      })
      break
    }

    const timeoutSignal = AbortSignal.timeout(provider.timeoutMs)
    const signal = AbortSignal.any([input.signal, timeoutSignal])
    let response: Response
    try {
      response = await fetchImpl(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${provider.apiKey}`,
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify({
          model: provider.model,
          stream: true,
          messages: input.messages,
          max_tokens: input.maxTokens ?? DEFAULT_MAX_TOKENS,
        }),
        signal,
      })
    } catch {
      failures.push({
        name: provider.name,
        model: provider.model,
        reason: input.signal.aborted ? "client_aborted" : "network_error",
      })
      if (input.signal.aborted) break
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
    if (!response.body) {
      failures.push({
        name: provider.name,
        model: provider.model,
        status: response.status,
        reason: "missing_body",
      })
      continue
    }

    return { ok: true, response, provider, failures }
  }

  return { ok: false, failures }
}
