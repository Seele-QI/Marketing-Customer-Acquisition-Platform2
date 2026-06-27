import { describe, it } from "node:test"
import assert from "node:assert/strict"
import {
  ivStageToStep,
  mvStageToStep,
  formatClipNetworkError,
  isClipTerminal,
  isClipSuccess,
} from "../lib/image-video-task-runtime.ts"
import { mvStageToStep as mvStep } from "../lib/mashup-video-task-runtime.ts"

describe("clip-task-runtime", () => {
  it("maps IV stages to UI steps", () => {
    assert.equal(ivStageToStep("iv_decoding_images", "queued"), 2)
    assert.equal(ivStageToStep("iv_decoding_images", "processing"), 1)
    assert.equal(ivStageToStep("iv_waiting_clone", "processing"), 2)
    assert.equal(ivStageToStep("iv_rendering", "processing"), 3)
  })

  it("maps MV stages to UI steps", () => {
    assert.equal(mvStep("mv_decoding_videos", "queued"), 2)
    assert.equal(mvStep("mv_decoding_videos", "processing"), 1)
    assert.equal(mvStep("mv_downloading_clone", "processing"), 2)
    assert.equal(mvStep("mv_rendering", "processing"), 3)
  })

  it("formats Failed to fetch", () => {
    assert.match(formatClipNetworkError(new Error("Failed to fetch")), /网络连接中断/)
  })

  it("detects terminal status", () => {
    assert.equal(isClipTerminal({ task_id: "x", status: "completed", stage: "iv_completed" }), true)
    assert.equal(isClipSuccess({ task_id: "x", status: "completed", stage: "iv_completed" }), true)
    assert.equal(isClipTerminal({ task_id: "x", status: "processing", stage: "iv_waiting_clone" }), false)
  })
})
