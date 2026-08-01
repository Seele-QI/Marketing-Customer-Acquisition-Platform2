import assert from "node:assert/strict"
import test from "node:test"

import {
  clampIllustrationsPerArticle,
  parseArticleIllustrationGenerateRequest,
  parseArticleIllustrationStatus,
  resolveArticleIllustrationRatio,
} from "@/lib/geo/article-illustration-types"

test("clamps GEO illustration count to zero through five", () => {
  assert.equal(clampIllustrationsPerArticle(-1), 0)
  assert.equal(clampIllustrationsPerArticle(3), 3)
  assert.equal(clampIllustrationsPerArticle(99), 5)
  assert.equal(clampIllustrationsPerArticle(Number.NaN), 0)
})

test("maps GEO platforms to fixed image ratios", () => {
  assert.equal(resolveArticleIllustrationRatio("xiaohongshu"), "3:4")
  assert.equal(resolveArticleIllustrationRatio("weibo"), "3:4")
  assert.equal(resolveArticleIllustrationRatio("douyin"), "9:16")
  assert.equal(resolveArticleIllustrationRatio("dianping"), "4:3")
  assert.equal(resolveArticleIllustrationRatio("ctrip"), "4:3")
  assert.equal(resolveArticleIllustrationRatio("zhihu"), "16:9")
  assert.equal(resolveArticleIllustrationRatio("netease"), "16:9")
  assert.equal(resolveArticleIllustrationRatio("sohu"), "16:9")
  assert.equal(resolveArticleIllustrationRatio("unknown"), "4:3")
})

test("strict request parser rejects client model controls and invalid counts", () => {
  const valid = {
    projectId: "p1",
    articleId: "a1",
    platformId: "zhihu",
    title: "企业财税管理",
    markdown: "## 风险识别\n企业需要识别真实风险。",
    illustrationCount: 2,
  }
  assert.equal(
    parseArticleIllustrationGenerateRequest(valid).illustrationCount,
    2,
  )
  assert.throws(
    () => parseArticleIllustrationGenerateRequest({ ...valid, model: "x" }),
    /不支持的请求字段/,
  )
  assert.throws(
    () => parseArticleIllustrationGenerateRequest({ ...valid, illustrationCount: 0 }),
    /1 到 5/,
  )
})

test("status parser keeps only product fields and safe local image URLs", () => {
  const status = parseArticleIllustrationStatus({
    task_id: "task-1",
    project_id: "p1",
    article_id: "a1",
    status: "success",
    model: "hidden-model",
    items: [
      {
        illustration_id: "ill-1",
        anchor_heading: "风险识别",
        anchor_occurrence: 1,
        alt: "风险识别示意图",
        status: "success",
        image_url: "/static/geo-article-illustrations/p1/a1/ill-1.png",
        provider: "hidden-provider",
      },
      {
        illustration_id: "ill-2",
        anchor_heading: "处理步骤",
        anchor_occurrence: 1,
        alt: "处理步骤示意图",
        status: "success",
        image_url: "https://upstream.example/result.png",
      },
    ],
  })

  assert.equal(status.items[0]?.imageUrl, "/static/geo-article-illustrations/p1/a1/ill-1.png")
  assert.equal(status.items[1]?.status, "failed")
  assert.equal("model" in status, false)
  assert.equal("provider" in status.items[0]!, false)
})
