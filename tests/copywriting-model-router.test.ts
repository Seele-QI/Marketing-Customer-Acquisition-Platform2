import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  connectCopywritingStream,
  listCopywritingProviderCandidates,
  type CopywritingChatMessage,
  type CopywritingProviderCandidate,
} from "../lib/llm/copywriting-router.ts"

const ENV_KEYS = [
  "MODEL_PROVIDERS_JSON_B64",
  "FEATURE_CATALOG_JSON_B64",
  "DESKTOP_RUNTIME",
  "DEEPSEEK_API_KEY",
  "DEEPSEEK_CHAT_MODEL",
  "DEEPSEEK_VISION_MODEL",
  "ARK_API_KEY",
  "ARK_API_SECRET",
  "ARK_CHAT_MODEL",
  "ARK_ENDPOINT_ID",
  "ARK_MODEL",
  "ARK_BASE_URL",
  "NEWAPI_BASE_URL",
  "NEWAPI_KEY",
  "NEWAPI_GPT_MODEL",
  "NEWAPI_CLAUDE_MODEL",
] as const

const saved = new Map<string, string | undefined>()

function setEnv(name: string, value: string | undefined) {
  if (!saved.has(name)) saved.set(name, process.env[name])
  if (value === undefined) delete process.env[name]
  else process.env[name] = value
}

function clearRoutingEnv() {
  for (const key of ENV_KEYS) setEnv(key, undefined)
}

function setSyncedProviders(providers: unknown[]) {
  setEnv(
    "MODEL_PROVIDERS_JSON_B64",
    Buffer.from(JSON.stringify({ providers }), "utf8").toString("base64"),
  )
}

function setSyncedFeatures(features: unknown[]) {
  setEnv(
    "FEATURE_CATALOG_JSON_B64",
    Buffer.from(JSON.stringify({ features }), "utf8").toString("base64"),
  )
}

afterEach(() => {
  for (const [key, value] of saved) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  saved.clear()
})

function candidate(overrides: Partial<CopywritingProviderCandidate>): CopywritingProviderCandidate {
  return {
    source: "cloud",
    name: "provider",
    adapter: "openai_chat",
    url: "https://llm.example/v1/chat/completions",
    apiKey: "secret-key",
    model: "gpt-cloud",
    timeoutMs: 5_000,
    ...overrides,
  }
}

describe("copywriting provider candidates", () => {
  it("uses supported cloud LLM providers in global priority order", () => {
    clearRoutingEnv()
    setSyncedProviders([
      {
        id: 20,
        kind: "llm",
        name: "openai-second",
        adapter: "openai_chat",
        base_url: "https://openai.example",
        api_key: "sk-openai",
        model: "gpt-cloud",
        priority: 20,
      },
      {
        id: 10,
        kind: "llm",
        name: "ark-first",
        adapter: "ark_chat",
        base_url: "https://ark.example/api/v3",
        api_key: "sk-ark",
        model: "doubao-cloud",
        priority: 10,
      },
      {
        id: 1,
        kind: "video",
        name: "not-an-llm",
        adapter: "openai_chat",
        base_url: "https://video.example",
        api_key: "sk-video",
        model: "ignored",
        priority: 1,
      },
    ])

    const providers = listCopywritingProviderCandidates({ hasImages: false })

    assert.deepEqual(providers.map((provider) => provider.name), ["ark-first", "openai-second"])
    assert.equal(providers[0]?.url, "https://ark.example/api/v3/chat/completions")
    assert.equal(providers[1]?.url, "https://openai.example/v1/chat/completions")
  })

  it("does not fall back to machine-local models in desktop runtime", () => {
    clearRoutingEnv()
    setEnv("DESKTOP_RUNTIME", "1")
    setEnv("DEEPSEEK_API_KEY", "sk-local")

    assert.deepEqual(listCopywritingProviderCandidates({ hasImages: false }), [])
  })

  it("uses the exact provider order bound to GEO article generation", () => {
    clearRoutingEnv()
    setSyncedProviders([
      {
        id: 1,
        kind: "llm",
        name: "global-first",
        adapter: "openai_chat",
        base_url: "https://first.example",
        api_key: "sk-first",
        model: "first-model",
        priority: 1,
      },
      {
        id: 2,
        kind: "llm",
        name: "geo-primary",
        adapter: "ark_chat",
        base_url: "https://geo.example/api/v3",
        api_key: "sk-geo",
        model: "geo-model",
        priority: 2,
      },
    ])
    setSyncedFeatures([
      {
        feature_id: "geo.article.generate",
        enabled: true,
        provider_ids: [2, 1],
      },
    ])

    const providers = listCopywritingProviderCandidates({
      hasImages: false,
      featureId: "geo.article.generate",
    })

    assert.deepEqual(providers.map((provider) => provider.name), [
      "geo-primary",
      "global-first",
    ])
  })

  it("keeps DeepSeek env fallback for ordinary development", () => {
    clearRoutingEnv()
    setEnv("DEEPSEEK_API_KEY", "sk-dev")
    setEnv("DEEPSEEK_CHAT_MODEL", "deepseek-dev")

    const providers = listCopywritingProviderCandidates({ hasImages: false })

    assert.equal(providers[0]?.source, "env")
    assert.equal(providers[0]?.adapter, "deepseek_chat")
    assert.equal(providers[0]?.model, "deepseek-dev")
  })
})

