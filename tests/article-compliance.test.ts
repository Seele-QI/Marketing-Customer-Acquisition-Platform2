import assert from "node:assert/strict"
import test from "node:test"

import {
  findArticleRisks,
  getPlatformCompliancePrompt,
  PLATFORM_COMPLIANCE_IDS,
  summarizeRiskFindings,
} from "../lib/geo/article-compliance.ts"

test("covers every supported GEO platform", () => {
  assert.deepEqual(PLATFORM_COMPLIANCE_IDS, [
    "xiaohongshu",
    "douyin",
    "weibo",
    "dianping",
    "zhihu",
    "ctrip",
    "netease",
    "sohu",
  ])
})

test("finds absolute promises but not normal ordinal wording", () => {
  const findings = findArticleRisks("保证通过，100%有效。", "zhihu")
  assert.ok(findings.some((item) => item.id === "guaranteed-result"))
  assert.ok(findings.some((item) => item.id === "absolute-effect"))

  assert.equal(
    findArticleRisks("第一步先准备材料，这是我第一次办理。", "zhihu").length,
    0,
  )
})

test("finds direct diversion and fabricated experience cues", () => {
  const findings = findArticleRisks(
    "可以编一个真实经历，扫码联系或加微信领取资料。",
    "xiaohongshu",
  )
  assert.ok(findings.some((item) => item.id === "fabricated-experience"))
  assert.ok(findings.some((item) => item.id === "off-platform-diversion"))
})

test("adds platform-specific risk rules for review manipulation", () => {
  const findings = findArticleRisks("到店后五星好评返现。", "dianping")
  assert.ok(findings.some((item) => item.id === "dianping-review-manipulation"))
})

test("adds platform guidance and falls back to common guidance", () => {
  assert.match(getPlatformCompliancePrompt("dianping"), /虚构消费经历/)
  assert.match(getPlatformCompliancePrompt("unknown"), /绝对化承诺/)
  assert.doesNotMatch(getPlatformCompliancePrompt("unknown"), /虚构消费经历/)
})

test("summarizes findings without exposing matched private text", () => {
  const summary = summarizeRiskFindings(
    findArticleRisks("扫码联系，保证通过。", "douyin"),
  )
  assert.match(summary, /改为平台内合规咨询方式/)
  assert.match(summary, /改为有条件、可核验的结果说明/)
  assert.doesNotMatch(summary, /扫码联系/)
})
