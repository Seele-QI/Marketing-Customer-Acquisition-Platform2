import assert from "node:assert/strict"
import test from "node:test"

import {
  COVER_ASPECT_RATIOS,
  COVER_RESOLUTIONS,
  buildVideoCoverPrompt,
  DEFAULT_COVER_ASPECT_RATIO,
  DEFAULT_COVER_RESOLUTION,
} from "../lib/video/cover-constants.ts"

test("buildVideoCoverPrompt wraps user script", () => {
  const prompt = buildVideoCoverPrompt("今天分享三个护肤小技巧")
  assert.match(prompt, /今天分享三个护肤小技巧/)
  assert.match(prompt, /短视频封面/)
})

test("cover defaults are 9:16 and 1k", () => {
  assert.equal(DEFAULT_COVER_ASPECT_RATIO, "9:16")
  assert.equal(DEFAULT_COVER_RESOLUTION, "1k")
})

test("cover enums include API values", () => {
  assert.ok(COVER_ASPECT_RATIOS.includes("9:16"))
  assert.ok(COVER_ASPECT_RATIOS.includes("3:4"))
  assert.deepEqual(COVER_RESOLUTIONS, ["1k", "2k", "4k"])
})
