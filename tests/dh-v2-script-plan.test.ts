import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  assessScriptDuration,
  countScriptChars,
  splitScriptIntoSegments,
  buildScriptPlanSkeleton,
} from "../lib/dh-video-v2/script-plan.ts"

describe("dh-v2 script-plan", () => {
  it("countScriptChars ignores whitespace", () => {
    assert.equal(countScriptChars("你好 世界"), 4)
  })

  it("assessScriptDuration for 90 chars → 30s / 2 segments", () => {
    const script = "口".repeat(90)
    const a = assessScriptDuration(script)
    assert.equal(a.char_count, 90)
    assert.equal(a.plan_duration, 30)
    assert.equal(a.segment_count, 2)
    assert.ok(a.duration_min > 0)
    assert.ok(a.duration_max >= a.duration_min)
  })

  it("short script minimum 15s", () => {
    const a = assessScriptDuration("你好世界")
    assert.equal(a.plan_duration, 15)
    assert.equal(a.segment_count, 1)
  })

  it("splitScriptIntoSegments preserves order", () => {
    const script = "第一句。第二句！第三句？"
    const parts = splitScriptIntoSegments(script, 2)
    assert.equal(parts.length, 2)
    assert.equal(parts.join(""), script)
  })

  it("buildScriptPlanSkeleton has empty prompts", () => {
    const plan = buildScriptPlanSkeleton("测试文案。".repeat(20))
    assert.ok(plan.segments.length >= 1)
    assert.equal(plan.segments[0].video_prompt, "")
    assert.ok(plan.segments[0].dialogue.length > 0)
  })
})
