import assert from "node:assert/strict"
import { after, describe, it } from "node:test"

import {
  completeCloudFeatureChat,
  listCloudFeatureProviderCandidates,
} from "../lib/llm/cloud-feature-completion.ts"

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64")
}

describe("cloud feature completion", () => {
  const previousProviders = process.env.MODEL_PROVIDERS_JSON_B64
  const previousFeatures = process.env.FEATURE_CATALOG_JSON_B64

  after(() => {
    if (previousProviders === undefined) delete process.env.MODEL_PROVIDERS_JSON_B64
    else process.env.MODEL_PROVIDERS_JSON_B64 = previousProviders
    if (previousFeatures === undefined) delete process.env.FEATURE_CATALOG_JSON_B64
    else process.env.FEATURE_CATALOG_JSON_B64 = previousFeatures
  })

  it("uses exact cloud feature order and model instead of a local model constant", () => {
    process.env.MODEL_PROVIDERS_JSON_B64 = encode({
      providers: [
        {
          id: 2,
          kind: "llm",
          name: "DeepSeek",
          adapter: "openai_chat",
          base_url: "https://api.deepseek.com",
          api_key: "sk-deepseek",
          model: "deepseek-v4-flash",
          priority: 1,
        },
        {
          id: 3,
          kind: "llm",
          name: "豆包",
          adapter: "ark_chat",
          base_url: "https://ark.cn-beijing.volces.com/api/v3",
          api_key: "ark-key",
          model: "doubao-seed-2-1-turbo-260628",
          extra: { supports_images: true },
          priority: 2,
        },
      ],
    })
    process.env.FEATURE_CATALOG_JSON_B64 = encode({
      features: [
        {
          feature_id: "video.dh.plan_script",
          enabled: true,
          provider_ids: [3, 2],
        },
      ],
    })

    const candidates = listCloudFeatureProviderCandidates("video.dh.plan_script")
    assert.deepEqual(
      candidates.map((item) => [item.id, item.model]),
      [
        [3, "doubao-seed-2-1-turbo-260628"],
        [2, "deepseek-v4-flash"],
      ],
    )
  })

  it("strips image parts for a cloud provider that does not declare image support", async () => {
    const requestBodies: Array<Record<string, unknown>> = []
    const result = await completeCloudFeatureChat({
      providers: [
        {
          id: 2,
          name: "DeepSeek",
          adapter: "openai_chat",
          url: "https://api.deepseek.com/v1/chat/completions",
          apiKey: "sk-test",
          model: "deepseek-v4-flash",
          supportsImages: false,
        },
      ],
      messages: [
        { role: "system", content: "system" },
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: "data:image/jpeg;base64,AA==" } },
            { type: "text", text: "make a plan" },
          ],
        },
      ],
      maxTokens: 100,
      timeoutMs: 1_000,
      fetchImpl: async (_url, init) => {
        requestBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>)
        return Response.json({ choices: [{ message: { content: "{\"segments\":[]}" } }] })
      },
    })

    assert.equal(result.ok, true)
    const messages = requestBodies[0].messages as Array<{ content: unknown }>
    assert.equal(messages[1].content, "make a plan")
  })

  it("fails over after provider HTTP errors and reports the selected cloud provider", async () => {
    const calledModels: string[] = []
    const result = await completeCloudFeatureChat({
      providers: [
        {
          id: 1,
          name: "broken",
          adapter: "openai_chat",
          url: "https://broken.example/v1/chat/completions",
          apiKey: "sk-1",
          model: "broken-model",
          supportsImages: false,
        },
        {
          id: 2,
          name: "working",
          adapter: "ark_chat",
          url: "https://working.example/api/v3/chat/completions",
          apiKey: "sk-2",
          model: "cloud-model",
          supportsImages: true,
        },
      ],
      messages: [{ role: "user", content: "hello" }],
      maxTokens: 100,
      timeoutMs: 1_000,
      fetchImpl: async (_url, init) => {
        const body = JSON.parse(String(init?.body)) as { model: string }
        calledModels.push(body.model)
        if (body.model === "broken-model") {
          return Response.json({ error: { message: "bad model" } }, { status: 400 })
        }
        return Response.json({ choices: [{ message: { content: "ok" } }] })
      },
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.provider.model, "cloud-model")
    assert.deepEqual(calledModels, ["broken-model", "cloud-model"])
    assert.match(result.failures[0].detail, /400.*bad model/)
  })
})
