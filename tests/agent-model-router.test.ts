import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  completeAgentTurn,
  listAgentProviderCandidates,
  type AgentProviderCandidate,
} from "../lib/agents/model-router.ts"

function provider(overrides: Partial<AgentProviderCandidate> = {}): AgentProviderCandidate {
  return {
    source: "cloud",
    name: "cloud-primary",
    adapter: "openai_chat",
    url: "https://llm.example/v1/chat/completions",
    apiKey: "server-secret",
    model: "model-primary",
    timeoutMs: 5_000,
    ...overrides,
  }
}

describe("enterprise agent model router", () => {
  afterEach(() => {
    delete process.env.MODEL_PROVIDERS_JSON_B64
  })

  it("selects only the dedicated cloud-delivered DeepSeek fast channel", () => {
    process.env.MODEL_PROVIDERS_JSON_B64 = Buffer.from(JSON.stringify({
      providers: [
        {
          id: 1,
          kind: "llm",
          name: "通用 GPT",
          adapter: "openai_chat",
          base_url: "https://general.example",
          api_key: "general-secret",
          model: "gpt-5.5",
          priority: 1,
          extra: {},
        },
        {
          id: 2,
          kind: "llm",
          name: "企业智能体快速通道",
          adapter: "openai_chat",
          base_url: "https://agent.example",
          api_key: "agent-secret",
          model: "deepseek-v4-flash",
          priority: 20,
          extra: { purpose: "enterprise_agent", performance_tier: "fast", supports_images: true },
        },
        {
          id: 3,
          kind: "llm",
          name: "普通 DeepSeek",
          adapter: "openai_chat",
          base_url: "https://ordinary.example",
          api_key: "ordinary-secret",
          model: "deepseek-chat",
          priority: 2,
          extra: {},
        },
      ],
    })).toString("base64")

    const candidates = listAgentProviderCandidates({ hasImages: false })
    assert.deepEqual(candidates.map((item) => item.name), ["企业智能体快速通道"])
    assert.equal(candidates[0]?.model, "deepseek-v4-flash")
  })

  it("requires explicit image capability on the dedicated fast channel", () => {
    process.env.MODEL_PROVIDERS_JSON_B64 = Buffer.from(JSON.stringify({
      providers: [
        {
          id: 1,
          kind: "llm",
          name: "企业智能体文本快速通道",
          adapter: "openai_chat",
          base_url: "https://text.example",
          api_key: "text-secret",
          model: "deepseek-v4-flash",
          priority: 1,
          extra: { purpose: "enterprise_agent", performance_tier: "fast", supports_images: false },
        },
        {
          id: 2,
          kind: "llm",
          name: "企业智能体多模态快速通道",
          adapter: "openai_chat",
          base_url: "https://vision.example",
          api_key: "vision-secret",
          model: "deepseek-v4-flash",
          priority: 2,
          extra: { purpose: "enterprise_agent", performance_tier: "fast", supports_images: true },
        },
      ],
    })).toString("base64")

    assert.deepEqual(
      listAgentProviderCandidates({ hasImages: true }).map((item) => item.name),
      ["企业智能体多模态快速通道"],
    )
  })

  it("fails over within the attempt budget and returns a route snapshot", async () => {
    const calls: string[] = []
    const fetchImpl: typeof fetch = async (input) => {
      calls.push(String(input))
      if (calls.length === 1) return new Response("limited", { status: 429 })
      return Response.json({ choices: [{ message: { content: "second provider answer" } }] })
    }

    const result = await completeAgentTurn({
      messages: [
        { role: "system", content: "role" },
        { role: "user", content: "task" },
      ],
      providers: [
        provider({ name: "cloud-first", url: "https://first.example/v1/chat/completions" }),
        provider({
          name: "cloud-second",
          model: "model-second",
          url: "https://second.example/v1/chat/completions",
        }),
        provider({ name: "must-not-run", url: "https://third.example/v1/chat/completions" }),
      ],
      maxAttempts: 2,
      signal: new AbortController().signal,
      fetchImpl,
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.text, "second provider answer")
    assert.equal(result.route.providerName, "cloud-second")
    assert.equal(result.route.model, "model-second")
    assert.equal(result.route.failuresBeforeSelection, 1)
    assert.equal(calls.length, 2)
  })

  it("sends server-selected model and never accepts a client model id", async () => {
    let body: Record<string, unknown> = {}
    const fetchImpl: typeof fetch = async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>
      return Response.json({ choices: [{ message: { content: "ok" } }] })
    }
    const result = await completeAgentTurn({
      messages: [{ role: "user", content: "task" }],
      providers: [provider({ model: "cloud-policy-model" })],
      signal: new AbortController().signal,
      fetchImpl,
    })
    assert.equal(result.ok, true)
    assert.equal(body.model, "cloud-policy-model")
    assert.equal(body.stream, false)
  })

  it("returns sanitized failures when every provider fails", async () => {
    const result = await completeAgentTurn({
      messages: [{ role: "user", content: "task" }],
      providers: [provider()],
      signal: new AbortController().signal,
      fetchImpl: async () => new Response("server-secret", { status: 503 }),
    })
    assert.equal(result.ok, false)
    if (result.ok) return
    assert.equal(result.code, "CLOUD_MODEL_UNAVAILABLE")
    assert.equal(result.failures[0]?.status, 503)
    assert.ok(!JSON.stringify(result).includes("server-secret"))
  })

  it("fails closed when no cloud model is configured", async () => {
    const result = await completeAgentTurn({
      messages: [{ role: "user", content: "task" }],
      providers: [],
      signal: new AbortController().signal,
    })
    assert.deepEqual(result, { ok: false, code: "MODEL_NOT_CONFIGURED", failures: [] })
  })
})
