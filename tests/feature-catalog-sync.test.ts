import assert from "node:assert/strict"
import { describe, it, before, after } from "node:test"

import {
  loadSyncedFeatures,
  syncedSceneUnitCost,
} from "../lib/llm/feature-catalog-sync.ts"
import { sceneCost, resolveBillingCost } from "../lib/credit-pricing/registry.ts"

function encodeFeatures(features: unknown[], providers: unknown[] = []) {
  const featB64 = Buffer.from(JSON.stringify({ features, version: "t1" }), "utf8").toString("base64")
  const provB64 = Buffer.from(JSON.stringify({ providers, version: "t1" }), "utf8").toString("base64")
  return { featB64, provB64 }
}

describe("feature-catalog-sync", () => {
  const prevFeat = process.env.FEATURE_CATALOG_JSON_B64
  const prevProv = process.env.MODEL_PROVIDERS_JSON_B64

  after(() => {
    if (prevFeat === undefined) delete process.env.FEATURE_CATALOG_JSON_B64
    else process.env.FEATURE_CATALOG_JSON_B64 = prevFeat
    if (prevProv === undefined) delete process.env.MODEL_PROVIDERS_JSON_B64
    else process.env.MODEL_PROVIDERS_JSON_B64 = prevProv
  })

  it("falls back to constants without sync", () => {
    delete process.env.FEATURE_CATALOG_JSON_B64
    assert.equal(loadSyncedFeatures().length, 0)
    assert.equal(sceneCost("image_creation"), 20)
  })

  it("prefers synced unit cost for sceneCost", () => {
    const { featB64 } = encodeFeatures([
      {
        feature_id: "image.general.generate",
        enabled: true,
        billing_mode: "fixed",
        scene: "image_creation",
        billing_key: "",
        unit_cost: 25,
        economy_cost: null,
        premium_cost: null,
        segment_unit_cost: null,
        price_version: 2,
        provider_ids: [],
      },
    ])
    process.env.FEATURE_CATALOG_JSON_B64 = featB64
    assert.equal(syncedSceneUnitCost("image_creation"), 25)
    assert.equal(sceneCost("image_creation"), 25)
  })

  it("uses synced segment unit in resolveBillingCost", () => {
    const { featB64 } = encodeFeatures([
      {
        feature_id: "video.dh.economy.segment",
        enabled: true,
        billing_mode: "segment",
        scene: "dh_economy_video_segment",
        billing_key: "video.dh_economy_segment",
        unit_cost: null,
        economy_cost: null,
        premium_cost: null,
        segment_unit_cost: 300,
        price_version: 1,
        provider_ids: [],
      },
    ])
    process.env.FEATURE_CATALOG_JSON_B64 = featB64
    const r = resolveBillingCost("video.dh_economy_segment", { segmentCount: 2 })
    assert.equal(r.cost, 600)
  })
})
