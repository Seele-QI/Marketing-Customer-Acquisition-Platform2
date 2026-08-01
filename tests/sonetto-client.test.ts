import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  diagnoseNewApiPrimaryMisconfig,
  readOptionalNewApiTier,
  requireTriad,
} from "../lib/llm/provider-env.ts"
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

function clearNewApiEnv() {
  for (const k of [
    "NEWAPI_ENABLED",
    "NEWAPI_BASE_URL",
    "NEWAPI_KEY",
    "NEWAPI_GPT_MODEL",
    "NEWAPI_CLAUDE_MODEL",
    "NEWAPI_SECONDARY_BASE_URL",
    "NEWAPI_SECONDARY_KEY",
    "NEWAPI_SECONDARY_GPT_MODEL",
    "NEWAPI_SECONDARY_CLAUDE_MODEL",
    "NEWAPI_TERTIARY_BASE_URL",
    "NEWAPI_TERTIARY_KEY",
    "NEWAPI_TERTIARY_GPT_MODEL",
    "NEWAPI_TERTIARY_CLAUDE_MODEL",
    "MODEL_PROVIDERS_JSON_B64",
  ]) {
    setEnv(k, undefined)
  }
}

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k]
    else process.env[k] = v
  }
  for (const k of Object.keys(saved)) delete saved[k]
})

describe("provider-env triad", () => {
  it("requireTriad fails when model missing", () => {
    const r = requireTriad({
      label: "NewAPI primary",
      baseUrl: "https://x.example",
      apiKey: "sk-x",
      model: "",
      modelEnv: "NEWAPI_GPT_MODEL",
    })
    assert.equal(r.ok, false)
    if (!r.ok) {
      assert.match(r.detail, /NEWAPI_GPT_MODEL/)
      assert.deepEqual(r.missing, ["NEWAPI_GPT_MODEL"])
    }
  })

  it("requireTriad ok when url+key+model present", () => {
    const r = requireTriad({
      label: "Seedance",
      baseUrl: "https://x.example",
      apiKey: "sk-x",
      model: "sd2",
    })
    assert.equal(r.ok, true)
    if (r.ok) assert.equal(r.model, "sd2")
  })

  it("readOptionalNewApiTier skips half-config (key without model)", () => {
    const r = readOptionalNewApiTier({
      label: "NewAPI primary",
      baseUrl: "https://x.example",
      apiKey: "sk-x",
      gptModel: "",
      claudeModel: "",
      baseUrlEnv: "NEWAPI_BASE_URL",
      apiKeyEnv: "NEWAPI_KEY",
      gptModelEnv: "NEWAPI_GPT_MODEL",
      claudeModelEnv: "NEWAPI_CLAUDE_MODEL",
    })
    assert.equal(r, null)
  })

  it("diagnoseNewApiPrimaryMisconfig points at missing model", () => {
    clearNewApiEnv()
    setEnv("NEWAPI_BASE_URL", "https://x.example")
    setEnv("NEWAPI_KEY", "sk-x")
    const msg = diagnoseNewApiPrimaryMisconfig("gpt")
    assert.ok(msg)
    assert.match(msg!, /NEWAPI_GPT_MODEL/)
  })
})

