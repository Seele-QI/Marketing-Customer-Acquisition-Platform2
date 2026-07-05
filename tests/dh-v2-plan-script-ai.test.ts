import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  extractPlanJsonBlock,
  mergeAiPlanFromResponse,
} from "../lib/dh-video-v2/plan-script-parse.ts"

describe("dh-v2 plan-script-ai", () => {
  it("extractPlanJsonBlock parses fenced JSON", () => {
    const raw = '```json\n{"segments":[{"dialogue":"' + "字".repeat(45) + '"}]}\n```'
    const data = extractPlanJsonBlock(raw)
    assert.ok(Array.isArray(data.segments))
    assert.equal((data.segments as unknown[]).length, 1)
  })

  it("mergeAiPlanFromResponse filters empty dialogue", () => {
    const script = "测试口播文案内容。".repeat(30)
    const plan = mergeAiPlanFromResponse(script, [
      { dialogue: "字".repeat(45), shot_details: "场景", video_prompt: "prompt1" },
      { dialogue: "", shot_details: "skip", video_prompt: "skip" },
      { dialogue: "字".repeat(44), shot_details: "场景2", video_prompt: "prompt2" },
    ])
    assert.equal(plan.segments.length, 2)
    assert.equal(plan.segments[0].index, 0)
    assert.equal(plan.segments[1].index, 1)
    assert.equal(plan.segments[0].dialogue_warning, "ok")
  })
})
