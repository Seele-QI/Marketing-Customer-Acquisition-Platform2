import assert from "node:assert/strict"
import test from "node:test"

import {
  ENTERPRISE_SKILL_REQUIRED_SECTIONS,
  ensureEnterpriseSkillSections,
  inspectEnterpriseSkill,
  normalizeEnterpriseSkill,
} from "../lib/geo/enterprise-skill-quality.ts"

function completeSkill(): string {
  const sections = ENTERPRISE_SKILL_REQUIRED_SECTIONS.map((heading) => {
    if (heading === "FAQ") {
      return `## FAQ\n\n${Array.from(
        { length: 8 },
        (_, index) => `### Q${index + 1}：问题 ${index + 1}？\n\n答：依据已提供资料回答。`,
      ).join("\n\n")}`
    }
    if (heading === "团队与资质") {
      return "## 团队与资质\n\n成立时间：2020年【来源：企业介绍.md】"
    }
    if (heading === "资料来源与待补充项") {
      return "## 资料来源与待补充项\n\n- 企业介绍.md"
    }
    return `## ${heading}\n\n已提供资料摘要。`
  }).join("\n\n")

  return `---\nname: example-enterprise-kb\ndescription: Use when creating content about Example Enterprise.\n---\n\n${sections}\n`
}

test("accepts a complete evidence-aware enterprise skill", () => {
  const report = inspectEnterpriseSkill(completeSkill())
  assert.equal(report.passed, true)
  assert.equal(report.score, 100)
  assert.deepEqual(report.issues, [])
})

test("reports missing sections, insufficient FAQ, fences, and unsupported claims", () => {
  const report = inspectEnterpriseSkill(`\`\`\`markdown
---
name: incomplete
description: Use when needed.
---

## Overview

已为100家客户节省30%成本。

## FAQ

### Q1：能做什么？

答：待补充。
\`\`\``)

  assert.equal(report.passed, false)
  assert.ok(report.score < 100)
  assert.ok(report.issues.some((issue) => issue.includes("缺少章节")))
  assert.ok(report.issues.some((issue) => issue.includes("FAQ")))
  assert.ok(report.issues.some((issue) => issue.includes("代码围栏")))
  assert.ok(report.issues.some((issue) => issue.includes("高风险事实")))
})

test("normalization removes fences and marks unsupported high-risk facts", () => {
  const normalized = normalizeEnterpriseSkill(`\`\`\`md
## 客户案例与评价

已为100家客户节省30%成本。
\`\`\``)
  assert.doesNotMatch(normalized, /```/)
  assert.match(normalized, /已为100家客户节省30%成本。 【待核验】/)
})

test("normalization keeps Markdown tables valid when marking a risky fact", () => {
  const normalized = normalizeEnterpriseSkill(`## 企业档案

| 字段 | 内容 |
| --- | --- |
| 成立时间 | 2020年 |`)
  assert.match(normalized, /\| 成立时间 \| 2020年 【待核验】 \|/)
  assert.doesNotMatch(normalized, /\| 2020年 \| 【待核验】/)
})

test("safe fallback supplies ordered sections and eight non-fabricated FAQs", () => {
  const ensured = ensureEnterpriseSkillSections(`## 产品要点

- 代理记账

## FAQ

### Q1：提供什么服务？

答：代理记账。`)

  let previousIndex = -1
  for (const heading of ENTERPRISE_SKILL_REQUIRED_SECTIONS) {
    const currentIndex = ensured.indexOf(`## ${heading}`)
    assert.ok(currentIndex > previousIndex, `${heading} should exist in canonical order`)
    previousIndex = currentIndex
  }
  assert.equal((ensured.match(/^### Q\d+[：:]/gm) ?? []).length, 8)
  assert.match(ensured, /## 产品与服务\n\n- 代理记账/)
  assert.match(ensured, /待补充/)
  assert.equal(inspectEnterpriseSkill(normalizeEnterpriseSkill(ensured)).passed, true)
})

test("safe fallback repairs invalid frontmatter deterministically", () => {
  const ensured = ensureEnterpriseSkillSections(`---
name: 中文名称
description: 企业知识库
---

## Overview

企业定位。`)
  assert.match(ensured, /name: enterprise-kb/)
  assert.match(ensured, /description: Use when creating or reviewing content about this enterprise\./)
  assert.equal(inspectEnterpriseSkill(normalizeEnterpriseSkill(ensured)).passed, true)
})

test("safe fallback preserves a valid description when name is missing", () => {
  const ensured = ensureEnterpriseSkillSections(`---
description: Use when answering questions about the enterprise.
---

## Overview

企业定位。`)
  assert.match(ensured, /name: enterprise-kb/)
  assert.match(ensured, /description: Use when answering questions about the enterprise\./)
})