describe("listNewApiRelayEndpoints", () => {
  it("returns primary secondary tertiary in order when triad complete", () => {
    clearNewApiEnv()
    setEnv("NEWAPI_BASE_URL", "https://p.example")
    setEnv("NEWAPI_KEY", "sk-p")
    setEnv("NEWAPI_GPT_MODEL", "gpt-5.5")
    setEnv("NEWAPI_SECONDARY_BASE_URL", "https://s.example")
    setEnv("NEWAPI_SECONDARY_KEY", "sk-s")
    setEnv("NEWAPI_SECONDARY_GPT_MODEL", "gpt-5.5")
    setEnv("NEWAPI_TERTIARY_BASE_URL", "https://t.example")
    setEnv("NEWAPI_TERTIARY_KEY", "sk-t")
    setEnv("NEWAPI_TERTIARY_GPT_MODEL", "gpt-5.5")
    const eps = listNewApiRelayEndpoints()
    assert.equal(eps.length, 3)
    assert.deepEqual(
      eps.map((e) => e.name),
      ["primary", "secondary", "tertiary"],
    )
  })

  it("skips tier when key present but model missing", () => {
    clearNewApiEnv()
    setEnv("NEWAPI_BASE_URL", "https://p.example")
    setEnv("NEWAPI_KEY", "sk-p")
    const eps = listNewApiRelayEndpoints()
    assert.equal(eps.length, 0)
  })

  it("dedupes identical base+key", () => {
    clearNewApiEnv()
    setEnv("NEWAPI_BASE_URL", "https://same.example")
    setEnv("NEWAPI_KEY", "sk-same")
    setEnv("NEWAPI_GPT_MODEL", "gpt-5.5")
    setEnv("NEWAPI_SECONDARY_BASE_URL", "https://same.example")
    setEnv("NEWAPI_SECONDARY_KEY", "sk-same")
    setEnv("NEWAPI_SECONDARY_GPT_MODEL", "gpt-5.5")
    const eps = listNewApiRelayEndpoints()
    assert.equal(eps.length, 1)
  })

  it("prefers unlimited synced openai_chat over env tiers", () => {
    clearNewApiEnv()
    setEnv("NEWAPI_BASE_URL", "https://env.example")
    setEnv("NEWAPI_KEY", "sk-env")
    setEnv("NEWAPI_GPT_MODEL", "gpt-env")
    const payload = {
      providers: [
        {
          id: 1,
          kind: "llm",
          name: "gpt-a",
          adapter: "openai_chat",
          base_url: "https://a.example",
          api_key: "sk-a",
          model: "gpt-5.5",
          priority: 10,
        },
        {
          id: 2,
          kind: "llm",
          name: "claude-a",
          adapter: "openai_chat",
          base_url: "https://a.example",
          api_key: "sk-a",
          model: "claude-opus-4-8",
          priority: 20,
        },
        {
          id: 3,
          kind: "llm",
          name: "gpt-b",
          adapter: "openai_chat",
          base_url: "https://b.example",
          api_key: "sk-b",
          model: "gpt-5.5",
          priority: 30,
        },
        {
          id: 4,
          kind: "llm",
          name: "gpt-c",
          adapter: "openai_chat",
          base_url: "https://c.example",
          api_key: "sk-c",
          model: "gpt-5.5",
          priority: 40,
        },
      ],
    }
    setEnv(
      "MODEL_PROVIDERS_JSON_B64",
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    )
    const eps = listNewApiRelayEndpoints()
    assert.equal(eps.length, 3)
    assert.equal(eps[0].gptModel, "gpt-5.5")
    assert.equal(eps[0].claudeModel, "claude-opus-4-8")
    assert.equal(eps[0].baseUrl, "https://a.example/v1")
    assert.equal(eps[2].baseUrl, "https://c.example/v1")
  })
})

describe("sonettoChatCompletion triad + failover", () => {
  it("returns 503 with missing model message when only key+url set", async () => {
    clearNewApiEnv()
    setEnv("NEWAPI_BASE_URL", "https://primary.fail")
    setEnv("NEWAPI_KEY", "sk-p")

    const result = await sonettoChatCompletion({
      modelId: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5000,
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 503)
      assert.match(result.detail, /NEWAPI_GPT_MODEL/)
    }
  })

  it("switches relay on 503 when both tiers have full triad", async () => {
    clearNewApiEnv()
    setEnv("NEWAPI_BASE_URL", "https://primary.fail")
    setEnv("NEWAPI_KEY", "sk-p")
    setEnv("NEWAPI_GPT_MODEL", "gpt-5.5")
    setEnv("NEWAPI_SECONDARY_BASE_URL", "https://secondary.ok")
    setEnv("NEWAPI_SECONDARY_KEY", "sk-s")
    setEnv("NEWAPI_SECONDARY_GPT_MODEL", "gpt-5.5")

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

  it("refuses when NEWAPI_ENABLED=0", async () => {
    clearNewApiEnv()
    setEnv("NEWAPI_ENABLED", "0")
    setEnv("NEWAPI_BASE_URL", "https://x.example")
    setEnv("NEWAPI_KEY", "sk-x")
    setEnv("NEWAPI_GPT_MODEL", "gpt-5.5")
    const result = await sonettoChatCompletion({
      modelId: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
      timeoutMs: 5000,
    })
    assert.equal(result.ok, false)
    if (!result.ok) {
      assert.equal(result.status, 503)
      assert.match(result.detail, /NEWAPI_ENABLED=0/)
    }
  })
})
