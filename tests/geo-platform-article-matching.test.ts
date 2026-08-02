import assert from "node:assert/strict"
import test from "node:test"

import { matchGeoArticlesByPlatform } from "../lib/distribution/geo-platform-articles.ts"
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
