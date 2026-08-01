import assert from "node:assert/strict"
import test from "node:test"

import {
  getGuideCompleted,
  getGuideCursor,
  parseGuideProgress,
  setGuideCompleted,
  setGuideCursor,
} from "@/lib/business-assistant/guide-progress"

test("guide progress recovers from malformed or unsupported storage", () => {
  assert.deepEqual(parseGuideProgress("{broken"), {
    version: 1,
    cursors: {},
    completed: {},
  })
  assert.deepEqual(parseGuideProgress(JSON.stringify({ version: 99, cursors: {} })), {
    version: 1,
    cursors: {},
    completed: {},
  })
})

test("guide cursors are isolated per view and clamped to the guide length", () => {
  let state = parseGuideProgress(null)
  state = setGuideCursor(state, "数字人视频创作（新）", 8, 3)
  state = setGuideCursor(state, "企业知识库搭建", -4, 4)

  assert.equal(getGuideCursor(state, "数字人视频创作（新）", 3), 2)
  assert.equal(getGuideCursor(state, "企业知识库搭建", 4), 0)
  assert.equal(getGuideCursor(state, "海报图创作", 0), 0)
  assert.equal("projectId" in state, false)
})

test("a guide becomes complete only after the final confirmation", () => {
  let state = parseGuideProgress(null)
  assert.equal(getGuideCompleted(state, "数字人视频创作（新）"), false)
  state = setGuideCompleted(state, "数字人视频创作（新）", true)
  assert.equal(getGuideCompleted(state, "数字人视频创作（新）"), true)
})
