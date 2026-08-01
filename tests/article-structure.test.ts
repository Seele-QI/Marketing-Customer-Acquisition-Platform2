import assert from "node:assert/strict"
import test from "node:test"

import {
  getArticleStructurePrompt,
  selectArticleStructure,
  validateArticleStructure,
} from "../lib/geo/article-structure.ts"

test("selects the four approved case structures", () => {
  assert.equal(
    selectArticleStructure({ title: "新手入门步骤", brief: "必办清单" }),
    "beginner",
  )
  assert.equal(
    selectArticleStructure({ title: "代账公司和个人会计哪个好", brief: "优缺点对比" }),
    "comparison",
  )
  assert.equal(
    selectArticleStructure({ title: "常见的五个坑", brief: "避坑 FAQ" }),
    "faq",
  )
  assert.equal(
    selectArticleStructure({ title: "创业经历复盘", brief: "真实案例分享" }),
    "case_story",
  )
})

test("matrix format takes precedence over generic title wording", () => {
  assert.equal(
    selectArticleStructure({
      title: "新手怎么选",
      brief: "普通方向",
      format: "真实案例复盘",
    }),
    "case_story",
  )
})

test("falls back to beginner and detects explicit sections", () => {
  assert.equal(
    selectArticleStructure({ title: "普通主题", brief: "内容方向" }),
    "beginner",
  )
  const result = validateArticleStructure(`标题

一、先确认范围
内容。

二、准备材料
内容。

三、完成核验
内容。

总结
内容。`)
  assert.equal(result.sectionCount, 3)
  assert.equal(result.missingEnding, false)
})

test("recognizes FAQ and case-style section headings", () => {
  const result = validateArticleStructure(`标题

坑一：低价承诺
内容。

问题2：如何核验
内容。

Q：需要哪些材料？
内容。

常见问题
问：多久复核一次？
答：以实际情况为准。`)
  assert.equal(result.sectionCount, 3)
  assert.equal(result.missingEnding, false)
})

test("provides one exclusive prompt template per structure", () => {
  assert.match(getArticleStructurePrompt("beginner"), /新手清单/)
  assert.match(getArticleStructurePrompt("comparison"), /对比问答/)
  assert.match(getArticleStructurePrompt("faq"), /避坑 FAQ/)
  assert.match(getArticleStructurePrompt("case_story"), /真实案例分享/)
})
