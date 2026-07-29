import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import { listArkChatEndpoints } from "../lib/llm/ark-client.ts"

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

describe("listArkChatEndpoints", () => {
  it("reads unlimited synced ark_chat providers", () => {
    setEnv("ARK_API_KEY", "sk-env")
    setEnv("ARK_CHAT_MODEL", "env-model")
    setEnv("ARK_BASE_URL", "https://env.ark.example")
    const payload = {
      providers: [
        {
          id: 1,
          kind: "llm",
          name: "ark-1",
          adapter: "ark_chat",
          base_url: "https://a.ark.example",
          api_key: "sk-a",
          model: "doubao-a",
          priority: 10,
        },
        {
          id: 2,
          kind: "llm",
          name: "ark-2",
          adapter: "ark_chat",
          base_url: "https://b.ark.example",
          api_key: "sk-b",
          model: "doubao-b",
          priority: 20,
        },
      ],
    }
    setEnv(
      "MODEL_PROVIDERS_JSON_B64",
      Buffer.from(JSON.stringify(payload), "utf8").toString("base64"),
    )
    const eps = listArkChatEndpoints()
    assert.equal(eps.length, 2)
    assert.equal(eps[0].apiKey, "sk-a")
    assert.equal(eps[1].model, "doubao-b")
  })
})
