import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  assessScriptDuration,
  countScriptChars,
  countSegmentDialogueChars,
  DH_V2_DIALOGUE_CHARS_MAX,
  DH_V2_DIALOGUE_CHARS_MIN,
  filterActiveSegments,
  reindexSegments,
  splitScriptIntoSegments,
  buildScriptPlanSkeleton,
  buildSegmentDialogueTimeline,
  validateSegmentDialogue,
} from "../lib/dh-video-v2/script-plan.ts"

describe("dh-v2 script-plan", () => {
  it("countScriptChars ignores whitespace and punctuation", () => {
    assert.equal(countScriptChars("你好 世界"), 4)
    assert.equal(countScriptChars("你好，世界！"), 4)
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

  it("splitScriptIntoSegments packs by sentence under 54 chars", () => {
    const script = "第一句内容足够长一些。第二句内容也足够长一些。"
    const parts = splitScriptIntoSegments(script)
    assert.ok(parts.length >= 1)
    for (const p of parts) {
      assert.ok(countScriptChars(p) <= DH_V2_DIALOGUE_CHARS_MAX)
    }
  })

  it("buildScriptPlanSkeleton has empty prompts", () => {
    const plan = buildScriptPlanSkeleton("测试文案。".repeat(20))
    assert.ok(plan.segments.length >= 1)
    assert.equal(plan.segments[0].video_prompt, "")
    assert.ok(plan.segments[0].dialogue.length > 0)
  })

  it("buildSegmentDialogueTimeline embeds full dialogue with variable ranges", () => {
    const dlg =
      "实体店做IP，少拍产品多拍人，反而卖得更多。百分之九十九的老板都搞错了，一拿起手机就对着产品一顿拍。"
    const timeline = buildSegmentDialogueTimeline(dlg)
    assert.match(timeline, /口播「/)
    assert.match(timeline, /0-\d+s：/)
    assert.ok(timeline.includes("实体店做IP"))
    assert.ok(timeline.includes("一拿起手机就对着产品一顿拍。"))
    assert.ok(!timeline.includes("5-10s"), "should not use fixed 5s grid")
  })

  it("validateSegmentDialogue enforces 50-54 chars", () => {
    assert.equal(validateSegmentDialogue(""), "empty")
    assert.equal(validateSegmentDialogue("短"), "too_short")
    assert.equal(validateSegmentDialogue("字".repeat(50)), "ok")
    assert.equal(validateSegmentDialogue("字".repeat(54)), "ok")
    assert.equal(validateSegmentDialogue("字".repeat(55)), "too_long")
    assert.equal(DH_V2_DIALOGUE_CHARS_MIN, 50)
    assert.equal(DH_V2_DIALOGUE_CHARS_MAX, 54)
  })

  it("filterActiveSegments removes empty dialogue", () => {
    const segs = [
      { index: 0, dialogue: "有内容", time_range: "0-15s", shot_details: "", video_prompt: "" },
      { index: 1, dialogue: "   ", time_range: "15-30s", shot_details: "", video_prompt: "" },
      { index: 2, dialogue: "也有", time_range: "30-45s", shot_details: "", video_prompt: "" },
    ]
    const active = filterActiveSegments(segs)
    assert.equal(active.length, 2)
    assert.equal(active[0].dialogue, "有内容")
    assert.equal(active[1].dialogue, "也有")
  })

  it("reindexSegments resets index and time_range", () => {
    const segs = [
      { index: 3, dialogue: "字".repeat(52), time_range: "x", shot_details: "", video_prompt: "" },
      { index: 7, dialogue: "字".repeat(52), time_range: "y", shot_details: "", video_prompt: "" },
    ]
    const out = reindexSegments(segs)
    assert.equal(out[0].index, 0)
    assert.equal(out[0].time_range, "0-15s")
    assert.equal(out[1].index, 1)
    assert.equal(out[1].time_range, "15-30s")
    assert.equal(out[0].dialogue_warning, "ok")
  })

  it("countSegmentDialogueChars matches countScriptChars", () => {
    assert.equal(countSegmentDialogueChars("你 好"), 2)
    assert.equal(countSegmentDialogueChars("你，好！"), 2)
  })
})
