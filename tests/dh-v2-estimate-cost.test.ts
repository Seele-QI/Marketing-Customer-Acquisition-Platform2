import assert from "node:assert/strict"
import { describe, it } from "node:test"

import { estimateDhVideoV2Cost } from "../lib/dh-video-v2/constants.ts"

describe("estimateDhVideoV2Cost", () => {
  it("charges 450 per 15s segment", () => {
    assert.equal(estimateDhVideoV2Cost("seedance", 15, "720p", 1), 450)
    assert.equal(estimateDhVideoV2Cost("seedance", 30, "720p", 2), 900)
    assert.equal(estimateDhVideoV2Cost("seedance", 45, "720p", 3), 1350)
  })

  it("derives segment count from plan duration when count omitted", () => {
    assert.equal(estimateDhVideoV2Cost("seedance", 30, "720p"), 900)
    assert.equal(estimateDhVideoV2Cost("seedance", 45, "720p"), 1350)
  })
})
