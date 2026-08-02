import assert from "node:assert/strict"
import test from "node:test"

import {
  listGeoDistributionBatches,
  matchGeoArticlesByPlatform,
  matchGeoArticlesByProjectDate,
} from "../lib/distribution/geo-platform-articles.ts"
import type { GeneratedArticle } from "../lib/geo/article-types.ts"

function article(
  id: string,
  platformId: string,
  projectId: string,
  date: string,
  createdAt: number,
): GeneratedArticle {
  return {
    id,
    jobId: id,
    projectId,
    mode: "matrix",
    platformId,
    date,
    title: `${platformId}-${id}`,
    markdown: `# ${platformId}-${id}`,
    status: "success",
    createdAt,
  }
}

test("one-click distribution resolves each platform's own matrix article", () => {
  const anchor = article("xhs", "xiaohongshu", "project-a", "2026-08-02", 1)
  const zhihu = article("zhihu", "zhihu", "project-a", "2026-08-02", 2)
  const wrongProject = article("weibo-b", "weibo", "project-b", "2026-08-02", 9)
  const weibo = article("weibo-a", "weibo", "project-a", "2026-08-02", 3)

  const result = matchGeoArticlesByPlatform({
    articles: [anchor, zhihu, wrongProject, weibo],
    anchor,
    platforms: ["xiaohongshu", "zhihu", "weibo"],
  })

  assert.deepEqual(
    result.matches.map(({ platform, article: matched }) => [platform, matched.id]),
    [["xiaohongshu", "xhs"], ["zhihu", "zhihu"], ["weibo", "weibo-a"]],
  )
  assert.deepEqual(result.missing, [])
})

test("missing platform article is reported instead of duplicating the anchor", () => {
  const anchor = article("xhs", "xiaohongshu", "project-a", "2026-08-02", 1)
  const result = matchGeoArticlesByPlatform({
    articles: [anchor],
    anchor,
    platforms: ["xiaohongshu", "zhihu"],
  })

  assert.deepEqual(result.matches.map(({ platform }) => platform), ["xiaohongshu"])
  assert.deepEqual(result.missing, ["zhihu"])
})

test("project/date selection automatically includes only connected platforms with their own article", () => {
  const xhsOld = article("xhs-old", "xiaohongshu", "project-a", "2026-08-02", 1)
  const xhsNew = article("xhs-new", "xiaohongshu", "project-a", "2026-08-02", 5)
  const baijiahao = article("baijiahao", "baijiahao", "project-a", "2026-08-02", 3)
  const wrongDate = article("zhihu", "zhihu", "project-a", "2026-08-03", 9)
  const wrongProject = article("weibo", "weibo", "project-b", "2026-08-02", 8)

  const result = matchGeoArticlesByProjectDate({
    articles: [xhsOld, xhsNew, baijiahao, wrongDate, wrongProject],
    projectId: "project-a",
    date: "2026-08-02",
    connectedPlatforms: ["xiaohongshu", "zhihu"],
  })

  assert.deepEqual(
    result.matches.map(({ platform, article: matched }) => [platform, matched.id]),
    [["xiaohongshu", "xhs-new"]],
  )
  assert.deepEqual(result.unbound, ["baijiahao"])
})

test("distribution batches are isolated by project and date", () => {
  const batches = listGeoDistributionBatches([
    article("a-xhs", "xiaohongshu", "project-a", "2026-08-02", 1),
    article("a-bjh", "baijiahao", "project-a", "2026-08-02", 2),
    article("a-next", "xiaohongshu", "project-a", "2026-08-03", 3),
    article("b-xhs", "xiaohongshu", "project-b", "2026-08-02", 4),
  ])

  assert.equal(batches.length, 3)
  const selected = batches.find(
    (batch) => batch.projectId === "project-a" && batch.date === "2026-08-02",
  )
  assert.deepEqual(selected?.platformIds.sort(), ["baijiahao", "xiaohongshu"])
})
