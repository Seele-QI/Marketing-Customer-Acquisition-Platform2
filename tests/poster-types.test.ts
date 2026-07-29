import assert from "node:assert/strict"
import test from "node:test"

import {
  parsePosterGenerationRequest,
  resolvePosterAspectRatio,
} from "@/lib/poster/types"

test("poster ratios resolve portrait and landscape variants", () => {
  assert.equal(resolvePosterAspectRatio("3:4", "portrait"), "3:4")
  assert.equal(resolvePosterAspectRatio("3:4", "landscape"), "4:3")
  assert.equal(resolvePosterAspectRatio("9:16", "portrait"), "9:16")
  assert.equal(resolvePosterAspectRatio("9:16", "landscape"), "16:9")
  assert.equal(resolvePosterAspectRatio("9:25", "portrait"), "9:25")
  assert.equal(resolvePosterAspectRatio("9:25", "landscape"), "25:9")
})

test("square poster ratio ignores orientation", () => {
  assert.equal(resolvePosterAspectRatio("1:1", "portrait"), "1:1")
  assert.equal(resolvePosterAspectRatio("1:1", "landscape"), "1:1")
})

test("poster server contract validates before billing", () => {
  assert.deepEqual(
    parsePosterGenerationRequest({
      prompt: "  商业海报  ",
      aspect_ratio: "25:9",
      resolution: "2k",
      count: 2,
    }),
    {
      prompt: "商业海报",
      aspect_ratio: "25:9",
      resolution: "2k",
      count: 2,
    },
  )
  assert.throws(
    () =>
      parsePosterGenerationRequest({
        prompt: "海报",
        aspect_ratio: "7:11",
        resolution: "2k",
        count: 2,
      }),
    /不支持的海报比例/,
  )
  assert.throws(
    () =>
      parsePosterGenerationRequest({
        prompt: "",
        aspect_ratio: "3:4",
        resolution: "2k",
        count: 2,
      }),
    /缺少提示词/,
  )
})
