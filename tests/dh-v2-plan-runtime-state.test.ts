import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  getPlanRuntimeState,
  withActivePlanRequest,
} from "../lib/dh-video-v2/plan-runtime-state.ts"

describe("dh-v2 plan runtime state", () => {
  it("tracks overlapping plan requests and always releases the counter", async () => {
    let releaseFirst!: () => void
    const first = withActivePlanRequest(
      () => new Promise<void>((resolve) => {
        releaseFirst = resolve
      }),
    )
    await Promise.resolve()
    assert.deepEqual(getPlanRuntimeState(), { active: true, active_count: 1 })

    await assert.rejects(
      withActivePlanRequest(async () => {
        assert.deepEqual(getPlanRuntimeState(), { active: true, active_count: 2 })
        throw new Error("expected")
      }),
      /expected/,
    )
    assert.deepEqual(getPlanRuntimeState(), { active: true, active_count: 1 })

    releaseFirst()
    await first
    assert.deepEqual(getPlanRuntimeState(), { active: false, active_count: 0 })
  })
})
