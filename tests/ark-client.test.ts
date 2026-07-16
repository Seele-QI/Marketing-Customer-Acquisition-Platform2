import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"

import {
  buildArkChatCompletionsUrl,
  buildArkStreamChatRequest,
  getArkChatModelId,
  isArkChatConfigured,
  resolveArkBearer,
} from "../lib/llm/ark-client.ts"
import { DOUBAO_SEED_21_MODEL_ID } from "../lib/llm/model-registry.ts"

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

describe("getArkChatModelId", () => {
  it("prefers ARK_CHAT_MODEL over endpoint and default", () => {
    setEnv("ARK_CHAT_MODEL", "doubao-seed-2-1-pro-260628")
    setEnv("ARK_ENDPOINT_ID", "ep-legacy")
    setEnv("ARK_MODEL", "ignored")
    assert.equal(getArkChatModelId(), "doubao-seed-2-1-pro-260628")
  })

  it("falls back to ARK_ENDPOINT_ID then default model id", () => {
    setEnv("ARK_CHAT_MODEL", undefined)
    setEnv("ARK_ENDPOINT_ID", "ep-vision-001")
    setEnv("ARK_MODEL", undefined)
    setEnv("ARK_API_KEY", "ark-bearer")
    assert.equal(getArkChatModelId(), "ep-vision-001")

    setEnv("ARK_ENDPOINT_ID", undefined)
    assert.equal(getArkChatModelId(), DOUBAO_SEED_21_MODEL_ID)
  })

  it("honors override argument", () => {
    setEnv("ARK_CHAT_MODEL", "from-env")
    assert.equal(getArkChatModelId("override-model"), "override-model")
  })
})

describe("isArkChatConfigured / resolveArkBearer", () => {
  it("requires bearer only (model defaults to Seed 2.1)", () => {
    setEnv("ARK_API_KEY", undefined)
    setEnv("ARK_API_SECRET", undefined)
    setEnv("VOLCENGINE_API_KEY", undefined)
    setEnv("ARK_CHAT_MODEL", undefined)
    assert.equal(isArkChatConfigured(), false)

    setEnv("ARK_API_KEY", "ark-test-key")
    assert.equal(isArkChatConfigured(), true)
    assert.equal(resolveArkBearer(), "ark-test-key")
    assert.equal(getArkChatModelId(), DOUBAO_SEED_21_MODEL_ID)
  })
})

describe("buildArkStreamChatRequest", () => {
  it("builds chat completions URL and body for multimodal", () => {
    setEnv("ARK_API_KEY", "ark-bearer")
    setEnv("ARK_CHAT_MODEL", DOUBAO_SEED_21_MODEL_ID)
    setEnv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3")
    const built = buildArkStreamChatRequest({
      messages: [
        { role: "system", content: "sys" },
        {
          role: "user",
          content: [
            { type: "text", text: "看图" },
            { type: "image_url", image_url: { url: "https://example.com/a.jpg" } },
          ],
        },
      ],
    })
    assert.ok(!("error" in built))
    if ("error" in built) return
    assert.equal(built.url, "https://ark.cn-beijing.volces.com/api/v3/chat/completions")
    assert.equal(built.authorization, "Bearer ark-bearer")
    assert.equal(built.modelId, DOUBAO_SEED_21_MODEL_ID)
    assert.equal(built.body.stream, true)
    assert.equal(built.body.model, DOUBAO_SEED_21_MODEL_ID)
  })

  it("returns 503 when key missing", () => {
    setEnv("ARK_API_KEY", undefined)
    setEnv("ARK_API_SECRET", undefined)
    setEnv("VOLCENGINE_API_KEY", undefined)
    const built = buildArkStreamChatRequest({
      messages: [{ role: "user", content: "hi" }],
    })
    assert.ok("error" in built)
    if (!("error" in built)) return
    assert.equal(built.status, 503)
  })
})

describe("buildArkChatCompletionsUrl", () => {
  it("strips trailing chat/completions suffix", () => {
    setEnv("ARK_BASE_URL", "https://ark.cn-beijing.volces.com/api/v3/chat/completions")
    assert.equal(
      buildArkChatCompletionsUrl(),
      "https://ark.cn-beijing.volces.com/api/v3/chat/completions",
    )
  })
})
