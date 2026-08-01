import assert from "node:assert/strict"
import test from "node:test"

import {
  parseImageWorkbenchRequest,
  resolveImageAspectRatio,
} from "@/lib/image-workbench/types"
import { IMAGE_WORKBENCH_STRATEGIES } from "@/lib/image-workbench/strategies"

test("image workbench resolves portrait and landscape ratios", () => {
  assert.equal(resolveImageAspectRatio("3:4", "portrait"), "3:4")
  assert.equal(resolveImageAspectRatio("3:4", "landscape"), "4:3")
  assert.equal(resolveImageAspectRatio("9:16", "landscape"), "16:9")
  assert.equal(resolveImageAspectRatio("9:25", "portrait"), "9:25")
  assert.equal(resolveImageAspectRatio("9:25", "landscape"), "25:9")
  assert.equal(resolveImageAspectRatio("1:1", "landscape"), "1:1")
})

test("image workbench validates poster reference roles", () => {
  const parsed = parseImageWorkbenchRequest({
    mode: "poster",
    prompt: "品牌海报",
    aspect_ratio: "3:4",
    resolution: "2k",
    count: 2,
    reference_images: [
      { role: "subject", mime_type: "image/png", data_base64: "YQ==" },
      { role: "style", mime_type: "image/jpeg", data_base64: "Yg==" },
    ],
  })

  assert.equal(parsed.reference_images.length, 2)
  assert.deepEqual(
    parsed.reference_images.map((image) => image.role),
    ["subject", "style"],
  )
})

test("image workbench rejects too many general references", () => {
  assert.throws(
    () =>
      parseImageWorkbenchRequest({
        mode: "image",
        prompt: "场景设计",
        aspect_ratio: "16:9",
        resolution: "1k",
        count: 2,
        reference_mode: "remix",
        reference_images: Array.from({ length: 5 }, () => ({
          role: "general",
          mime_type: "image/webp",
          data_base64: "YQ==",
        })),
      }),
    /最多添加 4 张参考图/,
  )
})

test("image workbench strips data URL prefixes and normalizes image roles", () => {
  const parsed = parseImageWorkbenchRequest({
    mode: "image",
    prompt: "人物写真",
    aspect_ratio: "9:16",
    resolution: "2k",
    count: 2,
    reference_images: [
      {
        role: "subject",
        mime_type: "image/png",
        data_base64: "data:image/png;base64,YQ==",
      },
    ],
  })
  assert.equal(parsed.reference_images[0]?.role, "general")
  assert.equal(parsed.reference_images[0]?.data_base64, "YQ==")
})

test("image workbench strategies use independent billing scenes", () => {
  assert.equal(IMAGE_WORKBENCH_STRATEGIES.poster.billingScene, "poster_image")
  assert.equal(IMAGE_WORKBENCH_STRATEGIES.image.billingScene, "image_creation")
  assert.equal(IMAGE_WORKBENCH_STRATEGIES.poster.maxReferences, 2)
  assert.equal(IMAGE_WORKBENCH_STRATEGIES.image.maxReferences, 4)
})
