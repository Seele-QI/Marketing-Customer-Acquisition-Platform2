import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  extractPlanJsonBlock,
  mergeAiPlanFromResponse,
} from "../lib/dh-video-v2/plan-script-parse.ts"
import { readFileSync } from "node:fs"

describe("dh-v2 plan-script-ai", () => {
  it("does not override cloud model configuration with local model constants", () => {
    const source = readFileSync(
      new URL("../lib/dh-video-v2/plan-script-ai.ts", import.meta.url),
      "utf8",
    )
    assert.doesNotMatch(source, /DOUBAO_SEED_21_MODEL_ID|DEFAULT_NEWAPI_GPT_MODEL/)
    assert.match(source, /listCloudFeatureProviderCandidates/)
  })

  it("extractPlanJsonBlock parses fenced JSON", () => {
    const raw = '```json\n{"segments":[{"dialogue":"' + "字".repeat(45) + '"}]}\n```'
    const data = extractPlanJsonBlock(raw)
    assert.ok(Array.isArray(data.segments))
    assert.equal((data.segments as unknown[]).length, 1)
  })

  it("mergeAiPlanFromResponse filters empty dialogue", () => {
    const script = "测试口播文案内容。".repeat(30)
    const line = "字".repeat(50)
    const plan = mergeAiPlanFromResponse(script, [
      { dialogue: line, shot_details: "场景", video_prompt: "prompt1" },
      { dialogue: "", shot_details: "skip", video_prompt: "skip" },
      { dialogue: "字".repeat(49), shot_details: "场景2", video_prompt: "prompt2" },
    ])
    assert.equal(plan.segments.length, 2)
    assert.equal(plan.segments[0].index, 0)
    assert.equal(plan.segments[1].index, 1)
    assert.equal(plan.segments[0].dialogue_warning, "ok")
  })
})
