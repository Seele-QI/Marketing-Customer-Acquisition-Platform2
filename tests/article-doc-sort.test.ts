import assert from "node:assert/strict"
import test from "node:test"

import { compareByArticleDate, sortByArticleDate } from "../lib/geo/article-doc-sort.ts"

test("sortByArticleDate orders ascending by date", () => {
  const sorted = sortByArticleDate([
    { date: "2026-07-18", platformId: "zhihu", createdAt: 3 },
    { date: "2026-07-15", platformId: "douyin", createdAt: 1 },
    { date: "2026-07-17", platformId: "xiaohongshu", createdAt: 2 },
  ])
  assert.deepEqual(
    sorted.map((x) => x.date),
    ["2026-07-15", "2026-07-17", "2026-07-18"],
  )
})

test("sortByArticleDate puts missing dates last", () => {
  const sorted = sortByArticleDate([
    { date: undefined, platformId: "zhihu", createdAt: 9 },
    { date: "2026-07-15", platformId: "douyin", createdAt: 1 },
    { date: "", platformId: "weibo", createdAt: 8 },
  ])
  assert.equal(sorted[0]?.date, "2026-07-15")
  assert.ok(!sorted[1]?.date?.trim())
  assert.ok(!sorted[2]?.date?.trim())
})

test("compareByArticleDate secondary sorts by platform then createdAt", () => {
  const a = { date: "2026-07-18", platformId: "douyin", createdAt: 2 }
  const b = { date: "2026-07-18", platformId: "xiaohongshu", createdAt: 1 }
  const c = { date: "2026-07-18", platformId: "douyin", createdAt: 1 }
  assert.ok(compareByArticleDate(a, b) < 0)
  assert.ok(compareByArticleDate(c, a) < 0)
})
