import { normalizeArkBaseUrl } from "@/lib/ark-images-api"
import { getSyncedFeature } from "@/lib/llm/feature-catalog-sync"
import { loadSyncedProviders, type SyncedProvider } from "@/lib/llm/synced-providers"

export type CloudChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }

export type CloudChatMessage = {
  role: "system" | "user" | "assistant"
  content: string | CloudChatContentPart[]
}

export type CloudFeatureProviderCandidate = {
  id: number
  name: string
  adapter: "openai_chat" | "ark_chat"
  url: string
  apiKey: string
  model: string
  supportsImages: boolean
}

export type CloudFeatureProviderFailure = {
  id: number
  name: string
  model: string
  status: number
  detail: string
}

export type CloudFeatureCompletionResult =
  | {
      ok: true
      text: string
      provider: CloudFeatureProviderCandidate
      failures: CloudFeatureProviderFailure[]
    }
  | {
      ok: false
      status: number
      detail: string
      failures: CloudFeatureProviderFailure[]
    }

function openAiChatCompletionsUrl(raw: string): string {
  let base = raw.trim().replace(/\/+$/, "")
  if (base.endsWith("/chat/completions")) return base
  if (!/\/v\d+$/i.test(base)) base = `${base}/v1`
  return `${base}/chat/completions`
}

function arkChatCompletionsUrl(raw: string): string {
  const trimmed = raw.trim().replace(/\/+$/, "")
  if (trimmed.endsWith("/chat/completions")) return trimmed
  return `${normalizeArkBaseUrl(trimmed).replace(/\/+$/, "")}/chat/completions`
}

function toCandidate(provider: SyncedProvider): CloudFeatureProviderCandidate | null {
  if (provider.kind.trim().toLowerCase() !== "llm") return null
  const adapter = provider.adapter.trim().toLowerCase()
  if (adapter !== "openai_chat" && adapter !== "ark_chat") return null
  const model = provider.model.trim()
  if (!model) return null

  return {
    id: provider.id,
    name: provider.name || `${adapter}_${provider.id}`,
    adapter,
    url:
      adapter === "ark_chat"
        ? arkChatCompletionsUrl(provider.base_url)
        : openAiChatCompletionsUrl(provider.base_url),
    apiKey: provider.api_key.trim(),
    model,
    supportsImages:
      provider.extra?.supports_images === true || adapter === "ark_chat",
  }
}

/**
 * 返回某个功能实际绑定的云端模型。存在 provider_ids 时严格按绑定顺序，
 * 不把本地环境变量或硬编码模型偷偷追加到回退链。
 */
export function listCloudFeatureProviderCandidates(
  featureId: string,
): CloudFeatureProviderCandidate[] {
  const providers = loadSyncedProviders()
  const feature = getSyncedFeature(featureId)
  const ordered =
    feature?.provider_ids?.length
      ? feature.provider_ids
          .map((id) => providers.find((provider) => provider.id === id))
          .filter((provider): provider is SyncedProvider => Boolean(provider))
      : providers

  return ordered
    .map(toCandidate)
    .filter((candidate): candidate is CloudFeatureProviderCandidate => Boolean(candidate))
}

function withoutUnsupportedImages(messages: CloudChatMessage[]): CloudChatMessage[] {
  return messages.map((message) => {
    if (typeof message.content === "string") return message
    const text = message.content
      .filter((part): part is Extract<CloudChatContentPart, { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join("\n")
    return { ...message, content: text }
  })
}

function errorMessage(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const cause = error.cause
  if (cause && typeof cause === "object") {
    const record = cause as { code?: unknown; message?: unknown }
    const code = String(record.code || "").trim()
    const message = String(record.message || "").trim()
    if (code || message) return [error.message, code, message].filter(Boolean).join(": ")
  }
  return error.message
}

async function responseErrorText(response: Response): Promise<string> {
  const raw = (await response.text().catch(() => "")).trim()
  if (!raw) return response.statusText || "empty response"
  try {
    const data = JSON.parse(raw) as {
      error?: { message?: unknown }
      message?: unknown
      detail?: unknown
    }
    return String(data.error?.message || data.message || data.detail || raw).slice(0, 500)
  } catch {
    return raw.slice(0, 500)
  }
}

function completionText(data: unknown): string {
  const root = data as {
    choices?: Array<{ message?: { content?: unknown }; text?: unknown }>
  }
  const content = root.choices?.[0]?.message?.content ?? root.choices?.[0]?.text
  if (typeof content === "string") return content.trim()
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text?: unknown }).text || "")
          : "",
      )
      .join("")
      .trim()
  }
  return ""
}

export async function completeCloudFeatureChat(input: {
  providers: CloudFeatureProviderCandidate[]
  messages: CloudChatMessage[]
  maxTokens: number
  timeoutMs: number
  temperature?: number
  fetchImpl?: typeof fetch
}): Promise<CloudFeatureCompletionResult> {
  const fetchImpl = input.fetchImpl ?? fetch
  const failures: CloudFeatureProviderFailure[] = []

  for (const provider of input.providers) {
    const messages = provider.supportsImages
      ? input.messages
      : withoutUnsupportedImages(input.messages)
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
          messages,
          stream: false,
          max_tokens: input.maxTokens,
          temperature: input.temperature,
        }),
        signal: AbortSignal.timeout(input.timeoutMs),
      })
    } catch (error) {
      failures.push({
        id: provider.id,
        name: provider.name,
        model: provider.model,
        status: 502,
        detail: `网络错误: ${errorMessage(error)}`,
      })
      continue
    }

    if (!response.ok) {
      failures.push({
        id: provider.id,
        name: provider.name,
        model: provider.model,
        status: response.status,
        detail: `HTTP ${response.status}: ${await responseErrorText(response)}`,
      })
      continue
    }

    const text = completionText(await response.json().catch(() => null))
    if (!text) {
      failures.push({
        id: provider.id,
        name: provider.name,
        model: provider.model,
        status: 502,
        detail: "响应中没有可用的模型输出",
      })
      continue
    }
    return { ok: true, text, provider, failures }
  }

  const lastStatus = failures.at(-1)?.status || 502
  return {
    ok: false,
    status: lastStatus,
    detail:
      failures
        .map((failure) => `${failure.name}(${failure.model}): ${failure.detail}`)
        .join("；") || "云端未下发可用模型",
    failures,
  }
}