describe("connectCopywritingStream", () => {
  const messages: CopywritingChatMessage[] = [
    { role: "system", content: "system" },
    { role: "user", content: "hello" },
  ]

  it("fails over before streaming when the first provider is unavailable", async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input))
      if (calls.length === 1) return new Response("limited", { status: 429 })
      return new Response("data: ok\n\n", {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      })
    }

    const result = await connectCopywritingStream({
      providers: [
        candidate({ name: "first", url: "https://first.example/v1/chat/completions" }),
        candidate({ name: "second", url: "https://second.example/v1/chat/completions" }),
      ],
      messages,
      signal: new AbortController().signal,
      fetchImpl,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.provider.name, "second")
    assert.deepEqual(calls, [
      "https://first.example/v1/chat/completions",
      "https://second.example/v1/chat/completions",
    ])
  })

  it("fails over on network errors, timeouts, and successful responses without a body", async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input, init) => {
      calls.push(String(input))
      if (calls.length === 1) throw new TypeError("network down")
      if (calls.length === 2) {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("timed out", "AbortError")),
            { once: true },
          )
        })
      }
      if (calls.length === 3) return new Response(null, { status: 200 })
      return new Response("data: ok\n\n", { status: 200 })
    }

    const result = await connectCopywritingStream({
      providers: [
        candidate({ name: "network", url: "https://network.example/v1/chat/completions" }),
        candidate({
          name: "timeout",
          url: "https://timeout.example/v1/chat/completions",
          timeoutMs: 5,
        }),
        candidate({ name: "empty", url: "https://empty.example/v1/chat/completions" }),
        candidate({ name: "working", url: "https://working.example/v1/chat/completions" }),
      ],
      messages,
      signal: new AbortController().signal,
      fetchImpl,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.provider.name, "working")
    assert.deepEqual(result.failures.map((failure) => failure.reason), [
      "network_error",
      "network_error",
      "missing_body",
    ])
    assert.equal(calls.length, 4)
  })

  it("passes image content through without local model restrictions", async () => {
    let requestBody: Record<string, unknown> | undefined
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response("data: ok\n\n", { status: 200 })
    }
    const imageMessages: CopywritingChatMessage[] = [
      { role: "system", content: "system" },
      {
        role: "user",
        content: [
          { type: "text", text: "describe" },
          { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
        ],
      },
    ]

    const result = await connectCopywritingStream({
      providers: [candidate({ model: "cloud-vision-model" })],
      messages: imageMessages,
      signal: new AbortController().signal,
      fetchImpl,
    })

    assert.equal(result.ok, true)
    assert.deepEqual(requestBody?.messages, imageMessages)
  })

  it("lets the next cloud provider take over when the first rejects an image request", async () => {
    const requestBodies: Record<string, unknown>[] = []
    const fetchImpl: typeof fetch = async (_input, init) => {
      requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
      if (requestBodies.length === 1) return new Response("image unsupported", { status: 400 })
      return new Response("data: ok\n\n", { status: 200 })
    }
    const imageMessages: CopywritingChatMessage[] = [
      { role: "system", content: "system" },
      {
        role: "user",
        content: [
          { type: "text", text: "describe" },
          { type: "image_url", image_url: { url: "data:image/png;base64,aGVsbG8=" } },
        ],
      },
    ]

    const result = await connectCopywritingStream({
      providers: [candidate({ name: "text-only" }), candidate({ name: "vision" })],
      messages: imageMessages,
      signal: new AbortController().signal,
      fetchImpl,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.provider.name, "vision")
    assert.equal(requestBodies.length, 2)
    assert.deepEqual(requestBodies[1]?.messages, imageMessages)
  })

  it("does not switch providers after a streaming response has been accepted", async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input))
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: first chunk\n\n"))
          controller.error(new Error("stream interrupted"))
        },
      })
      return new Response(body, { status: 200 })
    }

    const result = await connectCopywritingStream({
      providers: [candidate({ name: "started" }), candidate({ name: "must-not-run" })],
      messages,
      signal: new AbortController().signal,
      fetchImpl,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.provider.name, "started")
    await assert.rejects(() => result.response.text(), /stream interrupted/)
    assert.equal(calls.length, 1)
  })

  it("returns sanitized failures after all providers fail", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("upstream echoed secret-key", { status: 401 })

    const result = await connectCopywritingStream({
      providers: [candidate({ name: "broken", apiKey: "secret-key" })],
      messages,
      signal: new AbortController().signal,
      fetchImpl,
    })

    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.failures.length, 1)
    assert.equal(result.failures[0]?.status, 401)
    assert.ok(!JSON.stringify(result.failures).includes("secret-key"))
  })
})
