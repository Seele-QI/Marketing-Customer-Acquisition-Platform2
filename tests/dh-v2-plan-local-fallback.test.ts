import assert from "node:assert/strict"
import test from "node:test"

import { generateDhV2PlanWithLlm } from "../lib/dh-video-v2/plan-script-ai.ts"

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64")
}

test("plan generation falls back locally when every cloud provider is unreachable", async () => {
  const previousProviders = process.env.MODEL_PROVIDERS_JSON_B64
  const previousFeatures = process.env.FEATURE_CATALOG_JSON_B64
  const originalFetch = globalThis.fetch
  process.env.MODEL_PROVIDERS_JSON_B64 = encode({
    providers: [
      {
        id: 10,
        kind: "llm",
        name: "glm",
        adapter: "openai_chat",
        base_url: "https://glm.example",
        api_key: "sk-test",
        model: "glm-5.2",
        priority: 1,
      },
    ],
  })
  process.env.FEATURE_CATALOG_JSON_B64 = encode({
    features: [
      {
        feature_id: "video.dh.plan_script",
        enabled: true,
        provider_ids: [10],
      },
    ],
  })
  globalThis.fetch = (async () => {
    throw new Error("simulated offline")
  }) as typeof fetch

  try {
    const result = await generateDhV2PlanWithLlm({
      script: "实体店老板应该多讲自己的真实经历和服务细节，让顾客先认识你、相信你，然后再自然地介绍产品和解决方案。".repeat(2),
      creative_idea: "真实口播",
    })

    assert.equal(result.ok, true)
    if (!result.ok) return
    assert.equal(result.plan_source, "本地可靠分镜（云模型暂不可用）")
    assert.ok(result.plan.segments.length > 0)
    assert.ok(result.plan.segments.every((segment) => segment.video_prompt.length > 0))
  } finally {
    globalThis.fetch = originalFetch
    if (previousProviders === undefined) delete process.env.MODEL_PROVIDERS_JSON_B64
    else process.env.MODEL_PROVIDERS_JSON_B64 = previousProviders
    if (previousFeatures === undefined) delete process.env.FEATURE_CATALOG_JSON_B64
    else process.env.FEATURE_CATALOG_JSON_B64 = previousFeatures
  }
})
