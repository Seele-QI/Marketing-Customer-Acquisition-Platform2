import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  listNewApiRelayEndpoints,
  sonettoChatCompletion,
} from "../lib/llm/sonetto-client.ts"

const saved: Record<string, string | undefined> = {}

function setEnv(key: string, value: string | undefined) {
  if (!(key in saved)) saved[key] = process.env[key]
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  for (const k of Object.keys(saved)) delete saved[k]
})

describe("listNewApiRelayEndpoints", () => {
  it("returns primary secondary tertiary in order", () => {
    setEnv("NEWAPI_BASE_URL", "https://p.example")
    setEnv("NEWAPI_KEY", "sk-p")
    setEnv("NEWAPI_SECONDARY_BASE_URL", "https://s.example")
    setEnv("NEWAPI_SECONDARY_KEY", "sk-s")
    setEnv("NEWAPI_TERTIARY_BASE_URL", "https://t.example")
    setEnv("NEWAPI_TERTIARY_KEY", "sk-t")
    const eps = listNewApiRelayEndpoints()
    assert.equal(eps.length, 3)
    assert.deepEqual(
      eps.map((e) => e.name),
      ["primary", "secondary", "tertiary"],
    )
  })

  it("dedupes identical base+key", () => {
    setEnv("NEWAPI_BASE_URL", "https://same.example")
    setEnv("NEWAPI_KEY", "sk-same")
    setEnv("NEWAPI_SECONDARY_BASE_URL", "https://same.example")
    setEnv("NEWAPI_SECONDARY_KEY", "sk-same")
    const eps = listNewApiRelayEndpoints()
    assert.equal(eps.length, 1)
  })
})

describe("sonettoChatCompletion failover", () => {
  it("switches relay on 503", async () => {
    setEnv("NEWAPI_BASE_URL", "https://primary.fail")
    setEnv("NEWAPI_KEY", "sk-p")
    setEnv("NEWAPI_SECONDARY_BASE_URL", "https://secondary.ok")
    setEnv("NEWAPI_SECONDARY_KEY", "sk-s")

    const originalFetch = globalThis.fetch
    let call = 0
    globalThis.fetch = async (input: RequestInfo | URL) => {
      call += 1
      const url = String(input)
      if (url.includes("primary.fail")) {
        return new Response("down", { status: 503 })
      }
      return new Response(
        JSON.stringify({ choices: [{ message: { content: "hello" } }], usage: null }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    }

    try {
      const result = await sonettoChatCompletion({
        modelId: "gpt-5.5",
        messages: [{ role: "user", content: "hi" }],
        timeoutMs: 5000,
      })
      assert.equal(result.ok, true)
      if (result.ok) {
        assert.equal(result.text, "hello")
        assert.equal(result.relay, "secondary")
      }
      assert.ok(call >= 2)
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
