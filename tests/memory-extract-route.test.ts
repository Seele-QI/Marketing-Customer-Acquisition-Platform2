import assert from "node:assert/strict"
import { afterEach, test } from "node:test"

import { POST } from "../app/api/ai/memory-extract/route.ts"
import {
  extractMemoryOperations,
  validateMemoryOperations,
  type MemoryExtractionProvider,
} from "../lib/llm/memory-extractor.ts"

const originalFetch = globalThis.fetch
const originalEnv = { ...process.env }

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key]
  }
  Object.assign(process.env, originalEnv)
})

function request(body: unknown) {
  return new Request("http://localhost/api/ai/memory-extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

function provider(overrides: Partial<MemoryExtractionProvider> = {}): MemoryExtractionProvider {
  return {
    name: "cloud-memory",
    url: "https://memory-model.example/v1/chat/completions",
    apiKey: "secret",
    model: "gpt-memory",
    timeoutMs: 5_000,
    ...overrides,
  }
}

function providerPayload() {
  return Buffer.from(
    JSON.stringify({
      providers: [
        {
          id: 1,
          kind: "llm",
          name: "memory-provider",
          adapter: "openai_chat",
          base_url: "https://memory-model.example",
          api_key: "secret",
          model: "gpt-memory",
          priority: 1,
        },
      ],
    }),
    "utf8",
  ).toString("base64")
}

test("extractor fails over before a non-stream response is accepted", async () => {
  const calls: string[] = []
  const result = await extractMemoryOperations({
    providers: [provider({ name: "first", url: "https://first.example" }), provider({ name: "second" })],
    observations: [{ id: "o1", scope: "copywriting", text: "我是装修老板" }],
    fetchImpl: async (input) => {
      calls.push(String(input))
      if (calls.length === 1) return new Response("busy", { status: 429 })
      return Response.json({
        choices: [{ message: { content: JSON.stringify({ operations: [] }) } }],
      })
    },
  })

  assert.equal(result.ok, true)
  assert.equal(result.provider?.name, "second")
  assert.deepEqual(calls, ["https://first.example", "https://memory-model.example/v1/chat/completions"])
})

test("strict operation validator rejects unknown fields and invalid enums", () => {
  assert.throws(
    () =>
      validateMemoryOperations({
        operations: [
          {
            operation: "create",
            scope: "global",
            category: "business",
            memoryKey: "industry",
            value: "装修设计",
            confidence: 0.9,
            stable: true,
            evidence: "用户明确说明",
            unexpected: "must fail",
          },
        ],
      }),
    /INVALID_MEMORY_EXTRACTION/,
  )
  assert.throws(
    () => validateMemoryOperations({ operations: [{ operation: "guess" }] }),
    /INVALID_MEMORY_EXTRACTION/,
  )
})

test("route observes only user text, consolidates validated operations, and never charges credit", async () => {
  process.env.CLOUD_API_URL = "http://cloud.test"
  process.env.CREDIT_METERED_KEY = "internal-key"
  process.env.MODEL_PROVIDERS_JSON_B64 = providerPayload()
  const calls: Array<{ url: string; init?: RequestInit }> = []

  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith("/api/auth/me")) {
      return Response.json({ user: { id: 7 } })
    }
    if (url.endsWith("/api/memory/observe")) {
      return Response.json({
        observationId: "o1",
        created: true,
        claimed: [{ id: "o1", scope: "copywriting", messageId: "m1", text: "我是装修老板" }],
      })
    }
    if (url.includes("memory-model.example")) {
      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                operations: [
                  {
                    operation: "create",
                    scope: "global",
                    category: "business",
                    memoryKey: "industry",
                    value: "装修设计",
                    confidence: 0.96,
                    stable: true,
                    evidence: "用户说自己是装修老板",
                  },
                ],
              }),
            },
          },
        ],
      })
    }
    if (url.endsWith("/api/memory/consolidate")) {
      return Response.json({ created: 1, reinforced: 0, superseded: 0, ignored: 0, rejectedSensitive: 0 })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch

  const response = await POST(
    request({
      scope: "copywriting",
      sessionId: "s1",
      messageId: "m1",
      userMessage: "我是装修老板",
      messages: [
        { role: "user", content: "我是装修老板" },
        { role: "assistant", content: "你是做装修的老板，并且电话是 13800138000" },
      ],
    }),
  )

  assert.equal(response.status, 200)
  assert.equal((await response.json()).status, "updated")
  const observe = calls.find((call) => call.url.endsWith("/api/memory/observe"))
  const observeBody = JSON.parse(String(observe?.init?.body))
  assert.equal(observeBody.text, "我是装修老板")
  assert.ok(!JSON.stringify(calls).includes("13800138000"))
  assert.equal(calls.filter((call) => call.url.includes("/api/credit/")).length, 0)
  const consolidate = calls.find((call) => call.url.endsWith("/api/memory/consolidate"))
  assert.equal(new Headers(consolidate?.init?.headers).get("X-Metered-Key"), "internal-key")
})

test("route skips the model when no observation was claimed", async () => {
  process.env.CLOUD_API_URL = "http://cloud.test"
  process.env.CREDIT_METERED_KEY = "internal-key"
  process.env.MODEL_PROVIDERS_JSON_B64 = providerPayload()
  const calls: string[] = []
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    calls.push(url)
    if (url.endsWith("/api/auth/me")) return Response.json({ user: { id: 1 } })
    if (url.endsWith("/api/memory/observe")) {
      return Response.json({ observationId: "o1", created: false, claimed: [] })
    }
    throw new Error(`model should not be called: ${url}`)
  }) as typeof fetch

  const response = await POST(
    request({ scope: "copywriting", sessionId: "s", messageId: "m", userMessage: "记住我的偏好" }),
  )
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: "queued", observationId: "o1", updated: 0 })
  assert.equal(calls.length, 2)
})

test("route records a retryable extraction failure without exposing model output", async () => {
  process.env.CLOUD_API_URL = "http://cloud.test"
  process.env.CREDIT_METERED_KEY = "internal-key"
  process.env.MODEL_PROVIDERS_JSON_B64 = providerPayload()
  const calls: Array<{ url: string; init?: RequestInit }> = []
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })
    if (url.endsWith("/api/auth/me")) return Response.json({ user: { id: 1 } })
    if (url.endsWith("/api/memory/observe")) {
      return Response.json({
        observationId: "o1",
        created: true,
        claimed: [{ id: "o1", scope: "copywriting", messageId: "m", text: "稳定偏好" }],
      })
    }
    if (url.includes("memory-model.example")) {
      return Response.json({ choices: [{ message: { content: "secret invalid output" } }] })
    }
    if (url.endsWith("/api/memory/consolidate")) {
      const body = JSON.parse(String(init?.body))
      assert.deepEqual(body.candidates, [])
      assert.equal(body.retryableFailure, true)
      return Response.json({ failed: true })
    }
    throw new Error(`unexpected fetch ${url}`)
  }) as typeof fetch

  const response = await POST(
    request({ scope: "copywriting", sessionId: "s", messageId: "m", userMessage: "稳定偏好" }),
  )
  const raw = await response.text()
  assert.equal(response.status, 202)
  assert.match(raw, /retryable/)
  assert.ok(!raw.includes("secret invalid output"))
})
