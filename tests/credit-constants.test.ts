import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { FIXED_SCENE_COSTS, sceneCost } from "@/lib/credit-pricing/registry"

describe("credit-constants", () => {
  it("includes fixed-price GEO and video scenes", () => {
    const required = [
      "geo_matrix_gen",
      "geo_skill_gen",
      "geo_research",
      "geo_authority_link",
      "dh_v2_plan_script",
      "dh_v2_video_retry",
      "video_image_to_video",
      "video_mashup",
      "promo_storyboard",
      "copy_extract",
      "video_clone_voice",
    ]
    for (const scene of required) {
      assert.ok(scene in FIXED_SCENE_COSTS, `missing ${scene}`)
      assert.ok(sceneCost(scene) > 0, `${scene} must have positive cost`)
    }
  })

  it("returns 0 for unknown scene", () => {
    assert.equal(sceneCost("unknown_scene"), 0)
  })
})
