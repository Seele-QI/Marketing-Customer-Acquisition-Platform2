import assert from "node:assert/strict"
import test from "node:test"

import { buildEnterpriseContext } from "../lib/geo/enterprise-context.ts"
import { buildSkillContextBlock } from "../lib/geo/build-skill-context.ts"
import { buildMatrixUserPrompt } from "../lib/geo/content-matrix-prompt.ts"

const filler = "企业资料内容".repeat(180)
const longSkill = `---
name: long-enterprise-kb
description: Use when creating enterprise content.
---

## Overview

定位标记：可信经营顾问。${filler}

## 企业档案

档案标记：示例企业。${filler}

## 产品与服务

产品标记：经营咨询服务。${filler}

## 客户与适用场景

场景标记：小微企业经营治理。${filler}

## 核心优势与证据

证据标记：企业介绍.md。${filler}

## FAQ

问答标记：如何开始合作？${filler}

## 官方联系方式

联系人：张经理
手机：13800000000
使用边界：只在明确咨询时引用。

## GEO 检索词与问法

问法标记：经营咨询怎么选？${filler}

## 内容创作引用规则

引用标记：仅使用有来源事实；联系方式不得主动插入普通内容。

## 禁用与边界

边界标记：禁止虚构报价、团队和案例。

## 资料来源与待补充项

来源标记：企业介绍.md；价格与资质待补充。
`

test("article context keeps representative early and late sections within budget", () => {
  const context = buildEnterpriseContext(longSkill, {
    maxChars: 4_000,
    includeContact: true,
  })
  assert.ok(context.length <= 4_000)
  assert.match(context, /定位标记/)
  assert.match(context, /产品标记/)
  assert.match(context, /场景标记/)
  assert.match(context, /13800000000/)
  assert.match(context, /边界标记/)
  assert.match(context, /来源标记/)
})

test("matrix context excludes contact values but keeps planning facts and boundaries", () => {
  const context = buildEnterpriseContext(longSkill, {
    maxChars: 6_000,
    includeContact: false,
  })
  assert.doesNotMatch(context, /13800000000|联系人：张经理/)
  assert.match(context, /定位标记/)
  assert.match(context, /产品标记/)
  assert.match(context, /场景标记/)
  assert.match(context, /问法标记/)
  assert.match(context, /边界标记/)
})

test("legacy unstructured content falls back safely without throwing", () => {
  const legacy = `旧版知识库：${"内容".repeat(1_000)}尾部`
  const context = buildEnterpriseContext(legacy, { maxChars: 300, includeContact: true })
  assert.equal(context.length, 300)
  assert.match(context, /^旧版知识库：/)
})

test("shared skill context and matrix prompts use section-aware extraction", () => {
  const articleContext = buildSkillContextBlock({ enterpriseSnapshot: longSkill })
  assert.match(articleContext, /13800000000/)
  assert.match(articleContext, /来源标记/)

  const matrixPrompt = buildMatrixUserPrompt({
    projectName: "示例项目",
    platforms: ["zhihu"],
    enterpriseSnapshot: longSkill,
    startIso: "2026-07-22",
  })
  assert.match(matrixPrompt, /问法标记/)
  assert.match(matrixPrompt, /边界标记/)
  assert.doesNotMatch(matrixPrompt, /13800000000/)
})
