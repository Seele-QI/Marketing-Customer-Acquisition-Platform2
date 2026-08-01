import assert from "node:assert/strict"
import test from "node:test"

import {
  applyArticleIllustrations,
  planArticleIllustrations,
} from "@/lib/geo/article-illustration-planner"

const ARTICLE = `# 企业财税管理指南

开篇介绍本文要解决的问题。

## 风险识别

企业应先识别合同、发票与资金流中的真实风险，并保留业务证据。

## 联系方式

联系人：张经理，电话：13800000000。

## 处理步骤

第一步核对业务资料，第二步定位差异，第三步形成整改记录。

## 已有配图

![人工上传](data:image/png;base64,YQ==)

这部分已经存在人工图片。

## 案例拆解

某企业通过分阶段核对资料，发现流程断点并完成修正。

## 常见问题 FAQ

这里回答常见问题。

## 总结

以上是本文总结。

标签：财税、企业管理
`

test("planner selects safe body sections and uses the platform ratio", () => {
  const plan = planArticleIllustrations({
    projectId: "p1",
    articleId: "a1",
    platformId: "zhihu",
    title: "企业财税管理指南",
    markdown: ARTICLE,
    count: 3,
  })

  assert.deepEqual(
    plan.map((item) => item.anchorHeading),
    ["风险识别", "处理步骤", "案例拆解"],
  )
  assert.ok(plan.every((item) => item.aspectRatio === "16:9"))
  assert.ok(plan.every((item) => item.resolution === "1k"))
  assert.ok(plan.every((item) => item.prompt.includes("不要生成文字、水印、Logo 或二维码")))
  assert.ok(plan.every((item) => !/RunningHub|workflow|模型/i.test(item.prompt)))
})

test("planner is deterministic, distinguishes duplicate headings, and reduces count", () => {
  const markdown = `# 标题

## 步骤
第一段有足够的业务内容用于生成配图。

## 步骤
第二段也有足够的业务内容用于生成配图。
`
  const first = planArticleIllustrations({
    projectId: "p1",
    articleId: "a1",
    platformId: "douyin",
    title: "标题",
    markdown,
    count: 5,
  })
  const second = planArticleIllustrations({
    projectId: "p1",
    articleId: "a1",
    platformId: "douyin",
    title: "标题",
    markdown,
    count: 5,
  })

  assert.equal(first.length, 2)
  assert.deepEqual(first, second)
  assert.deepEqual(first.map((item) => item.anchorOccurrence), [1, 2])
  assert.equal(new Set(first.map((item) => item.illustrationId)).size, 2)
})

test("insertion is idempotent and preserves manual images", () => {
  const [planned] = planArticleIllustrations({
    projectId: "p1",
    articleId: "a1",
    platformId: "zhihu",
    title: "企业财税管理指南",
    markdown: ARTICLE,
    count: 1,
  })
  const result = {
    ...planned!,
    status: "success" as const,
    imageUrl: `/static/geo-article-illustrations/p1/a1/${planned!.illustrationId}.png`,
  }
  const once = applyArticleIllustrations(ARTICLE, [result])
  const twice = applyArticleIllustrations(once.markdown, [result])

  assert.equal(twice.markdown, once.markdown)
  assert.equal(once.unplaced.length, 0)
  assert.match(
    once.markdown,
    new RegExp(`<!-- geo-article-illustration:${planned!.illustrationId} -->`),
  )
  assert.match(once.markdown, /!\[人工上传\]\(data:image\/png;base64,YQ==\)/)
})

test("failed results and unsafe URLs are never inserted", () => {
  const result = applyArticleIllustrations(ARTICLE, [
    {
      illustrationId: "ill-1",
      anchorHeading: "风险识别",
      anchorOccurrence: 1,
      alt: "风险图",
      status: "success",
      imageUrl: "https://upstream.example/a.png",
    },
    {
      illustrationId: "ill-2",
      anchorHeading: "处理步骤",
      anchorOccurrence: 1,
      alt: "步骤图",
      status: "failed",
    },
  ])
  assert.equal(result.markdown, ARTICLE)
  assert.deepEqual(result.unplaced, ["ill-1"])
})
