import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  extractJsonFromText,
  normalizeIntake,
  validateIntake,
  validateIpPositioningReport,
} from "@/lib/ip-positioning-schema"

const SAMPLE_REPORT = {
  oneLiner: "帮助焦虑家长做理性升学决策",
  sharpDiagnosis: "你有教培创业证据，但表达仍偏行业术语，需要翻译成家长语言。",
  cognitivePosition: "「不刷题也能上好学校」的理性升学顾问",
  whyYouNotOthers: "10年教培创业 + 3000学员结果，比纯咨询老师更有实战证据。",
  differentiationLever: "反刷题升学路径设计",
  contrarianBelief: "刷题换不来好未来",
  uniqueMechanism: "理性升学三角模型",
  audienceProfile: "一二线城市焦虑家长",
  corePainAndDesire: "怕选错学校，渴望确定性",
  avoidDirections: ["纯鸡汤", "贩卖焦虑", "无关热点"],
  platformPlans: [
    {
      platform: "小红书",
      priority: 1,
      reason: "家长搜索决策强",
      contentStrategy: "清单体 + 案例对比",
    },
  ],
  contentPillars: ["选校逻辑", "案例拆解", "避坑清单"],
  starterTopics: ["topic1", "topic2", "topic3", "topic4", "topic5"],
  monetizationLadder: [
    { stage: "0-3月", offer: "咨询", priceRange: "999-2999", whyNow: "先验证需求" },
    { stage: "3-6月", offer: "小课", priceRange: "1999", whyNow: "放大交付" },
    { stage: "6-12月", offer: "年度会员", priceRange: "9999", whyNow: "沉淀资产" },
  ],
  thirtyDayPlan: [
    { week: "第1周", actions: ["完善简介", "发3条笔记"] },
    { week: "第2周", actions: ["做1个案例"] },
    { week: "第3周", actions: ["开直播"] },
    { week: "第4周", actions: ["上架咨询"] },
  ],
  confidenceScore: 82,
}

describe("ip-positioning schema", () => {
  it("normalizeIntake supports legacy flat body", () => {
    const intake = normalizeIntake({
      stage: "新手探索期",
      industry: "互联网",
      background: "5年产品",
      skills: "数据分析",
      extraInfo: "目标抖音",
    })
    assert.equal(intake.industry, "互联网")
    assert.equal(intake.keyExperiences, "5年产品")
    assert.equal(intake.resources, "数据分析")
    assert.equal(intake.extraInfo, "目标抖音")
    assert.equal(intake.stage, "novice")
  })

  it("validateIntake rejects missing required fields", () => {
    const intake = normalizeIntake({ industry: "互联网" })
    assert.ok(validateIntake(intake))
  })

  it("extractJsonFromText handles markdown code block", () => {
    const raw = "说明\n```json\n{\"oneLiner\":\"test\"}\n```"
    assert.equal(extractJsonFromText(raw), '{"oneLiner":"test"}')
  })

  it("validateIpPositioningReport accepts complete report", () => {
    assert.equal(validateIpPositioningReport(SAMPLE_REPORT), true)
  })

  it("validateIpPositioningReport rejects incomplete report", () => {
    assert.equal(validateIpPositioningReport({ oneLiner: "x" }), false)
  })
})

describe("ip-positioning analyze helpers", () => {
  it("resolveIpPositioningModel returns configured model when env set", async () => {
    const { resolveIpPositioningModel } = await import("@/lib/ip-positioning-schema")
    const prevKey = process.env.NEWAPI_KEY
    process.env.NEWAPI_KEY = "test-key"
    try {
      const { modelId, error } = resolveIpPositioningModel("gpt-5.5")
      assert.equal(modelId, "gpt-5.5")
      assert.equal(error, undefined)
    } finally {
      if (prevKey === undefined) delete process.env.NEWAPI_KEY
      else process.env.NEWAPI_KEY = prevKey
    }
  })
})
