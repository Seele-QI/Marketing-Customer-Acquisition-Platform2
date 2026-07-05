import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { PLAN_SCRIPT_SLOW_MS } from "../lib/dh-video-v2/api.ts"
import { buildSegmentStripFromPlan } from "../lib/dh-video-v2/segment-strip-utils.ts"

describe("dh-v2 segment UX helpers", () => {
  it("PLAN_SCRIPT_SLOW_MS is 120 seconds", () => {
    assert.equal(PLAN_SCRIPT_SLOW_MS, 120_000)
  })

  it("buildSegmentStripFromPlan merges runtime status", () => {
    const items = buildSegmentStripFromPlan(
      [
        { index: 0, time_range: "0-15s", dialogue: "第一段" },
        { index: 1, time_range: "15-30s", dialogue: "第二段" },
      ],
      [{ index: 1, status: "failed", error: "超时" }],
    )
    assert.equal(items.length, 2)
    assert.equal(items[0].status, "pending")
    assert.equal(items[1].status, "failed")
    assert.equal(items[1].error, "超时")
  })
})
