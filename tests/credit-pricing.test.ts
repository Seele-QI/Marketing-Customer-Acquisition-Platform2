import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  COPYWRITING_LLM_ECONOMY,
  COPYWRITING_LLM_PREMIUM,
  GEO_ARTICLE_ECONOMY,
  GEO_ARTICLE_PREMIUM,
  classifyGeoProvider,
  classifyModel,
  resolveBillingCost,
  sceneCost,
  segmentCostForProvider,
} from "@/lib/credit-pricing/registry"

describe("credit-pricing registry", () => {
  it("classifies model tiers", () => {
    assert.equal(classifyModel("deepseek-chat"), "economy")
    assert.equal(classifyModel("gpt-5.5"), "premium")
    assert.equal(classifyModel("claude-opus-4-8"), "premium")
    assert.equal(classifyModel("gpt-5.6-custom"), "premium")
    assert.equal(classifyModel("claude-sonnet-cloud"), "premium")
    assert.equal(classifyModel("private-model"), "economy")
  })

  it("classifies geo providers", () => {
    assert.equal(classifyGeoProvider("deepseek"), "economy")
    assert.equal(classifyGeoProvider("claude"), "premium")
    assert.equal(classifyGeoProvider("gpt-5.5"), "premium")
    assert.equal(classifyGeoProvider("claude-opus-4-8"), "premium")
    assert.equal(classifyGeoProvider("openai/gpt-5.5"), "premium")
    assert.equal(classifyGeoProvider("anthropic/claude-opus-4"), "premium")
  })

  it("resolves copywriting llm costs", () => {
    const eco = resolveBillingCost("copywriting.llm_call", { modelId: "deepseek-chat" })
    assert.equal(eco.scene, "copywriting_llm")
    assert.equal(eco.cost, COPYWRITING_LLM_ECONOMY)
    assert.equal(eco.cost, 2)

    const prem = resolveBillingCost("copywriting.llm_call", { modelId: "gpt-5.5" })
    assert.equal(prem.cost, COPYWRITING_LLM_PREMIUM)
    assert.equal(prem.cost, 15)
  })

  it("resolves geo article costs", () => {
    const eco = resolveBillingCost("geo.article", { provider: "doubao" })
    assert.equal(eco.scene, "geo_article")
    assert.equal(eco.cost, GEO_ARTICLE_ECONOMY)
    assert.equal(eco.cost, 10)

    const prem = resolveBillingCost("geo.article", { provider: "gpt" })
    assert.equal(prem.cost, GEO_ARTICLE_PREMIUM)
    assert.equal(prem.cost, 30)
  })

  it("resolves dh-v2 segment and retry", () => {
    const seg = resolveBillingCost("video.dh_v2_segment", {
      provider: "seedance",
      segmentCount: 2,
    })
    assert.equal(seg.scene, "dh_v2_video_segment")
    assert.equal(seg.cost, 900)
    assert.equal(segmentCostForProvider("seedance"), 450)

    const retry = resolveBillingCost("video.dh_v2_retry", { provider: "seedance" })
    assert.equal(retry.scene, "dh_v2_video_retry")
    assert.equal(retry.cost, 450)
  })

  it("resolves economy digital-human segment and retry", () => {
    const twoSegments = resolveBillingCost("video.dh_economy_segment", {
      durationSeconds: 36,
      segmentCount: 2,
    })
    assert.equal(twoSegments.scene, "dh_economy_video_segment")
    assert.equal(twoSegments.cost, 500)

    const threeSegments = resolveBillingCost("video.dh_economy_segment", {
      durationSeconds: 60,
      segmentCount: 3,
    })
    assert.equal(threeSegments.cost, 750)

    const fourSegments = resolveBillingCost("video.dh_economy_segment", {
      durationSeconds: 60.001,
      segmentCount: 4,
    })
    assert.equal(fourSegments.cost, 1000)

    const retry = resolveBillingCost("video.dh_economy_retry")
    assert.equal(retry.scene, "dh_economy_video_retry")
    assert.equal(retry.cost, 250)
  })

  it("resolves promo segment by duration", () => {
    const r = resolveBillingCost("video.promo_segment", { duration: 45 })
    assert.equal(r.scene, "promo_video_segment")
    assert.equal(r.cost, 1350)
  })

  it("fixed scene costs match plan", () => {
    assert.equal(sceneCost("poster_image"), 20)
    assert.equal(sceneCost("image_creation"), 20)
    assert.equal(sceneCost("geo_skill_gen"), 25)
    assert.equal(sceneCost("geo_matrix_gen"), 25)
    assert.equal(sceneCost("geo_research"), 5)
    assert.equal(sceneCost("dh_v2_plan_script"), 20)
    assert.equal(sceneCost("video_image_to_video"), 40)
    assert.equal(sceneCost("video_mashup"), 50)
    assert.equal(sceneCost("promo_storyboard"), 50)
    assert.equal(sceneCost("copy_extract"), 5)
    assert.equal(sceneCost("video_clone_voice"), 10)
  })
})
