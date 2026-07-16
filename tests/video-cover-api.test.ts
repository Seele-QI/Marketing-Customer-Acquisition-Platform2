import assert from "node:assert/strict"
import test from "node:test"

import { completionAttemptSequence } from "../lib/geo/llm/router.ts"
import { buildVideoCoverPrompt } from "../lib/video/cover-constants.ts"

test("cover prompt template is stable", () => {
  assert.equal(
    buildVideoCoverPrompt("abc"),
    "我准备拍摄一个短视频，文案如下（abc），请你根据我的文案来创作一个短视频封面",
  )
})

test("completionAttemptSequence unrelated sanity", () => {
  assert.deepEqual(completionAttemptSequence("deepseek", false), ["deepseek", "deepseek"])
})
